import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';

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
		const readabilityArticle = new Readability(doc).parse();
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

	// Keep iframes, video, and audio elements
	turndownService.keep(['iframe', 'video', 'audio']);

	// Custom rule to keep SVG elements
	turndownService.addRule('keepSvg', {
		filter: function(node: Node): boolean {
			return node.nodeName.toLowerCase() === 'svg';
		},
		replacement: function(content: string, node: Node): string {
			if (node instanceof SVGElement) {
				return node.outerHTML;
			}
			return content;
		}
	});

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

	let markdown = turndownService.turndown(markdownContent);

	// Remove the title from the beginning of the content if it exists
	const titleMatch = markdown.match(/^# .+\n+/);
	if (titleMatch) {
		markdown = markdown.slice(titleMatch[0].length);
	}

	return markdown.trim();
}

export function extractReadabilityContent(content: string): ReturnType<Readability['parse']> {
	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');
	const reader = new Readability(doc);
	return reader.parse();
}