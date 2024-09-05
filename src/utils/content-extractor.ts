import { ExtractedContent } from '../types/types';
import { extractReadabilityContent, createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './obsidian-note-creator';
import dayjs from 'dayjs';

export async function extractPageContent(tabId: number): Promise<{
	content: string;
	selectedHtml: string;
	extractedContent: ExtractedContent;
} | null> {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, { action: "getPageContent" }, function(response) {
			if (response && response.content) {
				resolve({
					content: response.content,
					selectedHtml: response.selectedHtml,
					extractedContent: response.extractedContent
				});
			} else {
				resolve(null);
			}
		});
	});
}

export function getMetaContent(doc: Document, attr: string, value: string): string {
	const selector = `meta[${attr}]`;
	const element = Array.from(doc.querySelectorAll(selector))
		.find(el => el.getAttribute(attr)?.toLowerCase() === value.toLowerCase());
	return element ? element.getAttribute("content")?.trim() ?? "" : "";
}

export async function extractContentBySelector(tabId: number, selector: string): Promise<string> {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, { action: "extractContent", selector: selector }, function(response) {
			resolve(response ? response.content : '');
		});
	});
}

export async function replaceVariables(tabId: number, text: string, variables: { [key: string]: string }): Promise<string> {
	// Replace variables
	for (const [variable, replacement] of Object.entries(variables)) {
		text = text.replace(new RegExp(variable, 'g'), replacement);
	}

	// Replace selectors
	const selectorRegex = /{{selector:(.*?)}}/g;
	const matches = text.match(selectorRegex);
	
	if (matches) {
		for (const match of matches) {
			const selector = match.match(/{{selector:(.*?)}}/)![1];
			const content = await extractContentBySelector(tabId, selector);
			text = text.replace(match, content);
		}
	}
	
	return text;
}

export async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent, currentUrl: string) {
	const readabilityArticle = extractReadabilityContent(content);
	if (!readabilityArticle) {
		console.error('Failed to parse content with Readability');
		return null;
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');

	// Define preset variables with fallbacks
	const title =
		getMetaContent(doc, "property", "og:title")
		|| getMetaContent(doc, "name", "twitter:title")
		|| doc.querySelector('title')?.textContent?.trim() || '';

	const noteName = sanitizeFileName(title);

	const author =
		getMetaContent(doc, "name", "author")
		|| getMetaContent(doc, "property", "author")
		|| getMetaContent(doc, "name", "twitter:creator")
		|| getMetaContent(doc, "property", "og:site_name")
		|| getMetaContent(doc, "name", "application-name")
		|| getMetaContent(doc, "name", "copyright")
		|| '';

	const description =
		getMetaContent(doc, "name", "description")
		|| getMetaContent(doc, "property", "description")
		|| getMetaContent(doc, "property", "og:description")
		|| getMetaContent(doc, "name", "twitter:description")
		|| '';

	const domain = new URL(currentUrl).hostname.replace(/^www\./, '');

	const image =
		getMetaContent(doc, "property", "og:image")
		|| getMetaContent(doc, "name", "twitter:image")
		|| '';

	const timeElement = doc.querySelector("time");
	const publishedDate = 
		getMetaContent(doc, "property", "article:published_time")
		|| timeElement?.getAttribute("datetime");
	const published = publishedDate ? `${convertDate(new Date(publishedDate))}` : "";

	const site =
		getMetaContent(doc, "property", "og:site_name")
		|| getMetaContent(doc, "name", "application-name")
		|| getMetaContent(doc, "name", "copyright")
		|| '';

	const markdownBody = createMarkdownContent(content, currentUrl, selectedHtml);

	const currentVariables: { [key: string]: string } = {
		'{{author}}': author,
		'{{content}}': markdownBody,
		'{{description}}': description,
		'{{domain}}': domain,
		'{{image}}': image,
		'{{noteName}}': noteName,
		'{{published}}': published,
		'{{site}}': site,
		'{{title}}': title, //todo: fix this because it's bein overwitten
		'{{pageTitle}}': title,
		'{{today}}': convertDate(new Date()),
		'{{url}}': currentUrl
	};

	// Add extracted content to variables
	Object.entries(extractedContent).forEach(([key, value]) => {
		currentVariables[`{{${key}}}`] = value;
	});

	// Add all meta tags to variables
	doc.querySelectorAll('meta').forEach(meta => {
		const name = meta.getAttribute('name');
		const property = meta.getAttribute('property');
		const content = meta.getAttribute('content');

		if (name && content) {
			currentVariables[`{{meta:name:${name}}}`] = content;
		}
		if (property && content) {
			currentVariables[`{{meta:property:${property}}}`] = content;
		}
	});

	return {
		noteName,
		currentVariables
	};
}

function convertDate(date: Date): string {
	return dayjs(date).format('YYYY-MM-DD');
}