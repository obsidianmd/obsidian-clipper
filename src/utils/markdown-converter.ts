import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';
import { MathMLToLaTeX } from 'mathml-to-latex';

export function createMarkdownContent(content: string, url: string, selectedHtml: string, skipReadability: boolean = false): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');

	const baseUrl = new URL(url);

	function makeUrlAbsolute(element: Element, attributeName: string) {
		const attributeValue = element.getAttribute(attributeName);
		if (attributeValue) {
			if (attributeValue.startsWith('chrome-extension://')) {
				// Remove the chrome-extension:// part and everything up to the next slash
				const path = attributeValue.split('/').slice(3).join('/');
				const newUrl = new URL(path, baseUrl).href;
				element.setAttribute(attributeName, newUrl);
			} else if (!attributeValue.startsWith('http') && !attributeValue.startsWith('data:') && !attributeValue.startsWith('#') && !attributeValue.startsWith('mailto:')) {
				const newUrl = new URL(attributeValue, baseUrl).href;
				element.setAttribute(attributeName, newUrl);
			}
		}
	}

	function processUrls(htmlContent: string): string {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = htmlContent;
		
		// Handle relative URLs for both images and links
		tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src'));
		tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href'));
		
		return tempDiv.innerHTML;
	}

	let markdownContent: string;

	if (selectedHtml) {
		// If there's selected HTML, use it directly
		markdownContent = processUrls(selectedHtml);
	} else if (skipReadability) {
		// If skipping Readability, process the full content
		markdownContent = processUrls(content);
	} else {
		// If no selection and not skipping Readability, use Readability
		const readabilityArticle = new Readability(doc,{keepClasses:true}).parse();
		if (!readabilityArticle) {
			console.error('Failed to parse content with Readability');
			return '';
		}
		markdownContent = processUrls(readabilityArticle.content);
	}

	const turndownService = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
		emDelimiter: '*',
	});

	turndownService.use(gfm);

	turndownService.remove(['style', 'script']);

	// Keep iframes, video, audio, sup, and sub elements
	// @ts-ignore
	turndownService.keep(['iframe', 'video', 'audio', 'sup', 'sub', 'svg', 'math']);

	// Custom rule to handle bullet lists without extra spaces
	turndownService.addRule('listItem', {
		filter: 'li',
		replacement: function (content: string, node: Node, options: TurndownService.Options) {
			content = content.trim();
			let prefix = options.bulletListMarker + ' ';
			let parent = node.parentNode;
			if (parent instanceof HTMLOListElement) {
				let start = parent.getAttribute('start');
				let index = Array.from(parent.children).indexOf(node as HTMLElement) + 1;
				prefix = (start ? Number(start) + index - 1 : index) + '. ';
			}
			return prefix + content + '\n';
		}
	});

	// Custom rule to handle figures
	turndownService.addRule('figure', {
		filter: 'figure',
		replacement: function(content, node) {
			const figure = node as HTMLElement;
			const img = figure.querySelector('img');
			const figcaption = figure.querySelector('figcaption');
			
			if (!img) return content;

			const alt = img.getAttribute('alt') || '';
			const src = img.getAttribute('src') || '';
			let caption = figcaption ? figcaption.textContent?.trim() || '' : '';

			// Check if there's a source attribution in the caption
			const attribution = figcaption?.querySelector('.attribution');
			if (attribution) {
				const sourceLink = attribution.querySelector('a');
				if (sourceLink) {
					const sourceText = sourceLink.textContent?.trim() || '';
					const sourceUrl = sourceLink.getAttribute('href') || '';
					caption = caption.replace(attribution.textContent || '', '').trim();
					caption += ` [${sourceText}](${sourceUrl})`;
				}
			}

			return `![${alt}](${src})\n\n${caption}`;
		}
	});

	// Use Obsidian format for YouTube embeds and tweets
	turndownService.addRule('embedToMarkdown', {
		filter: function (node: Node): boolean {
			if (node instanceof HTMLIFrameElement) {
				const src = node.getAttribute('src');
				return !!src && (
					!!src.match(/(?:youtube\.com|youtu\.be)/) ||
					!!src.match(/(?:twitter\.com|x\.com)/)
				);
			}
			return false;
		},
		replacement: function (content: string, node: Node): string {
			if (node instanceof HTMLIFrameElement) {
				const src = node.getAttribute('src');
				if (src) {
					const youtubeMatch = src.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/);
					if (youtubeMatch && youtubeMatch[1]) {
						return `![](https://www.youtube.com/watch?v=${youtubeMatch[1]})`;
					}
					const tweetMatch = src.match(/(?:twitter\.com|x\.com)\/.*?(?:status|statuses)\/(\d+)/);
					if (tweetMatch && tweetMatch[1]) {
						return `![](https://x.com/i/status/${tweetMatch[1]})`;
					}
				}
			}
			return content;
		}
	});

	turndownService.addRule('highlight', {
		filter: 'mark',
		replacement: function(content) {
			return '==' + content + '==';
		}
	});

	turndownService.addRule('strikethrough', {
		filter: (node: Node) => 
			node.nodeName === 'DEL' || 
			node.nodeName === 'S' || 
			node.nodeName === 'STRIKE',
		replacement: function(content) {
			return '~~' + content + '~~';
		}
	});

	// Add a new custom rule for complex link structures
	turndownService.addRule('complexLinkStructure', {
		filter: function (node, options) {
			return (
				node.nodeName === 'A' &&
				node.childNodes.length > 1 &&
				Array.from(node.childNodes).some(child => ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(child.nodeName))
			);
		},
		replacement: function (content, node, options) {
			if (!(node instanceof HTMLElement)) return content;
			
			const href = node.getAttribute('href');
			const title = node.getAttribute('title');
			
			// Extract the heading
			const headingNode = node.querySelector('h1, h2, h3, h4, h5, h6');
			const headingContent = headingNode ? turndownService.turndown(headingNode.innerHTML) : '';
			
			// Remove the heading from the content
			if (headingNode) {
				headingNode.remove();
			}
			
			// Convert the remaining content
			const remainingContent = turndownService.turndown(node.innerHTML);
			
			// Construct the new markdown
			let markdown = `${headingContent}\n\n${remainingContent}\n\n`;
			if (href) {
				markdown += `[View original](${href})`;
				if (title) {
					markdown += ` "${title}"`;
				}
			}
			
			return markdown;
		}
	});

	function handleArXivEquation(table: Element): string {
		const mathElement = table.querySelector('math[alttext]');
		if (mathElement) {
			const alttext = mathElement.getAttribute('alttext');
			if (alttext) {
				// Check if it's an inline or block equation
				const isInline = table.classList.contains('ltx_eqn_inline');
				return isInline ? `$${alttext.trim()}$` : `\n\n$$$\n${alttext.trim()}\n$$$\n\n`;
			}
		}
		// If no math element with alttext is found, try to extract from the table content
		const equationContent = table.textContent?.trim() || '';
		if (equationContent) {
			return `\n\n$$$\n${equationContent}\n$$$\n\n`;
		}
		return '';
	}

	function formatArXivCitation(url: string): string {
		const match = url.match(/\/(\d+\.\d+)(v\d+)?$/);
		if (match) {
			const arxivId = match[1];
			const version = match[2] || '';
			return `[@https://arxiv.org/abs/${arxivId}${version}]`;
		}
		return `[@${url}]`;
	}

	turndownService.addRule('table', {
		filter: 'table',
		replacement: function(content: string, node: Node): string {
			if (!(node instanceof HTMLElement)) return content;

			// Check if it's an ArXiv equation table
			if (node.classList.contains('ltx_equation') || node.classList.contains('ltx_eqn_table')) {
				return handleArXivEquation(node);
			}

			// If it's not an ArXiv equation table, return the original content
			return content;
		}
	});

	function extractLatex(element: Element): string {
		// Check if the element is a <math> element and has an alttext attribute
		if (element.nodeName.toLowerCase() === 'math') {
			const alttext = element.getAttribute('alttext');
			if (alttext) {
				return alttext.trim();
			}
		}

		// If not, look for a nested <math> element with alttext
		const mathElement = element.querySelector('math[alttext]');
		if (mathElement) {
			const alttext = mathElement.getAttribute('alttext');
			if (alttext) {
				return alttext.trim();
			}
		}

		// Fallback to existing logic
		const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
		if (annotation?.textContent) {
			return annotation.textContent.trim();
		}

		const mathNode = element.nodeName.toLowerCase() === 'math' ? element : element.querySelector('math');
		if (mathNode) {
			return MathMLToLaTeX.convert(mathNode.outerHTML);
		}

		const imgNode = element.querySelector('img');
		return imgNode?.getAttribute('alt') || '';
	}


	turndownService.addRule('math', {
		filter: (node) => {
			return node.nodeName.toLowerCase() === 'math' || 
				(node instanceof Element && node.classList && 
				(node.classList.contains('mwe-math-element') || 
				node.classList.contains('mwe-math-fallback-image-inline') || 
				node.classList.contains('mwe-math-fallback-image-display')));
		},
		replacement: (content, node) => {
			if (!(node instanceof Element)) return content;

			let latex = extractLatex(node);

			// Remove leading and trailing whitespace
			latex = latex.trim();

			// Check if the math element is within a table
			const isInTable = node.closest('table') !== null;

			// Check if it's an inline or block math element
			if (!isInTable && (
				node.getAttribute('display') === 'block' || 
				node.classList.contains('mwe-math-fallback-image-display') || 
				(node.parentElement && node.parentElement.classList.contains('mwe-math-element') && 
				node.parentElement.previousElementSibling && 
				node.parentElement.previousElementSibling.nodeName.toLowerCase() === 'p')
			)) {
				return `\n\n$$$\n${latex}\n$$$\n\n`;
			} else {
				return `$${latex}$`;
			}
		}
	});

	turndownService.addRule('arXivEnumerate', {
		filter: (node) => {
			return node.nodeName === 'OL' && node.classList.contains('ltx_enumerate');
		},
		replacement: function(content, node) {
			if (!(node instanceof HTMLElement)) return content;
			
			const items = Array.from(node.children).map((item, index) => {
				if (item instanceof HTMLElement) {
					const itemContent = item.innerHTML.replace(/^<span class="ltx_tag ltx_tag_item">\d+\.<\/span>\s*/, '');
					return `${index + 1}. ${turndownService.turndown(itemContent)}`;
				}
				return '';
			});
			
			return '\n\n' + items.join('\n\n') + '\n\n';
		}
	});

	// Add this new rule before calling turndownService.turndown()
	turndownService.addRule('removeReportIssueButtons', {
		filter: function (node) {
			return (
				node.nodeName === 'BUTTON' &&
				node instanceof HTMLElement &&
				node.classList.contains('sr-only')
			);
		},
		replacement: function () {
			return ''; // Replace with an empty string, effectively removing the element
		}
	});

	let markdown = turndownService.turndown(markdownContent);

	// Remove the title from the beginning of the content if it exists
	const titleMatch = markdown.match(/^# .+\n+/);
	if (titleMatch) {
		markdown = markdown.slice(titleMatch[0].length);
	}

	return markdown.trim();
}
