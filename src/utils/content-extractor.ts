import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from 'defuddle/full';
import { sanitizeFileName } from './string-utils';
import { buildVariables, addSchemaOrgDataToVariables } from './shared';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';
import { AnyHighlightData, collapseGroupsForExport } from './highlighter';
import { generalSettings } from './storage-utils';

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

// Inline marks are inserted into the live DOM by the content script
// (highlight-marker.ts) BEFORE Defuddle runs, so by the time content reaches
// here it already has <mark> tags converted to ==…== in the markdown.
// This function only still handles the 'replace-content' behavior (where
// the article body is replaced with just the highlight contents) and the
// no-op cases.
function processHighlights(content: string, highlights: AnyHighlightData[]): string {
	if (!generalSettings.highlighterEnabled || !highlights?.length) return content;
	if (generalSettings.highlightBehavior === 'replace-content') {
		return highlights.map(highlight => highlight.content).join('');
	}
	return content;
}
