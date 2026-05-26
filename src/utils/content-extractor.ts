import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from 'defuddle/full';
import Defuddle from 'defuddle';
import { sanitizeFileName } from './string-utils';
import { buildVariables } from './shared';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import { AnyHighlightData, TextHighlightData, HighlightData, collapseGroupsForExport } from './highlighter';
import { generalSettings } from './storage-utils';
import {
	wrapElementWithMark,
	wrapTextWithMark
} from './dom-utils';

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

/**
 * Initialize variables for the popup window
 * @param content defuddle html page
 * @param selectedHtml selected part of the page that was highlighted by the user
 * @param extractedContent defuddle extracted content
 * @param currentUrl url of the page
 * @param schemaOrgData schema org data
 * @param fullHtml clean, non-defuddled html page
 * @param highlights highlights that were made by the user
 * @param title title of the page
 * @param author author of the page
 * @param description description of the page
 * @param favicon favicon of the page
 * @param image image of the page
 * @param published publish date of the page
 * @param site site name of the page
 * @param wordCount word count of the page
 * @param language language of the page
 * @param metaTags meta tags of the page
 * @returns Object containing note name and variables for the popup
 */
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

		let highlightedDocument: HTMLElement | null = null;
		// Process highlights after getting the base content
		if (generalSettings.highlighterEnabled && generalSettings.highlightBehavior !== 'no-highlights' && highlights && highlights.length > 0) {
			if (generalSettings.highlightBehavior === 'replace-content') {
				content = highlights.map(highlight => highlight.content).join('');
			} else {
				highlightedDocument = processHighlights(fullHtml, highlights);
				content = highlightedDocument.outerHTML;
			}
		}

		// use defuddle to create markdown content
		if (highlightedDocument) {
			const defuddle = new Defuddle(highlightedDocument.ownerDocument!, { url: highlightedDocument.ownerDocument!.URL });

			const parseTimeout = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('parseAsync timeout')), 8000)
			);
			const defuddled = await Promise.race([defuddle.parseAsync(), parseTimeout])
				.catch(() => defuddle.parse());
		
			content = defuddled.content
		}

		const markdownBody = createMarkdownContent(content , currentUrl);

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

/**
 * Process highlights to be embedded in the original html page content
 * @param fullHtml cleaned and not defuddled html page
 * @param highlights array of highlights
 * @returns 
 * - html page element with highlights embedded in <mark> tags if highlightBehavior is 'highlight-inline'
 * - only html page element if highlightBehavior is 'replace-content'
 */
function processHighlights(fullHtml: string, highlights: AnyHighlightData[]): HTMLElement {
	debugLog('Highlights', 'Using content length:', fullHtml.length);
	// 1. Initialize the DOMParser
	const parser = new DOMParser();

	// 2. Parse the string into a new HTML Document
	const newParsedDoc = parser.parseFromString(fullHtml, 'text/html');

	// 3. Extract the root Node (the <html> element)
	const rootNode = newParsedDoc.documentElement;
	
	// First check if highlighter is enabled and we have highlights
	if (!generalSettings.highlighterEnabled || !highlights?.length) {
		return rootNode;
	}

	// Then check the behavior setting
	if (generalSettings.highlightBehavior === 'no-highlights') {
		return rootNode;
	}

	if (generalSettings.highlightBehavior === 'highlight-inline') {
		debugLog('Highlights', 'Processing highlights:', highlights.length);

		// Apply the exact same pipeline for drawing highlights on the webpage

		highlights.forEach((highlight) => {
			const container = rootNode.ownerDocument.evaluate(
				highlight.xpath,
				rootNode.ownerDocument,
				null,
				XPathResult.FIRST_ORDERED_NODE_TYPE,
				null
			).singleNodeValue as Element;

			if (container) {
				if (highlight.type === 'element') {
					wrapElementWithMark(container);
				} else {
					wrapTextWithMark(container, highlight as TextHighlightData);
				}
			}
		});
		return rootNode;
	}

	// Default fallback
	return rootNode;
}
