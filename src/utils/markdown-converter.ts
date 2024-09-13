import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { makeUrlAbsolute } from './string-utils';

export function createMarkdownContent(content: string, url: string, selectedHtml: string, skipReadability: boolean = false): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');

	const baseUrl = new URL(url);

	function processUrls(htmlContent: string): string {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = htmlContent;
		
		// Handle relative URLs for both images and links
		tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src', baseUrl));
		tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href', baseUrl));
		
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
	turndownService.remove(['button']);

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

	turndownService.addRule('figure', {
		filter: 'figure',
		replacement: function(content, node) {
			const figure = node as HTMLElement;
			const img = figure.querySelector('img');
			const figcaption = figure.querySelector('figcaption');
			
			if (!img) return content;

			const alt = img.getAttribute('alt') || '';
			const src = img.getAttribute('src') || '';
			let caption = '';

			if (figcaption) {
				const tagSpan = figcaption.querySelector('.ltx_tag_figure');
				const tagText = tagSpan ? tagSpan.textContent?.trim() : '';
				const captionText = figcaption.textContent?.replace(tagText || '', '').trim() || '';
				caption = `${tagText} ${captionText}`.trim();
			}

			// Convert math elements in the caption
			caption = caption.replace(/<math.*?>(.*?)<\/math>/g, (match, p1) => {
				const mathContent = extractLatex(new DOMParser().parseFromString(match, 'text/html').body.firstChild as Element);
				return `$${mathContent}$`;
			});

			// Handle references in the caption
			caption = caption.replace(/<a.*?>(.*?)<\/a>/g, (match, p1) => {
				const link = new DOMParser().parseFromString(match, 'text/html').body.firstChild as HTMLAnchorElement;
				const href = link.getAttribute('href') || '';
				return `[${p1}](${href})`;
			});

			return `![${alt}](${src})\n\n${caption}\n\n`;
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

	function handleNestedEquations(table: Element): string {
		const mathElements = table.querySelectorAll('math[alttext]');
		if (mathElements.length === 0) return '';

		return Array.from(mathElements).map(mathElement => {
			const alttext = mathElement.getAttribute('alttext');
			if (alttext) {
				// Check if it's an inline or block equation
				const isInline = mathElement.closest('.ltx_eqn_inline') !== null;
				return isInline ? `$${alttext.trim()}$` : `\n$$$\n${alttext.trim()}\n$$$`;
			}
			return '';
		}).join('\n\n');
	}

	turndownService.addRule('table', {
		filter: 'table',
		replacement: function(content: string, node: Node): string {
			if (!(node instanceof HTMLElement)) return content;

			// Check if it's an ArXiv equation table
			if (node.classList.contains('ltx_equation') || node.classList.contains('ltx_eqn_table')) {
				return handleNestedEquations(node);
			}

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
				return `\n$$$\n${latex}\n$$$\n`;
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

	turndownService.addRule('table', {
		filter: 'table',
		replacement: function(content: string, node: Node): string {
			if (!(node instanceof HTMLElement)) return content;

			// Check if it's an ArXiv equation table
			if (node.classList.contains('ltx_equation') || node.classList.contains('ltx_eqn_table')) {
				return handleNestedEquations(node);
			}

			return content;
		}
	});

	turndownService.addRule('removeHiddenElements', {
		filter: function (node) {
			return (
				node.style.display === 'none'
			);
		},
		replacement: function () {
			return '';
		}
	});

	// General removal rules for varous website elements
	turndownService.addRule('removals', {
		filter: function (node) {
			if (!(node instanceof HTMLElement)) return false;
			// Wikipedia edit buttons
			if (node.classList.contains('mw-editsection')) return true;
			// Wikipedia cite backlinks
			if (node.classList.contains('mw-cite-backlink')) return true;
			// Wikipedia infoboxes as they usually have colspans
			if (node.nodeName === 'TABLE' && node.classList.contains('infobox')) return true;
			// Reference numbers and anchor links
			if (node.classList.contains('ltx_role_refnum')) return true;
			if (node.classList.contains('ltx_tag_bibitem')) return true;
			if (node.id?.startsWith('fnref:')) return true;
			if (node.getAttribute('href')?.startsWith('#fnref:')) return true;
			if (node.classList.contains('footnote-backref')) return true;
			if (node.classList.contains('ref') && node.getAttribute('href')?.startsWith('#')) return true;
			if (node.classList.contains('anchor') && node.getAttribute('href')?.startsWith('#')) return true;
			
			return false;
		},
		replacement: function () {
			return '';
		}
	});

	// Update the citations rule
	turndownService.addRule('citations', {
		filter: (node: Node): boolean => {
			if (node instanceof Element) {
				return (
					(node.nodeName === 'SUP' && node.classList.contains('reference')) ||
					(node.nodeName === 'CITE' && node.classList.contains('ltx_cite')) ||
					(node.nodeName === 'SUP' && node.id.startsWith('fnref:'))
				);
			}
			return false;
		},
		replacement: (content, node) => {
			if (node instanceof HTMLElement) {
				if (node.nodeName === 'SUP' && node.classList.contains('reference')) {
					const links = node.querySelectorAll('a');
					const footnotes = Array.from(links).map(link => {
						const href = link.getAttribute('href');
						if (href) {
							let id = href.startsWith('#cite_note-') 
								? href.replace('#cite_note-', '')
								: href.startsWith('#fn:')
									? href.replace('#fn:', '')
									: href.split('#').pop() || '';
							id = id.replace('bib.', '').replace('bib', '');
							return `[^${id}]`;
						}
						return '';
					});
					return footnotes.join('');
				} else if (node.nodeName === 'CITE' && node.classList.contains('ltx_cite')) {
					const links = node.querySelectorAll('a');
					const footnotes = Array.from(links).map(link => {
						const href = link.getAttribute('href');
						if (href) {
							let id = href.startsWith('#bib.') 
								? href.replace('#bib.', '')
								: href.split('#').pop() || '';
							id = id.replace('bib.', '').replace('bib', '');
							return `[^${id}]`;
						}
						return '';
					});
					return footnotes.join('');
				} else if (node.nodeName === 'SUP' && node.id.startsWith('fnref:')) {
					const id = node.id.replace('fnref:', '');
					return `[^${id}]`;
				}
			}
			return content;
		}
	});

	// Update the reference list rule
	turndownService.addRule('referenceList', {
		filter: (node: Node): boolean => {
			if (node instanceof HTMLElement) {
				return (
					(node.nodeName === 'OL' && node.classList.contains('references')) ||
					(node.nodeName === 'UL' && node.classList.contains('ltx_biblist')) ||
					(node.nodeName === 'OL' && node.parentElement?.classList?.contains('footnotes') === true)
				);
			}
			return false;
		},
		replacement: (content, node) => {
			if (node instanceof HTMLElement) {
				const references = Array.from(node.children).map(li => {
					let id = li.id.replace('cite_note-', '').replace('bib.', '').replace('bib', '').replace('fn:', '');
					const referenceContent = turndownService.turndown(li.innerHTML);
					// Remove the backlink from the footnote content
					const cleanedContent = referenceContent.replace(/\s*↩︎$/, '');
					return `[^${id}]: ${cleanedContent.trim()}`;
				});
				return '\n\n' + references.join('\n\n') + '\n\n';
			}
			return content;
		}
	});

	turndownService.addRule('wikiLinks', {
		filter: (node: Node): boolean => {
			if (node instanceof Element) {
				const href = node.getAttribute('href');
				return node.nodeName === 'A' && !!href && href.includes('/wiki/');
			}
			return false;
		},
		replacement: (content, node) => {
			if (node instanceof HTMLElement) {
				const href = node.getAttribute('href');
				const title = node.getAttribute('title');
				if (href && title) {
					return `[${title}](https://en.wikipedia.org${href})`;
				}
			}
			return content;
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
