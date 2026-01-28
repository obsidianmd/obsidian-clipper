/**
 * Android Bundle Entry Point
 *
 * This file exports a global extraction function that can be called from
 * Android WebView via JavaScript injection. It wraps Defuddle and Turndown
 * to provide the same content extraction capabilities as the browser extension.
 */

import Defuddle from 'defuddle';
import { createMarkdownContent } from './utils/markdown-converter';
import { getDomain } from './utils/string-utils';

export interface AndroidExtractedContent {
	title: string;
	author: string;
	content: string;
	contentMarkdown: string;
	description: string;
	url: string;
	domain: string;
	favicon: string;
	image: string;
	published: string;
	site: string;
	wordCount: number;
	schemaOrgData: any;
	metaTags: { name?: string | null; property?: string | null; content: string | null }[];
}

/**
 * Wait for page to stabilize (DOM stops changing)
 */
function waitForPageStable(timeout = 5000, settleTime = 500): Promise<void> {
	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout>;
		let overallTimer: ReturnType<typeof setTimeout>;

		const observer = new MutationObserver(() => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				observer.disconnect();
				clearTimeout(overallTimer);
				console.log('[ObsidianClipper] Page stabilized after mutations stopped');
				resolve();
			}, settleTime);
		});

		// Start observing
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true
		});

		// Initial timer in case no mutations happen
		timer = setTimeout(() => {
			observer.disconnect();
			clearTimeout(overallTimer);
			console.log('[ObsidianClipper] Page stabilized (no initial mutations)');
			resolve();
		}, settleTime);

		// Overall timeout
		overallTimer = setTimeout(() => {
			observer.disconnect();
			clearTimeout(timer);
			console.log('[ObsidianClipper] Page stabilization timeout reached');
			resolve();
		}, timeout);
	});
}

/**
 * Extract page content using Defuddle and convert to markdown
 */
function extract(): AndroidExtractedContent {
	const url = document.URL;

	// Debug: log what we're working with
	console.log('[ObsidianClipper] document.body children:', document.body?.children?.length);
	console.log('[ObsidianClipper] document.body innerHTML length:', document.body?.innerHTML?.length);

	// Use Defuddle to parse the page
	const defuddled = new Defuddle(document, { url }).parse();

	console.log('[ObsidianClipper] Defuddle result content length:', defuddled.content?.length);

	// Convert content to markdown
	const contentMarkdown = createMarkdownContent(defuddled.content, url);

	return {
		title: defuddled.title || document.title || '',
		author: defuddled.author || '',
		content: defuddled.content || '',
		contentMarkdown: contentMarkdown,
		description: defuddled.description || '',
		url: url,
		domain: getDomain(url),
		favicon: defuddled.favicon || '',
		image: defuddled.image || '',
		published: defuddled.published || '',
		site: defuddled.site || '',
		wordCount: defuddled.wordCount || 0,
		schemaOrgData: defuddled.schemaOrgData || null,
		metaTags: defuddled.metaTags || []
	};
}

/**
 * Extract selected text as HTML and markdown
 */
function extractSelection(): { html: string; markdown: string } | null {
	const selection = window.getSelection();

	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return null;
	}

	const range = selection.getRangeAt(0);
	const clonedSelection = range.cloneContents();
	const div = document.createElement('div');
	div.appendChild(clonedSelection);
	const html = div.innerHTML;

	if (!html) {
		return null;
	}

	const markdown = createMarkdownContent(html, document.URL);

	return {
		html,
		markdown
	};
}

/**
 * Extract with page stabilization - waits for DOM to settle before extracting
 */
async function extractWithStabilization(): Promise<AndroidExtractedContent> {
	await waitForPageStable();
	return extract();
}

// Expose to global scope for Android WebView access
declare global {
	interface Window {
		ObsidianClipper: {
			extract: typeof extract;
			extractAsync: typeof extractWithStabilization;
			extractSelection: typeof extractSelection;
		};
	}
}

window.ObsidianClipper = {
	extract,
	extractAsync: extractWithStabilization,
	extractSelection
};
