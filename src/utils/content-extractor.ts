import { ExtractedContent } from '../types/types';
import { extractReadabilityContent, createMarkdownContent } from './markdown-converter';
import { getFileName } from './obsidian-note-creator';
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
	const element = doc.querySelector(`meta[${attr}='${value}']`);
	return element ? element.getAttribute("content")!.trim() : "";
}

export async function extractContentBySelector(tabId: number, selector: string): Promise<string> {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, { action: "extractContent", selector: selector }, function(response) {
			resolve(response ? response.content : '');
		});
	});
}

export async function replaceSelectorsWithContent(tabId: number, text: string): Promise<string> {
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
	const { title: rawTitle, byline, excerpt, lang } = readabilityArticle;
	
	const currentTitle = rawTitle.replace(/"/g, "'");
	const noteName = getFileName(currentTitle);

	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');

	const author = byline || getMetaContent(doc, "name", "author") || getMetaContent(doc, "property", "author") || getMetaContent(doc, "name", "twitter:creator") || getMetaContent(doc, "property", "og:site_name");

	const description = excerpt || getMetaContent(doc, "name", "description") || getMetaContent(doc, "property", "description") || getMetaContent(doc, "property", "og:description");
	const image = getMetaContent(doc, "property", "og:image") || getMetaContent(doc, "name", "twitter:image");
	const language = lang;

	const timeElement = doc.querySelector("time");
	const publishedDate = timeElement?.getAttribute("datetime");
	const published = publishedDate ? `${convertDate(new Date(publishedDate))}` : "";

	const markdownBody = createMarkdownContent(content, currentUrl, selectedHtml);

	const currentVariables: { [key: string]: string } = {
		'{{title}}': currentTitle,
		'{{url}}': currentUrl,
		'{{published}}': published,
		'{{author}}': author ?? '',
		'{{today}}': convertDate(new Date()),
		'{{description}}': description ?? '',
		'{{domain}}': new URL(currentUrl).hostname,
		'{{image}}': image ?? '',
		'{{language}}': language ?? '',
		'{{content}}': markdownBody
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
		currentTitle,
		noteName,
		currentVariables
	};
}

function convertDate(date: Date): string {
	return dayjs(date).format('YYYY-MM-DD');
}