import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from 'defuddle/full';
import { sanitizeFileName } from './string-utils';
import { buildVariables, addSchemaOrgDataToVariables } from './shared';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';
import { AnyHighlightData, TextHighlightData, HighlightData, collapseGroupsForExport } from './highlighter';
import { generalSettings } from './storage-utils';
import {
	getElementByXPath,
	wrapElementWithMark,
	wrapTextWithMark
} from './dom-utils';

// Define ElementHighlightData type inline since it's not exported from highlighter.ts
interface ElementHighlightData extends HighlightData {
	type: 'element';
}

function canHighlightElement(element: Element): boolean {
	// List of elements that can't be nested inside mark
	const unsupportedElements = ['img', 'video', 'audio', 'iframe', 'canvas', 'svg', 'math', 'table'];
	
	// Check if the element contains any unsupported elements
	const hasUnsupportedElements = unsupportedElements.some(tag => 
		element.getElementsByTagName(tag).length > 0
	);
	
	// Check if the element itself is an unsupported type
	const isUnsupportedType = unsupportedElements.includes(element.tagName.toLowerCase());
	
	return !hasUnsupportedElements && !isUnsupportedType;
}

function stripHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	return doc.body.textContent || '';
}

function normalizeText(html: string): string {
	return stripHtml(html).replace(/\s+/g, ' ').trim();
}

interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: ExtractedContent;
	schemaOrgData: any;
	fullHtml: string;
	highlights: AnyHighlightData[];
	title: string;
	author: string;
	description: string;
	domain: string;
	favicon: string;
	image: string;
	parseTime: number;
	published: string;
	site: string;
	wordCount: number;
	language: string;
	metaTags: { name?: string | null; property?: string | null; content: string | null }[];
}

async function sendExtractRequest(tabId: number): Promise<ContentResponse> {
	const response = await browser.runtime.sendMessage({
		action: "sendMessageToTab",
		tabId: tabId,
		message: { action: "getPageContent" }
	}) as ContentResponse & { success?: boolean; error?: string };

	// Check for explicit error from background script
	if (response && 'success' in response && !response.success && response.error) {
		throw new Error(response.error);
	}

	if (response && response.content) {
		// Ensure highlights are of the correct type
		if (response.highlights && Array.isArray(response.highlights)) {
			response.highlights = response.highlights.map((highlight: string | AnyHighlightData) => {
				if (typeof highlight === 'string') {
					return {
						type: 'text',
						id: Date.now().toString(),
						xpath: '',
						content: `<div>` + highlight + `</div>`,
						startOffset: 0,
						endOffset: highlight.length
					};
				}
				return highlight as AnyHighlightData;
			});
		} else {
			response.highlights = [];
		}
		return response;
	}

	throw new Error('No content received from page');
}

export async function extractPageContent(tabId: number): Promise<ContentResponse | null> {
	try {
		return await sendExtractRequest(tabId);
	} catch (firstError) {
		// First attempt failed — this commonly happens on Safari after an
		// extension update when a zombie content script (runtime invalidated)
		// responded to ping, preventing re-injection. Force a fresh injection
		// so the new generation's listener takes over, then retry.
		debugLog('Clipper', 'First extraction attempt failed, retrying...', firstError);
		try {
			await browser.runtime.sendMessage({ action: "forceInjectContentScript", tabId });
		} catch {
			// If force-inject fails, proceed anyway — the retry may still work.
		}
		try {
			return await sendExtractRequest(tabId);
		} catch (retryError) {
			console.error('[Obsidian Clipper] Extraction failed after retry:', retryError);
			throw new Error('Web Clipper was not able to start. Please try reloading the page.');
		}
	}
}

export async function initializePageContent(
	content: string,
	selectedHtml: string,
	extractedContent: ExtractedContent,
	currentUrl: string,
	schemaOrgData: any,
	fullHtml: string,
	highlights: AnyHighlightData[],
	title: string,
	author: string,
	description: string,
	favicon: string,
	image: string,
	published: string,
	site: string,
	wordCount: number,
	language: string,
	metaTags: { name?: string | null; property?: string | null; content: string | null }[]
) {
	try {
		currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

		let selectedMarkdown = '';
		if (selectedHtml) {
			content = selectedHtml;
			selectedMarkdown = createMarkdownContent(selectedHtml, currentUrl);
		}

		// Process highlights after getting the base content
		if (generalSettings.highlighterEnabled && generalSettings.highlightBehavior !== 'no-highlights' && highlights && highlights.length > 0) {
			content = processHighlights(content, highlights);
		}

		const markdownBody = createMarkdownContent(content, currentUrl);

		const highlightsData = collapseGroupsForExport(highlights, c => createMarkdownContent(c, currentUrl));

		const noteName = sanitizeFileName(title);

		const currentVariables = buildVariables({
			title,
			author,
			content: markdownBody,
			contentHtml: content,
			url: currentUrl,
			fullHtml,
			description,
			favicon,
			image,
			published,
			site,
			language,
			wordCount,
			selection: selectedMarkdown,
			selectionHtml: selectedHtml,
			highlights: highlights.length > 0 ? JSON.stringify(highlightsData) : '',
			schemaOrgData,
			metaTags,
			extractedContent,
		});

		debugLog('Variables', 'Available variables:', currentVariables);

		return {
			noteName,
			currentVariables
		};
	} catch (error: unknown) {
		console.error('Error in initializePageContent:', error);
		if (error instanceof Error) {
			throw new Error(`Unable to initialize page content: ${error.message}`);
		} else {
			throw new Error('Unable to initialize page content: Unknown error');
		}
	}
}

function processHighlights(content: string, highlights: AnyHighlightData[]): string {
	// First check if highlighter is enabled and we have highlights
	if (!generalSettings.highlighterEnabled || !highlights?.length) {
		return content;
	}

	// Then check the behavior setting
	if (generalSettings.highlightBehavior === 'no-highlights') {
		return content;
	}

	if (generalSettings.highlightBehavior === 'replace-content') {
		return highlights.map(highlight => highlight.content).join('');
	}

	if (generalSettings.highlightBehavior === 'highlight-inline') {
		debugLog('Highlights', 'Using content length:', content.length);

		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');
		const tempDiv = doc.body;

		const textHighlights = filterAndSortHighlights(highlights);
		debugLog('Highlights', 'Processing highlights:', textHighlights.length);

		for (const highlight of textHighlights) {
			processHighlight(highlight, tempDiv as HTMLDivElement);
		}

		// Serialize back to HTML
		const serializer = new XMLSerializer();
		let result = '';
		Array.from(tempDiv.childNodes).forEach(node => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				result += serializer.serializeToString(node);
			} else if (node.nodeType === Node.TEXT_NODE) {
				result += node.textContent;
			}
		});
		
		return result;
	}

	// Default fallback
	return content;
}

function filterAndSortHighlights(highlights: AnyHighlightData[]): (TextHighlightData | ElementHighlightData)[] {
	return highlights
		.filter((h): h is (TextHighlightData | ElementHighlightData) => {
			if (h.type === 'text') {
				return !!(h.xpath?.trim() || h.content?.trim());
			}
			if (h.type === 'element' && h.xpath?.trim()) {
				const element = getElementByXPath(h.xpath);
				return element ? canHighlightElement(element) : false;
			}
			return false;
		})
		.sort((a, b) => {
			if (a.xpath && b.xpath) {
				const elementA = getElementByXPath(a.xpath);
				const elementB = getElementByXPath(b.xpath);
				if (elementA === elementB && a.type === 'text' && b.type === 'text') {
					return b.startOffset - a.startOffset;
				}
			}
			return 0;
		});
}

function processHighlight(highlight: TextHighlightData | ElementHighlightData, tempDiv: HTMLDivElement) {
	try {
		if (highlight.xpath) {
			processXPathHighlight(highlight, tempDiv);
		} else {
			processContentBasedHighlight(highlight, tempDiv);
		}
	} catch (error) {
		debugLog('Highlights', 'Error processing highlight:', error);
	}
}

function processXPathHighlight(highlight: TextHighlightData | ElementHighlightData, tempDiv: HTMLDivElement) {
	const element = document.evaluate(
		highlight.xpath,
		tempDiv,
		null,
		XPathResult.FIRST_ORDERED_NODE_TYPE,
		null
	).singleNodeValue as Element;

	if (element) {
		if (highlight.type === 'element') {
			wrapElementWithMark(element);
		} else {
			wrapTextWithMark(element, highlight as TextHighlightData);
		}
		return;
	}

	// Xpath didn't resolve (common when the highlight was created in a
	// different mode — reader vs live — with a different DOM structure).
	// Fall back to finding the highlight's text in the article content.
	debugLog('Highlights', 'Xpath not found, falling back to text search:', highlight.xpath);
	processContentBasedHighlight(highlight, tempDiv);
}

function processContentBasedHighlight(highlight: TextHighlightData | ElementHighlightData, tempDiv: HTMLDivElement) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(highlight.content, 'text/html');
	const contentDiv = doc.body;

	// Serialize the inner content
	const serializer = new XMLSerializer();
	let innerContent = '';

	if (contentDiv.children.length === 1 && contentDiv.firstElementChild?.tagName === 'DIV') {
		Array.from(contentDiv.firstElementChild.childNodes).forEach(node => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				innerContent += serializer.serializeToString(node);
			} else if (node.nodeType === Node.TEXT_NODE) {
				innerContent += node.textContent;
			}
		});
	} else {
		Array.from(contentDiv.childNodes).forEach(node => {
			if (node.nodeType === Node.ELEMENT_NODE) {
				innerContent += serializer.serializeToString(node);
			} else if (node.nodeType === Node.TEXT_NODE) {
				innerContent += node.textContent;
			}
		});
	}

	const paragraphs = Array.from(contentDiv.querySelectorAll('p'));
	if (paragraphs.length) {
		processContentParagraphs(paragraphs, tempDiv);
		return;
	}

	// For non-paragraph blocks (td, li, blockquote, etc.), match by
	// element type to avoid false positives when the same text appears
	// in a different element (e.g., "iPhone 16e" in a <p> AND a <td>).
	const sourceRoot = contentDiv.firstElementChild;
	const sourceTag = sourceRoot?.tagName?.toLowerCase();
	if (sourceTag && sourceTag !== 'p') {
		const searchText = normalizeText(highlight.content);
		const candidates = Array.from(tempDiv.querySelectorAll(sourceTag));
		for (const candidate of candidates) {
			const candidateText = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
			if (candidateText === searchText) {
				wrapElementWithMark(candidate);
				return;
			}
			if (candidateText.includes(searchText)) {
				processInlineContent(searchText, candidate as HTMLElement);
				return;
			}
		}
	}

	processInlineContent(innerContent, tempDiv);
}

function processContentParagraphs(sourceParagraphs: Element[], tempDiv: HTMLDivElement) {
	sourceParagraphs.forEach(sourceParagraph => {
		const sourceText = stripHtml(sourceParagraph.outerHTML).trim();
		debugLog('Highlights', 'Looking for paragraph:', sourceText);
		
		const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
		for (const targetParagraph of paragraphs) {
			const targetText = stripHtml(targetParagraph.outerHTML).trim();
			
			if (targetText === sourceText) {
				debugLog('Highlights', 'Found matching paragraph:', targetParagraph.outerHTML);
				wrapElementWithMark(targetParagraph);
				break;
			}
		}
	});
}

function processInlineContent(content: string, tempDiv: HTMLElement) {
	const searchText = stripHtml(content).trim();
	debugLog('Highlights', 'Searching for text:', searchText);
	
	const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
	
	let node;
	while (node = walker.nextNode() as Text) {
		const nodeText = node.textContent || '';
		const index = nodeText.indexOf(searchText);
		
		if (index !== -1) {
			debugLog('Highlights', 'Found matching text in node:', {
				text: nodeText,
				index: index
			});
			
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + searchText.length);
			
			const mark = document.createElement('mark');
			range.surroundContents(mark);
			debugLog('Highlights', 'Created mark element:', mark.outerHTML);
			break;
		}
	}
}
