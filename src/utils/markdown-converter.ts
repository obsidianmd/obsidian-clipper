import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';

export function createMarkdownContent(content: string, url: string, selectedHtml: string): string {
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

	let markdownContent: string;

	if (selectedHtml) {
		// If there's selected HTML, use it directly
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = selectedHtml;
		
		// Handle relative URLs for both images and links in the selection
		tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src'));
		tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href'));
		
		markdownContent = tempDiv.innerHTML;
	} else {
		// If no selection, use Readability
		const readabilityArticle = new Readability(doc).parse();
		if (!readabilityArticle) {
			console.error('Failed to parse content with Readability');
			return '';
		}
		const { content: readableContent } = readabilityArticle;
		
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = readableContent;
		
		// Handle relative URLs for both images and links in the full content
		tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src'));
		tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href'));
		
		markdownContent = tempDiv.innerHTML;
	}

	const turndownService = new TurndownService({
		headingStyle: 'atx',
		hr: '---',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced',
		emDelimiter: '*',
	});

	turndownService.use(gfm);

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