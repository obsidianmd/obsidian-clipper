import browser from './browser-polyfill';
import { getElementXPath, getElementByXPath, setElementHTML } from './dom-utils';
import {
	handleMouseUp,
	planHighlightOverlayRects,
	removeExistingHighlights,
	handleTouchStart,
	handleTouchMove,
	syncHoverListener,
	markHighlightJustCreated,
} from './highlighter-overlays';
import { detectBrowser, addBrowserClassToHtml } from './browser-detection';
import dayjs from 'dayjs';
import { generalSettings, loadSettings } from './storage-utils';

/**
 * Helper function to create SVG elements
 */
function createSVG(config: {
	width?: string;
	height?: string;
	viewBox?: string;
	className?: string;
	paths?: string[];
	lines?: Array<{x1: string, y1: string, x2: string, y2: string}>;
}): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
	
	if (config.width) svg.setAttribute('width', config.width);
	if (config.height) svg.setAttribute('height', config.height);
	if (config.viewBox) svg.setAttribute('viewBox', config.viewBox);
	if (config.className) svg.setAttribute('class', config.className);
	
	// Default attributes for all SVGs
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	
	// Add paths
	if (config.paths) {
		config.paths.forEach(pathData => {
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', pathData);
			svg.appendChild(path);
		});
	}
	
	// Add lines
	if (config.lines) {
		config.lines.forEach(lineData => {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', lineData.x1);
			line.setAttribute('y1', lineData.y1);
			line.setAttribute('x2', lineData.x2);
			line.setAttribute('y2', lineData.y2);
			svg.appendChild(line);
		});
	}
	
	return svg;
}

export type AnyHighlightData = TextHighlightData | ElementHighlightData;

const EPHEMERAL_PARAMS = new Set([
	't',           // YouTube timestamp
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', // UTM tracking
	'ref', 'source', 'src',   // Referral
	'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid', // Ad click IDs
	'mc_cid', 'mc_eid',       // Mailchimp
	'_ga', '_gl',             // Google Analytics
	'si',                     // YouTube share tracking
]);

export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Strip fragment identifiers — highlights on /page#section should
		// match /page (fixes #652).
		parsed.hash = '';
		const params = new URLSearchParams(parsed.search);
		for (const key of [...params.keys()]) {
			if (EPHEMERAL_PARAMS.has(key)) {
				params.delete(key);
			}
		}
		parsed.search = params.toString();
		return parsed.toString();
	} catch {
		return url;
	}
}

export let highlights: AnyHighlightData[] = [];
export let isApplyingHighlights = false;
export let pageTitle: string = '';

// The bridge interface: every highlighter function that reader-script needs.
// content.js exposes an object of this shape on window.__obsidianHighlighter;
// reader.ts's hl() helper returns it when present (case 2: live page + reader),
// or falls back to the direct local import (case 3: standalone reader.html).
declare global {
	interface Window { __obsidianHighlighter?: HighlighterAPI }
}

export interface HighlighterAPI {
	toggleHighlighterMenu: typeof toggleHighlighterMenu;
	handleTextSelection: typeof handleTextSelection;
	highlightElement: typeof highlightElement;
	applyHighlights: typeof applyHighlights;
	loadHighlights: typeof loadHighlights;
	invalidateHighlightCache: typeof invalidateHighlightCache;
	repositionHighlights: typeof repositionHighlights;
	getHighlights: typeof getHighlights;
	setPageUrl: typeof setPageUrl;
	setPageTitle: typeof setPageTitle;
	updatePageDomainSettings: typeof updatePageDomainSettings;
	clearHighlights: typeof clearHighlights;
	saveHighlights: typeof saveHighlights;
	updateHighlighterMenu: typeof updateHighlighterMenu;
	removeExistingHighlights: () => void;
	ensureHighlighterCSS: () => void;
}

// URL override for extension pages (e.g. reader page) where
// window.location.href is the extension URL, not the article URL.
let pageUrlOverride: string | null = null;

export function setPageUrl(url: string) {
	pageUrlOverride = url;
}

function getPageUrl(): string {
	return pageUrlOverride || window.location.href;
}

export function setPageTitle(title: string) {
	pageTitle = title;
}

export function updatePageDomainSettings(settings: { site?: string; favicon?: string }) {
	const pageUrl = getPageUrl();
	const hostname = new URL(pageUrl).hostname.replace(/^www\./, '');
	const resolved: Partial<DomainSettings> = {};
	if (settings.site) resolved.site = settings.site;
	if (settings.favicon) {
		try {
			resolved.favicon = new URL(settings.favicon, pageUrl).href;
		} catch {
			resolved.favicon = settings.favicon;
		}
	}
	if (!resolved.site && !resolved.favicon) return;
	browser.storage.local.get('domains').then((result: { domains?: Record<string, DomainSettings> }) => {
		const domains = result.domains || {};
		if (!domains[hostname]) {
			domains[hostname] = {};
		}
		Object.assign(domains[hostname], resolved);
		browser.storage.local.set({ domains });
	});
}

export interface DomainSettings {
	site?: string;
	favicon?: string;
}
// Monotonic version counter bumped on any mutation to `highlights`. Cheaper
// dirty-flag than JSON.stringify on the render hot path (every reposition,
// every storage-change sync for long articles ran two full serializations).
let highlightsVersion = 0;
let lastAppliedVersion = -1;
function bumpHighlightsVersion() { highlightsVersion++; }
let originalLinkClickHandlers: WeakMap<HTMLElement, (event: MouseEvent) => void> = new WeakMap();

interface HistoryAction {
	type: 'add' | 'remove';
	oldHighlights: AnyHighlightData[];
	newHighlights: AnyHighlightData[];
}

let highlightHistory: HistoryAction[] = [];
let redoHistory: HistoryAction[] = [];
const MAX_HISTORY_LENGTH = 30;

// Block elements highlighted as a whole unit rather than as the text inside
// them. Click one (in highlighter mode) to highlight the whole block; when a
// selection fully contains one, it becomes a single element highlight instead
// of being split into per-child text highlights.
export const BLOCK_HIGHLIGHT_TAGS = new Set(['FIGURE', 'PICTURE', 'IMG', 'TABLE', 'PRE']);

// Block containers the text-splitting logic uses to split a multi-block
// selection into one TextHighlightData per paragraph-ish block.
const TEXT_BLOCK_SPLIT_TAGS = [
	'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'FIGCAPTION', 'TD', 'TH'
];

export interface HighlightData {
	id: string;
	xpath: string;
	content: string;
	notes?: string[]; // Annotations
	// When one selection crosses multiple blocks, all resulting highlights
	// share a groupId so they delete, clip, and visually associate together.
	groupId?: string;
}

export interface TextHighlightData extends HighlightData {
	type: 'text';
	startOffset: number;
	endOffset: number;
}

export interface ElementHighlightData extends HighlightData {
	type: 'element';
}

export interface StoredData {
	highlights: AnyHighlightData[];
	url: string;
	title?: string;
}

type HighlightsStorage = Record<string, StoredData>;

export function updateHighlights(newHighlights: AnyHighlightData[]) {
	const oldHighlights = [...highlights];
	highlights = newHighlights;
	bumpHighlightsVersion();
	addToHistory('add', oldHighlights, newHighlights);
}

// Toggle highlighter mode. When active: mouse/touch listeners that create
// highlights from selections and block-clicks are attached, and the floating
// menu appears. When inactive: creation is off, but the hover-delete affordance
// stays available as long as any highlights exist (managed independently via
// syncHoverListener, which checks highlights.length).
export function toggleHighlighterMenu(isActive: boolean) {
	document.body.classList.toggle('obsidian-highlighter-active', isActive);
	if (isActive) {
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('touchstart', handleTouchStart);
		document.addEventListener('touchmove', handleTouchMove);
		document.addEventListener('touchend', handleMouseUp);
		document.addEventListener('keydown', handleKeyDown);
		disableLinkClicks();
		createHighlighterMenu();
		addBrowserClassToHtml();
		browser.runtime.sendMessage({ action: "highlighterModeChanged", isActive: true });
		applyHighlights();
		// If the user had an active text selection before toggling on,
		// convert it into a highlight immediately.
		const selection = document.getSelection();
		if (selection && !selection.isCollapsed) {
			handleTextSelection(selection);
		}
	} else {
		document.removeEventListener('mouseup', handleMouseUp);
		document.removeEventListener('touchstart', handleTouchStart);
		document.removeEventListener('touchmove', handleTouchMove);
		document.removeEventListener('touchend', handleMouseUp);
		document.removeEventListener('keydown', handleKeyDown);
		enableLinkClicks();
		removeHighlighterMenu();
		browser.runtime.sendMessage({ action: "highlighterModeChanged", isActive: false });
	}
	syncHoverListener();
}

export function canUndo(): boolean {
	return highlightHistory.length > 0;
}

export function canRedo(): boolean {
	return redoHistory.length > 0;
}

export function undo() {
	if (canUndo()) {
		const lastAction = highlightHistory.pop();
		if (lastAction) {
			redoHistory.push(lastAction);
			highlights = [...lastAction.oldHighlights];
			bumpHighlightsVersion();
			commitHighlightChanges();
			updateUndoRedoButtons();
		}
	}
}

export function redo() {
	if (canRedo()) {
		const nextAction = redoHistory.pop();
		if (nextAction) {
			highlightHistory.push(nextAction);
			highlights = [...nextAction.newHighlights];
			bumpHighlightsVersion();
			commitHighlightChanges();
			updateUndoRedoButtons();
		}
	}
}

function updateUndoRedoButtons() {
	const undoButton = document.getElementById('obsidian-undo-highlights');
	const redoButton = document.getElementById('obsidian-redo-highlights');

	if (undoButton) {
		undoButton.classList.toggle('active', canUndo());
		undoButton.setAttribute('aria-disabled', (!canUndo()).toString());
	}

	if (redoButton) {
		redoButton.classList.toggle('active', canRedo());
		redoButton.setAttribute('aria-disabled', (!canRedo()).toString());
	}
}

async function handleClipButtonClick(e: Event) {
	e.preventDefault();
	const browserType = await detectBrowser();

	try {
		const response = await browser.runtime.sendMessage({action: "openPopup"});
		if (response && typeof response === 'object' && 'success' in response) {
			if (!response.success) {
				throw new Error((response as { error?: string }).error || 'Unknown error');
			}
		} else {
			throw new Error('Invalid response from background script');
		}
	} catch (error) {
		console.error('Error opening popup:', error);
		if (browserType === 'firefox') {
			alert("Additional permissions required. To open Web Clipper from the highlighter, go to about:config and set this to true:\n\nextensions.openPopupWithoutUserGesture.enabled");
		} else {
			console.error('Failed to open popup:', error);
		}
	}
}

export function createHighlighterMenu() {
	// Check if the menu already exists
	let menu = document.querySelector('.obsidian-highlighter-menu');
	
	// If the menu doesn't exist, create it
	if (!menu) {
		menu = document.createElement('div');
		menu.className = 'obsidian-highlighter-menu';
		document.body.appendChild(menu);
	}
	
	const highlightCount = highlights.length;
	const highlightText = `${highlightCount}`;

	menu.textContent = '';
	
	// Add clip button or no highlights message
	if (highlightCount > 0) {
		const clipButton = document.createElement('button');
		clipButton.id = 'obsidian-clip-button';
		clipButton.className = 'mod-cta';
		clipButton.textContent = 'Clip highlights';
		menu.appendChild(clipButton);
		
		// Add clear highlights button
		const clearButton = document.createElement('button');
		clearButton.id = 'obsidian-clear-highlights';
		clearButton.textContent = highlightText + ' ';
		
		// Add trash icon
		const trashSvg = createSVG({
			width: '16',
			height: '16',
			viewBox: '0 0 24 24',
			className: 'lucide lucide-trash-2',
			paths: [
				'M3 6h18',
				'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6',
				'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'
			],
			lines: [
				{x1: '10', y1: '11', x2: '10', y2: '17'},
				{x1: '14', y1: '11', x2: '14', y2: '17'}
			]
		});
		clearButton.appendChild(trashSvg);
		menu.appendChild(clearButton);
	} else {
		const noHighlights = document.createElement('span');
		noHighlights.className = 'no-highlights';
		noHighlights.textContent = 'Select elements to highlight';
		menu.appendChild(noHighlights);
	}
	
	// Add undo button
	const undoButton = document.createElement('button');
	undoButton.id = 'obsidian-undo-highlights';
	const undoSvg = createSVG({
		width: '16',
		height: '16',
		viewBox: '0 0 24 24',
		className: 'lucide lucide-undo-2',
		paths: [
			'M9 14 4 9l5-5',
			'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11'
		]
	});
	undoButton.appendChild(undoSvg);
	menu.appendChild(undoButton);
	
	// Add redo button
	const redoButton = document.createElement('button');
	redoButton.id = 'obsidian-redo-highlights';
	const redoSvg = createSVG({
		width: '16',
		height: '16',
		viewBox: '0 0 24 24',
		className: 'lucide lucide-redo-2',
		paths: [
			'm15 14 5-5-5-5',
			'M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13'
		]
	});
	redoButton.appendChild(redoSvg);
	menu.appendChild(redoButton);
	
	// Add exit button
	const exitButton = document.createElement('button');
	exitButton.id = 'obsidian-exit-highlighter';
	const exitSvg = createSVG({
		width: '16',
		height: '16',
		viewBox: '0 0 24 24',
		className: 'lucide lucide-x',
		paths: [
			'M18 6 6 18',
			'm6 6 12 12'
		]
	});
	exitButton.appendChild(exitSvg);
	menu.appendChild(exitButton);

	// Add event listeners to the buttons we just created
	if (highlightCount > 0) {
		// Use the clearButton and clipButton we already created
		const clearButtonEl = menu.querySelector('#obsidian-clear-highlights') as HTMLButtonElement;
		const clipButtonEl = menu.querySelector('#obsidian-clip-button') as HTMLButtonElement;

		if (clearButtonEl) {
			clearButtonEl.addEventListener('click', clearHighlights);
			clearButtonEl.addEventListener('touchend', (e) => {
				e.preventDefault();
				clearHighlights();
			});
		}

		if (clipButtonEl) {
			clipButtonEl.addEventListener('click', handleClipButtonClick);
			clipButtonEl.addEventListener('touchend', (e) => {
				e.preventDefault();
				handleClipButtonClick(e);
			});
		}
	}

	// Use the buttons we already created
	const exitButtonEl = menu.querySelector('#obsidian-exit-highlighter') as HTMLButtonElement;
	const undoButtonEl = menu.querySelector('#obsidian-undo-highlights') as HTMLButtonElement;
	const redoButtonEl = menu.querySelector('#obsidian-redo-highlights') as HTMLButtonElement;

	if (exitButtonEl) {
		exitButtonEl.addEventListener('click', exitHighlighterMode);
		exitButtonEl.addEventListener('touchend', (e) => {
			e.preventDefault();
			exitHighlighterMode();
		});
	}

	if (undoButtonEl) {
		undoButtonEl.addEventListener('click', undo);
		undoButtonEl.addEventListener('touchend', (e) => {
			e.preventDefault();
			undo();
		});
	}

	if (redoButtonEl) {
		redoButtonEl.addEventListener('click', redo);
		redoButtonEl.addEventListener('touchend', (e) => {
			e.preventDefault();
			redo();
		});
	}

	updateUndoRedoButtons();
}

function removeHighlighterMenu() {
	const menu = document.querySelector('.obsidian-highlighter-menu');
	if (menu) {
		menu.remove();
	}
}

function disableLinkClicks() {
	document.querySelectorAll('a').forEach((link: HTMLElement) => {
		const existingHandler = link.onclick;
		if (existingHandler) {
			originalLinkClickHandlers.set(link, existingHandler as (event: MouseEvent) => void);
		}
		link.onclick = (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		};
	});
}

function enableLinkClicks() {
	document.querySelectorAll('a').forEach((link: HTMLElement) => {
		const originalHandler = originalLinkClickHandlers.get(link);
		if (originalHandler) {
			link.onclick = originalHandler;
			originalLinkClickHandlers.delete(link);
		} else {
			link.onclick = null;
		}
	});
}

// Click-to-highlight a block element (figure, picture, img, table, pre).
// Text-containing blocks (paragraphs, headings, etc.) are not highlightable
// by click — those go through selection → TextHighlightData instead.
export function highlightElement(element: Element, notes?: string[]) {
	if (!BLOCK_HIGHLIGHT_TAGS.has(element.tagName.toUpperCase())) return;
	addHighlight({
		xpath: getElementXPath(element),
		content: element.outerHTML,
		type: 'element',
		id: Date.now().toString(),
	}, notes);
	markHighlightJustCreated();
}

// Handle text selection for highlighting
export function handleTextSelection(selection: Selection, notes?: string[]) {
	if (selection.isCollapsed) return;
	const range = selection.getRangeAt(0);
	const newHighlightDatas = getHighlightRanges(range);

	if (newHighlightDatas.length > 0) {
		const oldGlobalHighlights = [...highlights]; // Save global state BEFORE this operation
		let currentBatchHighlights = [...highlights]; // Start with global state for merging

		const batchGroupId = newHighlightDatas.length > 1 ? newHighlightDatas[0].groupId : undefined;
		let absorbedIntoGroupId: string | undefined;

		for (const highlightData of newHighlightDatas) {
			const beforeCount = currentBatchHighlights.length;
			const newHighlightWithNotes = { ...highlightData, notes: notes || [] };
			currentBatchHighlights = mergeOverlappingHighlights(currentBatchHighlights, newHighlightWithNotes);
			// If the array didn't grow, a merge happened — the new piece was
			// absorbed into an existing highlight whose groupId we should adopt
			// for the rest of this batch, so the two selections become one group.
			if (!absorbedIntoGroupId && batchGroupId && currentBatchHighlights.length === beforeCount) {
				absorbedIntoGroupId = currentBatchHighlights.find(
					h => h.groupId && h.groupId !== batchGroupId
				)?.groupId;
			}
		}

		// If the new batch merged into an existing group, unify: adopt the
		// existing groupId for all remaining pieces that still carry the
		// batch's original groupId, so the export treats them as one unit.
		if (absorbedIntoGroupId && batchGroupId) {
			for (const h of currentBatchHighlights) {
				if (h.groupId === batchGroupId) h.groupId = absorbedIntoGroupId;
			}
		}

		highlights = currentBatchHighlights;
		bumpHighlightsVersion();
		addToHistory('add', oldGlobalHighlights, highlights);
		
		sortHighlights();
		commitHighlightChanges();
		markHighlightJustCreated();
	}
	selection.removeAllRanges();
}

// Split a user selection into one highlight per block it crosses.
// A selection can produce:
//   - TextHighlightData per enclosing paragraph-ish block (P, H1-6, LI, etc.)
//   - ElementHighlightData per block-whitelist element (figure, img, table,
//     pre, picture) fully inside the selection.
// Partial selections of a block-whitelist element fall through to text
// highlights for the text inside it (e.g. text inside a <pre> is still text).
function getHighlightRanges(range: Range): AnyHighlightData[] {
	const newHighlights: AnyHighlightData[] = [];
	if (range.collapsed) return newHighlights;
	// Assigned below if the selection produces more than one highlight. All
	// pieces of a multi-block selection share this so they act as a single
	// logical highlight for delete/clip/hover.
	const groupId = `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

	// Pass 1: collect block-whitelist elements fully contained in the selection.
	const blockElements: Element[] = [];
	const elementIterator = document.createNodeIterator(
		range.commonAncestorContainer,
		NodeFilter.SHOW_ELEMENT,
		{
			acceptNode: (node) => {
				const el = node as Element;
				if (!BLOCK_HIGHLIGHT_TAGS.has(el.tagName.toUpperCase())) return NodeFilter.FILTER_SKIP;
				return rangeFullyContainsElement(range, el)
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_SKIP;
			}
		}
	);
	let el: Node | null;
	while ((el = elementIterator.nextNode())) {
		const element = el as Element;
		// Skip if already captured as an ancestor.
		if (blockElements.some(e => e.contains(element) && e !== element)) continue;
		blockElements.push(element);
	}

	const timestamp = Date.now().toString();
	for (let i = 0; i < blockElements.length; i++) {
		const element = blockElements[i];
		newHighlights.push({
			xpath: getElementXPath(element),
			content: element.outerHTML,
			type: 'element',
			id: `${timestamp}_el_${i}`,
		});
	}

	// Pass 2: group text nodes by their enclosing text block, skipping any
	// text inside a captured block-whitelist element (already represented).
	const uniqueParentBlocks = new Set<Element>();
	const textNodeIterator = document.createNodeIterator(
		range.commonAncestorContainer,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => {
				if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
				if (!node.nodeValue || node.nodeValue.trim().length === 0) return NodeFilter.FILTER_REJECT;
				if (blockElements.some(e => e.contains(node))) return NodeFilter.FILTER_REJECT;
				return NodeFilter.FILTER_ACCEPT;
			}
		}
	);

	let currentTextNode;
	while ((currentTextNode = textNodeIterator.nextNode())) {
		const block = getClosestTextBlock(currentTextNode);
		if (block) uniqueParentBlocks.add(block);
	}

	const sortedBlocks = Array.from(uniqueParentBlocks).sort((a, b) => {
		const pos = a.compareDocumentPosition(b);
		if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
		if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
		return 0;
	});

	for (let i = 0; i < sortedBlocks.length; i++) {
		const blockElement = sortedBlocks[i];
		const blockRange = document.createRange();

		let startContainer = range.startContainer;
		let startOffset = range.startOffset;
		let endContainer = range.endContainer;
		let endOffset = range.endOffset;

		if (!blockElement.contains(startContainer) && blockElement !== startContainer) {
			const firstText = findFirstTextNode(blockElement);
			if (!firstText) continue;
			startContainer = firstText;
			startOffset = 0;
		}
		if (!blockElement.contains(endContainer) && blockElement !== endContainer) {
			const lastText = findLastTextNode(blockElement);
			if (!lastText) continue;
			endContainer = lastText;
			endOffset = lastText.textContent?.length || 0;
		}

		try {
			blockRange.setStart(startContainer, startOffset);
			blockRange.setEnd(endContainer, endOffset);
			if (blockRange.collapsed) continue;
			if (!blockElement.contains(blockRange.commonAncestorContainer) && blockElement !== blockRange.commonAncestorContainer) continue;

			// Wrap the selection fragment in a shallow clone of the block so
			// each piece keeps its own <p>/<li>/etc. Range.cloneContents()
			// strips inline ancestors (<em>, <strong>, <a>, …) when the range
			// is entirely inside them, so we walk up from the range's common
			// ancestor and re-wrap in each one up to (not including) the block.
			const innerHtml = sanitizeAndPreserveFormatting(serializeRangePreservingAncestors(blockRange, blockElement));
			if (innerHtml.trim() === '') continue;
			const wrapper = blockElement.cloneNode(false) as Element;
			setElementHTML(wrapper, innerHtml);
			const htmlContent = wrapper.outerHTML;

			newHighlights.push({
				xpath: getElementXPath(blockElement),
				content: htmlContent,
				type: 'text',
				id: `${timestamp}_tx_${i}`,
				startOffset: getTextOffset(blockElement, blockRange.startContainer, blockRange.startOffset),
				endOffset: getTextOffset(blockElement, blockRange.endContainer, blockRange.endOffset),
			});
		} catch (e) {
			console.warn('Error creating text highlight for block:', blockElement, e);
		}
	}

	// Only stamp groupId when there's more than one piece; single-block
	// selections stay plain so they don't acquire a group they don't need.
	if (newHighlights.length > 1) {
		for (const h of newHighlights) h.groupId = groupId;
	}
	return newHighlights;
}

// Clone the range contents, then re-wrap in any inline ancestors that live
// between the range and the block boundary. Range.cloneContents() only
// includes ancestors the range actually crosses, so a selection entirely
// inside a chain like <p><em><a>text</a></em></p> would otherwise lose the
// <em> and <a>. Walking from the range's commonAncestor back up to (not
// including) the block lets us restore them.
function serializeRangePreservingAncestors(range: Range, block: Element): string {
	const fragment = range.cloneContents();
	let ancestor: Node | null = range.commonAncestorContainer;
	if (ancestor?.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
	const wrappers: Element[] = [];
	while (ancestor && ancestor !== block && ancestor.nodeType === Node.ELEMENT_NODE) {
		wrappers.push(ancestor as Element);
		ancestor = (ancestor as Element).parentElement;
	}
	let wrapped: Node = fragment;
	for (const w of wrappers) {
		const clone = w.cloneNode(false) as Element;
		clone.appendChild(wrapped);
		wrapped = clone;
	}
	const temp = document.createElement('div');
	temp.appendChild(wrapped);
	const serializer = new XMLSerializer();
	let html = '';
	for (const node of Array.from(temp.childNodes)) {
		if (node.nodeType === Node.ELEMENT_NODE) html += serializer.serializeToString(node);
		else if (node.nodeType === Node.TEXT_NODE) html += node.textContent;
	}
	return html;
}

function rangeFullyContainsElement(range: Range, element: Element): boolean {
	const elRange = document.createRange();
	try {
		elRange.selectNode(element);
		return range.compareBoundaryPoints(Range.START_TO_START, elRange) <= 0 &&
			range.compareBoundaryPoints(Range.END_TO_END, elRange) >= 0;
	} catch {
		return false;
	} finally {
		elRange.detach();
	}
}

// Sanitize HTML content while preserving formatting
function sanitizeAndPreserveFormatting(html: string): string {
	// Use DOMParser for safer HTML parsing
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	// Remove any script tags
	doc.querySelectorAll('script').forEach(el => el.remove());

	// Strip inline style attributes — highlights should store semantic HTML, not presentation
	doc.querySelectorAll('[style]').forEach(el => el.removeAttribute('style'));

	// Get the body content and serialize it back
	const serializer = new XMLSerializer();
	let result = '';

	// Serialize all child nodes of the body
	Array.from(doc.body.childNodes).forEach(node => {
		if (node.nodeType === Node.ELEMENT_NODE) {
			result += serializer.serializeToString(node);
		} else if (node.nodeType === Node.TEXT_NODE) {
			result += node.textContent;
		}
	});

	// Close any unclosed tags
	return balanceTags(result);
}

// Balance HTML tags to ensure proper nesting
function balanceTags(html: string): string {
	const openingTags: string[] = [];
	const regex = /<\/?([a-z]+)[^>]*>/gi;
	let match;

	while ((match = regex.exec(html)) !== null) {
		if (match[0].startsWith('</')) {
			// Closing tag
			const lastOpenTag = openingTags.pop();
			if (lastOpenTag !== match[1].toLowerCase()) {
				// Mismatched tag, add it back
				if (lastOpenTag) openingTags.push(lastOpenTag);
			}
		} else {
			// Opening tag
			openingTags.push(match[1].toLowerCase());
		}
	}

	// Close any remaining open tags
	let balancedHtml = html;
	while (openingTags.length > 0) {
		const tag = openingTags.pop();
		balancedHtml += `</${tag}>`;
	}

	return balancedHtml;
}

// Calculate the text offset within a container element
function getTextOffset(container: Element, targetNode: Node, targetOffset: number): number {
	// TreeWalker.currentNode initially points at the root element (the filter
	// only affects traversal, not the starting position). Advance past it so
	// we only sum actual text nodes — otherwise we add the whole container's
	// textContent.length at the start and overshoot every offset.
	const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	let offset = 0;
	let node: Node | null = treeWalker.nextNode();
	while (node) {
		if (node === targetNode) return offset + targetOffset;
		offset += node.textContent?.length || 0;
		node = treeWalker.nextNode();
	}
	return offset;
}

function addHighlight(highlight: AnyHighlightData, notes?: string[]) {
	const oldHighlights = [...highlights];
	const newHighlight = { ...highlight, notes: notes || [] };
	const mergedHighlights = mergeOverlappingHighlights(highlights, newHighlight);
	highlights = mergedHighlights;
	bumpHighlightsVersion();
	addToHistory('add', oldHighlights, mergedHighlights);
	sortHighlights();
	commitHighlightChanges();
}

export function sortHighlights() {
	// Precompute positions once. The previous implementation called
	// getElementByXPath and getBoundingClientRect inside the comparator, which
	// forced synchronous layout O(n log n) times per sort.
	const positions = new Map<AnyHighlightData, { top: number; left: number; resolved: boolean }>();
	for (const h of highlights) {
		const el = getElementByXPath(h.xpath);
		if (el) {
			const rect = el.getBoundingClientRect();
			positions.set(h, { top: rect.top + window.scrollY, left: rect.left, resolved: true });
		} else {
			positions.set(h, { top: 0, left: 0, resolved: false });
		}
	}
	highlights.sort((a, b) => {
		const pa = positions.get(a)!;
		const pb = positions.get(b)!;
		if (!pa.resolved || !pb.resolved) return 0;
		const dy = pa.top - pb.top;
		if (dy !== 0) return dy;
		if (a.type === 'text' && b.type === 'text' && a.xpath === b.xpath) {
			return a.startOffset - b.startOffset;
		}
		return pa.left - pb.left;
	});
}

function doHighlightsOverlap(highlight1: AnyHighlightData, highlight2: AnyHighlightData): boolean {
	// Same xpath means the same element by construction — short-circuit before
	// the DOM lookup, which can fail for namespaced elements (MathML, SVG)
	// because document.evaluate() doesn't resolve unprefixed names outside
	// the HTML namespace. Without this, re-clicking a <math> produces duplicates.
	if (highlight1.xpath === highlight2.xpath) {
		if (highlight1.type === 'text' && highlight2.type === 'text') {
			return highlight1.startOffset < highlight2.endOffset && highlight2.startOffset < highlight1.endOffset;
		}
		return true;
	}

	const element1 = getElementByXPath(highlight1.xpath);
	const element2 = getElementByXPath(highlight2.xpath);

	if (!element1 || !element2) return false;

	// Check if one element contains the other
	return element1.contains(element2) || element2.contains(element1);
}

function areHighlightsAdjacent(highlight1: AnyHighlightData, highlight2: AnyHighlightData): boolean {
	if (highlight1.type === 'text' && highlight2.type === 'text' && highlight1.xpath === highlight2.xpath) {
		return highlight1.endOffset === highlight2.startOffset || highlight2.endOffset === highlight1.startOffset;
	}
	return false;
}

function mergeOverlappingHighlights(existingHighlights: AnyHighlightData[], newHighlight: AnyHighlightData): AnyHighlightData[] {
	let mergedHighlights: AnyHighlightData[] = [];
	let merged = false;

	for (const existing of existingHighlights) {
		if (doHighlightsOverlap(existing, newHighlight) || areHighlightsAdjacent(existing, newHighlight)) {
			if (!merged) {
				mergedHighlights.push(mergeHighlights(existing, newHighlight));
				merged = true;
			} else {
				mergedHighlights[mergedHighlights.length - 1] = mergeHighlights(mergedHighlights[mergedHighlights.length - 1], existing);
			}
		} else {
			mergedHighlights.push(existing);
		}
	}

	if (!merged) {
		mergedHighlights.push(newHighlight);
	}

	return mergedHighlights;
}

function mergeHighlights(h1: AnyHighlightData, h2: AnyHighlightData): AnyHighlightData {
	// Element + text on the same region: the element wins (covers the whole block).
	if (h1.type === 'element' && h2.type === 'text') return h1;
	if (h2.type === 'element' && h1.type === 'text') return h2;

	// Same xpath = same element. Merge text offsets; dedupe element highlights.
	// Done without DOM resolution so this works for MathML/SVG (document.evaluate
	// can't find namespaced nodes in HTML docs).
	if (h1.xpath === h2.xpath) {
		if (h1.type === 'text' && h2.type === 'text') {
			const startOffset = Math.min(h1.startOffset, h2.startOffset);
			const endOffset = Math.max(h1.endOffset, h2.endOffset);
			const el = getElementByXPath(h1.xpath);
			const notes = [...(h1.notes ?? []), ...(h2.notes ?? [])];
			// Preserve groupId so a merged highlight keeps its multi-block
			// delete/export association. Prefer whichever side already has one.
			const groupId = h1.groupId ?? h2.groupId;
			return {
				xpath: h1.xpath,
				content: el?.textContent?.slice(startOffset, endOffset) ?? '',
				type: 'text',
				id: Date.now().toString(),
				startOffset,
				endOffset,
				...(notes.length > 0 ? { notes } : {}),
				...(groupId ? { groupId } : {}),
			};
		}
		return h1;
	}

	// Different xpaths — reachable when one contains the other (caller only
	// merges overlapping highlights). Outer wins; inner is absorbed.
	const el1 = getElementByXPath(h1.xpath);
	const el2 = getElementByXPath(h2.xpath);
	if (el1 && el2) {
		if (el1.contains(el2)) return h1;
		if (el2.contains(el1)) return h2;
	}
	return h1;
}

export function saveHighlights() {
	const rawUrl = getPageUrl();
	const url = normalizeUrl(rawUrl);
	if (highlights.length > 0) {
		const title = pageTitle || document.title || undefined;
		const data: StoredData = { highlights, url, title };
		browser.storage.local.get('highlights').then((result: { highlights?: HighlightsStorage }) => {
			const allHighlights: HighlightsStorage = result.highlights || {};
			allHighlights[url] = data;
			browser.storage.local.set({ highlights: allHighlights });
		});
		const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
		if (ogSiteName) {
			const hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
			browser.storage.local.get('domains').then((result: { domains?: Record<string, DomainSettings> }) => {
				const domains = result.domains || {};
				if (!domains[hostname]?.site) {
					if (!domains[hostname]) domains[hostname] = {};
					domains[hostname].site = ogSiteName;
					browser.storage.local.set({ domains });
				}
			});
		}
	} else {
		browser.storage.local.get('highlights').then((result: { highlights?: HighlightsStorage }) => {
			const allHighlights: HighlightsStorage = result.highlights || {};
			delete allHighlights[url];
			if (rawUrl !== url) delete allHighlights[rawUrl];
			browser.storage.local.set({ highlights: allHighlights });
		});
	}
}

export function invalidateHighlightCache() {
	lastAppliedVersion = -1;
}

export function repositionHighlights() {
	invalidateHighlightCache();
	applyHighlights();
}

export function applyHighlights() {
	if (isApplyingHighlights) return;
	if (highlightsVersion === lastAppliedVersion) return;

	isApplyingHighlights = true;

	// Always clear — deleting the last highlight must also tear down its
	// overlay, so we can't early-return on highlights.length === 0.
	removeExistingHighlights();

	highlights.forEach((highlight) => {
		const container = getElementByXPath(highlight.xpath);
		if (container) {
			planHighlightOverlayRects(container, highlight);
		}
	});

	lastAppliedVersion = highlightsVersion;
	isApplyingHighlights = false;
	syncHoverListener();
}

// Apply, save, and update UI after highlight changes.
// The popup/side-panel detects changes via storage.local.onChanged.
function commitHighlightChanges() {
	applyHighlights();
	saveHighlights();
	updateHighlighterMenu();
}

export function getHighlights(): string[] {
	return highlights.map(h => h.content);
}

// Group highlights that share a groupId (produced by a single multi-block
// selection) so export/display treats them as one logical highlight. Ungrouped
// highlights pass through as single-element arrays. Order is preserved.
export function groupHighlights(highlights: AnyHighlightData[]): AnyHighlightData[][] {
	const groups: AnyHighlightData[][] = [];
	const byGroupId = new Map<string, AnyHighlightData[]>();
	for (const h of highlights) {
		if (h.groupId) {
			const existing = byGroupId.get(h.groupId);
			if (existing) {
				existing.push(h);
				continue;
			}
			const arr: AnyHighlightData[] = [h];
			byGroupId.set(h.groupId, arr);
			groups.push(arr);
		} else {
			groups.push([h]);
		}
	}
	return groups;
}

export interface ExportedHighlight {
	text: string;
	timestamp: string;
	notes?: string[];
}

// Export shape used by every highlight-export surface (highlights.html,
// options-page export, clip-to-Obsidian content-extractor). Coalesces group
// members into one entry, joining content with blank lines; merges notes.
// `transformContent` lets the clipper path run its content through
// createMarkdownContent while the JSON exports pass it through verbatim.
export function collapseGroupsForExport(
	highlights: AnyHighlightData[],
	transformContent?: (content: string) => string,
): ExportedHighlight[] {
	return groupHighlights(highlights).map(group => {
		const parts = transformContent
			? group.map(h => transformContent(h.content))
			: group.map(h => h.content);
		const mergedNotes = group.flatMap(h => h.notes ?? []);
		const entry: ExportedHighlight = {
			text: parts.join('\n\n'),
			timestamp: dayjs(parseInt(group[0].id)).toISOString(),
		};
		if (mergedNotes.length > 0) entry.notes = mergedNotes;
		return entry;
	});
}

// Cross-tab sync: when another tab/extension page (e.g. highlights.html)
// deletes or modifies highlights for this URL, pick up the change.
// The bridge check ensures only the owning module instance acts: if the
// bridge exists and points to a DIFFERENT copy of applyHighlights (i.e.,
// we're reader-script but content.js owns the bridge), we skip — content.js's
// listener will handle it. Without this, both bundles render and you get
// duplicate overlays / delete buttons.
browser.storage.onChanged.addListener((changes, area) => {
	if (area !== 'local' || !changes.highlights) return;
	const bridge = window.__obsidianHighlighter;
	if (bridge && bridge.applyHighlights !== applyHighlights) return;
	const url = normalizeUrl(getPageUrl());
	const newAll = (changes.highlights.newValue || {}) as HighlightsStorage;
	const newForUrl = newAll[url]?.highlights ?? [];
	if (JSON.stringify(newForUrl) === JSON.stringify(highlights)) return;
	highlights = newForUrl;
	bumpHighlightsVersion();
	invalidateHighlightCache();
	applyHighlights();
	updateHighlighterMenu();
});

export async function loadHighlights() {
	const url = normalizeUrl(getPageUrl());
	const rawUrl = getPageUrl();
	const result = await browser.storage.local.get('highlights');
	const allHighlights = (result.highlights || {}) as HighlightsStorage;

	// Check normalized key first, then fall back to raw URL for old entries
	let storedData = allHighlights[url];
	if (!storedData && rawUrl !== url && allHighlights[rawUrl]) {
		// Migrate old entry to normalized key
		storedData = allHighlights[rawUrl];
		storedData.url = url;
		allHighlights[url] = storedData;
		delete allHighlights[rawUrl];
		browser.storage.local.set({ highlights: allHighlights });
	}

	if (storedData && Array.isArray(storedData.highlights) && storedData.highlights.length > 0) {
		highlights = storedData.highlights;
		const migrated = migrateStoredHighlights();
		bumpHighlightsVersion();
		await loadSettings();
		// Always render so the click-to-remove affordance works regardless
		// of highlighter mode.
		applyHighlights();
		if (generalSettings.alwaysShowHighlights) {
			document.body.classList.add('obsidian-highlighter-always-show');
		}
		if (migrated) saveHighlights();
	} else {
		highlights = [];
		bumpHighlightsVersion();
	}
	lastAppliedVersion = highlightsVersion;
}

// One-time migration for highlights saved before the Highlighter 2.0 refactor.
// Returns true if any data was changed (caller should persist).
function migrateStoredHighlights(): boolean {
	let changed = false;
	for (let i = highlights.length - 1; i >= 0; i--) {
		const h = highlights[i];

		// 1. Convert removed 'complex' type → 'element' (renders as overlay).
		if ((h as any).type === 'complex') {
			(h as any).type = 'element';
			delete (h as any).startOffset;
			delete (h as any).endOffset;
			changed = true;
		}

		// 2. Fix inflated text offsets. Old getTextOffset/findTextNodeAtOffset
		//    both included the root element's textContent.length on the first
		//    TreeWalker iteration (a bug that canceled at render time). After
		//    the fix, offsets are natural character positions. Detect old format
		//    by checking startOffset >= textContent.length — in new format,
		//    startOffset is always < textContent.length.
		if (h.type === 'text') {
			const el = getElementByXPath(h.xpath);
			if (el) {
				const len = el.textContent?.length ?? 0;
				if (len > 0 && h.startOffset >= len) {
					h.startOffset -= len;
					h.endOffset -= len;
					changed = true;
				}
			}
		}
	}
	return changed;
}

export function clearHighlights() {
	const url = normalizeUrl(getPageUrl());
	const oldHighlights = [...highlights];
	browser.storage.local.get('highlights').then((result: { highlights?: HighlightsStorage }) => {
		const allHighlights: HighlightsStorage = result.highlights || {};
		delete allHighlights[url];
		browser.storage.local.set({ highlights: allHighlights }).then(() => {
			highlights = [];
			bumpHighlightsVersion();
			removeExistingHighlights();
			syncHoverListener();
			console.log('Highlights cleared for:', url);
			browser.runtime.sendMessage({ action: "highlightsCleared" });
			updateHighlighterMenu();
			addToHistory('remove', oldHighlights, []);
		});
	});
}

export function updateHighlighterMenu() {
	removeHighlighterMenu();
	if (document.body.classList.contains('obsidian-highlighter-active')) {
		createHighlighterMenu();
	}
}

function handleKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape' && document.body.classList.contains('obsidian-highlighter-active')) {
		exitHighlighterMode();
	} else if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
		event.preventDefault();
		if (event.shiftKey) {
			redo();
		} else {
			undo();
		}
	}
}

function exitHighlighterMode() {
	console.log('Exiting highlighter mode');
	toggleHighlighterMenu(false);
	browser.runtime.sendMessage({ action: "setHighlighterMode", isActive: false });

	// Remove highlight overlays if "Always show highlights" is off
	if (!generalSettings.alwaysShowHighlights) {
		removeExistingHighlights();
	}
}

function addToHistory(type: 'add' | 'remove', oldHighlights: AnyHighlightData[], newHighlights: AnyHighlightData[]) {
	highlightHistory.push({ type, oldHighlights, newHighlights });
	if (highlightHistory.length > MAX_HISTORY_LENGTH) {
		highlightHistory.shift();
	}
	// Clear redo history when a new action is performed
	redoHistory = [];
	updateUndoRedoButtons();
}

// Nearest ancestor block that wraps a text selection fragment (the unit by
// which a multi-block selection is split into separate highlights).
function getClosestTextBlock(node: Node | null): Element | null {
	let current: Node | null = node;
	while (current) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const el = current as Element;
			// Transcript timestamp <strong> must not act as a block — otherwise
			// a cross-segment selection walks up past it and snaps to the outer
			// <p>, pulling the timestamp column into the highlight.
			if (el.parentElement?.classList.contains('transcript-segment')) {
				if (el.tagName === 'STRONG') return null;
				if (el.classList.contains('transcript-segment-text')) return el;
			}
			const tag = el.tagName.toUpperCase();
			if (TEXT_BLOCK_SPLIT_TAGS.includes(tag)) {
				// A <p> wrapped in a semantic container (LI, BLOCKQUOTE,
				// FIGCAPTION) is common markup; prefer the container so the
				// stored content carries the wrapper and renders with its
				// styling in highlights.html.
				if (tag === 'P') {
					const parentTag = el.parentElement?.tagName.toUpperCase();
					if (parentTag === 'LI' || parentTag === 'BLOCKQUOTE' || parentTag === 'FIGCAPTION') {
						return el.parentElement!;
					}
				}
				return el;
			}
		}
		current = current.parentElement;
	}
	return null;
}

function findFirstTextNode(element: Element): Text | null {
	const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	return treeWalker.firstChild() as Text | null;
}

function findLastTextNode(element: Element): Text | null {
	const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	let lastNode = null;
	let currentNode;
	while(currentNode = treeWalker.nextNode()) {
		lastNode = currentNode;
	}
	return lastNode as Text | null;
}

