import { ExtractedContent } from '../types/types';

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