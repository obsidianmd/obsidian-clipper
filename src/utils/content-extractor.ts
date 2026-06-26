import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from 'defuddle/full';
import { sanitizeFileName } from './string-utils';
import { buildVariables, addSchemaOrgDataToVariables } from './shared';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import { getMessage } from './i18n';
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

// Convert non-YouTube/non-Twitter video and iframe embeds into Obsidian-friendly
// markdown so they don't disappear when Obsidian strips raw HTML. YouTube and
// Twitter/X are already handled by defuddle's embedToMarkdown rule, so we skip
// those here. Supported platforms: Bilibili, Reddit, Instagram, Vimeo, TikTok,
// Dailymotion, Facebook, plus generic <video> elements and unknown iframes.
export function convertMediaEmbeds(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	let modified = false;

	// --- <iframe> embeds ---
	const iframes = Array.from(doc.querySelectorAll('iframe'));
	for (const iframe of iframes) {
		const src = (iframe.getAttribute('src') || '').trim();
		if (!src) {
			iframe.remove();
			modified = true;
			continue;
		}

		// Skip YouTube/Twitter — defuddle already converts these to ![](...)
		if (/(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/i.test(src) ||
			/(?:twitter\.com|x\.com)/i.test(src)) {
			continue;
		}

		const replacement = iframeToMarkdown(src);
		if (replacement) {
			iframe.replaceWith(doc.createTextNode(replacement));
			modified = true;
		}
	}

	// --- <video> elements ---
	const videos = Array.from(doc.querySelectorAll('video'));
	for (const video of videos) {
		// Try to find a usable source URL
		let src = (video.getAttribute('src') || '').trim();
		if (!src) {
			const source = video.querySelector('source');
			if (source) src = (source.getAttribute('src') || '').trim();
		}
		// Prefer the poster image as the displayed embed, with the video src as a link
		const poster = (video.getAttribute('poster') || '').trim();

		if (src || poster) {
			const parts: string[] = [];
			if (poster) {
				parts.push(`![](${poster})`);
			}
			if (src) {
				parts.push(`[▶ ${getMessage('videoLabel')}](${src})`);
			}
			video.replaceWith(doc.createTextNode('\n' + parts.join('\n') + '\n'));
			modified = true;
		}
	}

	if (!modified) return html;

	const serializer = new XMLSerializer();
	let result = '';
	Array.from(doc.body.childNodes).forEach(node => {
		if (node.nodeType === Node.ELEMENT_NODE) {
			result += serializer.serializeToString(node);
		} else if (node.nodeType === Node.TEXT_NODE) {
			result += node.textContent;
		}
	});
	return result;
}

// Map a known-platform iframe src to an Obsidian-friendly markdown link.
// Returns '' when no conversion applies (caller leaves the iframe untouched
// — defuddle will keep the raw HTML, which is still better than dropping it).
function iframeToMarkdown(src: string): string {
	try {
		const url = new URL(src);
		const host = url.hostname.toLowerCase();
		const path = url.pathname;
		const q = url.searchParams;

		// Bilibili: player.bilibili.com/player.html?bvid=XXX or ?aid=XXX
		if (host.includes('bilibili.com')) {
			const bvid = q.get('bvid');
			if (bvid) return `\n![](https://www.bilibili.com/video/${bvid})\n`;
			const aid = q.get('aid');
			if (aid) return `\n![](https://www.bilibili.com/video/av${aid})\n`;
			// Some embeds use /video/BVxxx in the path
			const pathMatch = path.match(/\/video\/(BV[\w]+)/);
			if (pathMatch) return `\n![](https://www.bilibili.com/video/${pathMatch[1]})\n`;
		}

		// Reddit: embed.reddit.com/r/<sub>/comments/<id>/<slug>/?context=...
		if (host.includes('reddit.com') || host.includes('redditmedia.com')) {
			// /r/sub/comments/id/slug/
			const m = path.match(/\/r\/([^/]+)\/comments\/([a-z0-9]+)\//i);
			if (m) return `\n![](https://www.reddit.com/r/${m[1]}/comments/${m[2]})\n`;
			// /comments/<id>/...
			const m2 = path.match(/\/comments\/([a-z0-9]+)\//i);
			if (m2) return `\n![](https://www.reddit.com/comments/${m2[1]})\n`;
		}

		// Instagram: instagram.com/p/<id>/embed or /reel/<id>/embed
		if (host.includes('instagram.com')) {
			const m = path.match(/\/(p|reel|reels)\/([^/]+)/i);
			if (m) return `\n![](https://www.instagram.com/${m[1]}/${m[2]})\n`;
		}

		// Vimeo: player.vimeo.com/video/<id>
		if (host.includes('vimeo.com')) {
			const m = path.match(/\/video\/(\d+)/);
			if (m) return `\n![](https://vimeo.com/${m[1]})\n`;
		}

		// TikTok: tiktok.com/embed/v2/<id> or player.tiktok.com
		if (host.includes('tiktok.com')) {
			const m = path.match(/\/embed\/v?2?\/(\d+)/i);
			if (m) return `\n![](https://www.tiktok.com/video/${m[1]})\n`;
		}

		// Dailymotion: dailymotion.com/embed/video/<id>
		if (host.includes('dailymotion.com')) {
			const m = path.match(/\/embed\/video\/([^/]+)/);
			if (m) return `\n![](https://www.dailymotion.com/video/${m[1]})\n`;
		}

		// Facebook: facebook.com/plugins/video.php?href=...
		if (host.includes('facebook.com') || host.includes('fbcdn')) {
			const href = q.get('href');
			if (href) return `\n![](${href})\n`;
		}

		// Generic fallback: link to the iframe src so it's never invisible
		if (src.startsWith('http')) {
			return `\n[▶ ${getMessage('videoLabel')}](${src})\n`;
		}
	} catch {
		// Invalid URL — fall through
	}
	return '';
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
			selectedMarkdown = createMarkdownContent(convertMediaEmbeds(selectedHtml), currentUrl);
		}

		// Process highlights after getting the base content
		if (generalSettings.highlighterEnabled && generalSettings.highlightBehavior !== 'no-highlights' && highlights && highlights.length > 0) {
			content = processHighlights(content, highlights);
		}

		// Convert video/iframe embeds (Bilibili, Reddit, Instagram, Vimeo, etc.)
		// to markdown links so they survive Obsidian's HTML sanitization.
		content = convertMediaEmbeds(content);

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
