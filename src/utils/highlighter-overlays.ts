import {
	handleTextSelection,
	highlightElement,
	AnyHighlightData,
	BLOCK_HIGHLIGHT_TAGS,
	highlights,
	isApplyingHighlights,
	sortHighlights,
	applyHighlights,
	saveHighlights,
	updateHighlights,
	updateHighlighterMenu,
	updateHighlightNotes,
} from './highlighter';
import { throttle } from './throttle';
import { getElementByXPath, isDarkColor, setElementHTML } from './dom-utils';
import { getMessage } from './i18n';
import { debugLog } from './debug';

let touchStartX: number = 0;
let touchStartY: number = 0;
let isTouchMoved: boolean = false;

const IGNORED_BOUNDARY_SELECTOR =
	'.obsidian-highlighter-menu, .obsidian-reader-settings, .transcript-segment > strong, .obsidian-highlight-delete, .obsidian-highlight-annotate-button, .obsidian-highlight-annotation-editor, .obsidian-selection-action';

// --- Custom Highlight API (for type: 'text' highlights) ---
//
// Text highlights render via CSS.highlights instead of absolutely-positioned
// overlay divs. No DOM mutation, no position math on scroll/resize — the
// browser lays out decorations against the live text. Element/complex
// highlights still use overlays (they cover non-text regions).
//
// Requires CSS Custom Highlight API: Chrome 105+, Safari 17.2+, Firefox 140+.
// If unavailable the renderer silently no-ops.

const USER_HIGHLIGHT_NAME = 'obsidian-highlight';
// Priority below transcript-playback (default 0) so audio playback highlights
// paint on top inside transcripts.
const USER_HIGHLIGHT_PRIORITY = -1;

interface CSSHighlightsRegistry {
	set(name: string, value: unknown): void;
	delete(name: string): void;
}
interface HighlightInstance {
	add(range: Range): void;
	clear(): void;
	priority: number;
}

let userHighlight: HighlightInstance | null = null;
// Map of highlight id → list of Ranges. One stored highlight may produce
// multiple ranges in edge cases (future-proofing); today it's always one.
const textHighlightRanges = new Map<string, Range[]>();

function getHighlightRegistry(): CSSHighlightsRegistry | null {
	const registry = (CSS as unknown as { highlights?: CSSHighlightsRegistry }).highlights;
	return registry ?? null;
}

let highlightApiWarned = false;
function ensureUserHighlight(): HighlightInstance | null {
	if (userHighlight) return userHighlight;
	const registry = getHighlightRegistry();
	const HighlightCtor = (window as unknown as { Highlight?: new () => HighlightInstance }).Highlight;
	if (!registry || !HighlightCtor) {
		if (!highlightApiWarned) {
			debugLog('Clipper', 'CSS Custom Highlight API not available — text highlights will not render. Requires Chrome 105+, Safari 17.2+, or Firefox 140+.');
			highlightApiWarned = true;
		}
		return null;
	}
	userHighlight = new HighlightCtor();
	userHighlight.priority = USER_HIGHLIGHT_PRIORITY;
	registry.set(USER_HIGHLIGHT_NAME, userHighlight);
	return userHighlight;
}

// Locate the text node containing a given character offset within an element.
// Offsets are natural character positions in the element's concatenated text.
// Returns null only if the element has no text descendants; otherwise clamps
// to the last text node's end when the offset overruns.
function findTextNodeAtOffset(element: Element, offset: number): { node: Node, offset: number } | null {
	// Skip the root — TreeWalker.currentNode starts there and the loop would
	// otherwise treat the whole element as a single text node (see the
	// mirror-image comment on getTextOffset in highlighter.ts).
	const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	let currentOffset = 0;
	let lastTextNode: Node | null = null;
	let node: Node | null = treeWalker.nextNode();
	while (node) {
		const nodeLength = node.textContent?.length || 0;
		if (currentOffset + nodeLength >= offset) {
			return { node, offset: Math.max(0, offset - currentOffset) };
		}
		lastTextNode = node;
		currentOffset += nodeLength;
		node = treeWalker.nextNode();
	}
	if (lastTextNode) {
		return { node: lastTextNode, offset: lastTextNode.textContent?.length ?? 0 };
	}
	return null;
}

interface TextQuoteAnchor {
	prefix?: string;
	suffix?: string;
}

type RenderableTextHighlight = {
	id: string;
	xpath: string;
	startOffset: number;
	endOffset: number;
	content?: string;
	textQuote?: TextQuoteAnchor;
};

export function renderTextHighlight(highlight: RenderableTextHighlight): void {
	const hl = ensureUserHighlight();
	if (!hl) return;

	// Primary: resolve by stored XPath + character offsets.
	let range = buildTextRangeFromXPath(highlight);

	// Fallback: the XPath didn't resolve against the current DOM (or resolved to
	// the wrong text). This happens whenever the highlight was made against a
	// different DOM than the one now showing — live vs reader, or a reader view
	// regenerated on re-entry. Re-anchor by the highlighted text instead.
	if (!range) {
		range = buildTextRangeFromQuote(highlight);
	}

	if (!range) return;
	hl.add(range);
	const existing = textHighlightRanges.get(highlight.id);
	if (existing) existing.push(range);
	else textHighlightRanges.set(highlight.id, [range]);
}

function buildTextRangeFromXPath(highlight: RenderableTextHighlight): Range | null {
	const container = getElementByXPath(highlight.xpath);
	if (!container) return null;
	const start = findTextNodeAtOffset(container, highlight.startOffset);
	const end = findTextNodeAtOffset(container, highlight.endOffset);
	if (!start || !end) return null;
	try {
		const range = document.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		if (range.collapsed) return null;
		// Guard against a stale XPath that resolves to a *different* element in
		// the current DOM: if the resolved text doesn't match the stored
		// content, reject it so the quote fallback can re-anchor by text.
		const expected = highlightExactText(highlight);
		if (expected && normalizeText(range.toString()) !== expected) return null;
		return range;
	} catch (e) {
		console.warn('Failed to build Range from XPath for text highlight', highlight.xpath, e);
		return null;
	}
}

// Re-anchor a highlight by its text when the XPath is stale. Matching is done
// in whitespace-normalized space (so the same prose matches across DOMs that
// space it differently) and scoped to the article (so UI chrome isn't matched).
// When the exact text occurs more than once, the stored prefix/suffix context
// picks the right occurrence. The match maps back to live DOM nodes, so a
// highlight spanning inline elements (a link mid-sentence) still resolves.
function buildTextRangeFromQuote(highlight: RenderableTextHighlight): Range | null {
	const exact = highlightExactText(highlight);
	if (!exact) return null;

	const index = getNormalizedTextIndex();
	// Collapse internal whitespace but keep the edge adjacent to the exact text:
	// commonSuffixLength/commonPrefixLength compare from that boundary, so the
	// space between the context and the highlighted text must be preserved.
	const prefix = collapseWhitespace(highlight.textQuote?.prefix || '');
	const suffix = collapseWhitespace(highlight.textQuote?.suffix || '');

	// Pick the occurrence whose surrounding text best matches the stored context.
	let bestStart = -1;
	let bestScore = -1;
	for (let from = 0; from <= index.text.length;) {
		const start = index.text.indexOf(exact, from);
		if (start === -1) break;
		const before = index.text.slice(Math.max(0, start - prefix.length), start);
		const after = index.text.slice(start + exact.length, start + exact.length + suffix.length);
		const score = commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
		if (score > bestScore) {
			bestScore = score;
			bestStart = start;
		}
		from = start + Math.max(1, exact.length);
	}
	if (bestStart === -1) return null;

	const start = domPositionForNormalizedOffset(index, bestStart);
	const end = domPositionForNormalizedOffset(index, bestStart + exact.length - 1);
	if (!start || !end) return null;
	try {
		const range = document.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset + 1); // end is the last matched char; range ends after it
		return range.collapsed ? null : range;
	} catch (e) {
		console.warn('Failed to build Range from text quote', e);
		return null;
	}
}

// The highlighted text, derived from content (which is HTML). Cached by content
// — it's immutable, so this never goes stale — to avoid re-parsing on every
// render: applyHighlights re-runs on each resize/scroll reposition.
const exactTextCache = new Map<string, string>();
function highlightExactText(highlight: RenderableTextHighlight): string {
	if (!highlight.content) return '';
	let exact = exactTextCache.get(highlight.content);
	if (exact === undefined) {
		exact = normalizeText(htmlToText(highlight.content));
		exactTextCache.set(highlight.content, exact);
	}
	return exact;
}

// Prefer the article body so the fallback search ignores nav/chrome/furniture.
function getTextSearchRoot(): Element {
	return document.querySelector('.obsidian-reader-content article')
		|| document.querySelector('article')
		|| document.body;
}

function htmlToText(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return (doc.body.textContent || '').trim();
}

function normalizeText(text: string): string {
	return collapseWhitespace(text).trim();
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ');
}

function commonPrefixLength(a: string, b: string): number {
	const max = Math.min(a.length, b.length);
	let i = 0;
	while (i < max && a[i] === b[i]) i++;
	return i;
}

function commonSuffixLength(a: string, b: string): number {
	const max = Math.min(a.length, b.length);
	let i = 0;
	while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
	return i;
}

// A whitespace-normalized view of the search root's text, plus per-text-node
// segments so a normalized offset can be mapped back to a live (node, offset).
// Node-granular (not per-character) to keep memory small; the raw offset within
// the matched node is recomputed on demand. Built lazily and cached for the
// duration of one render pass (cleared by clearTextHighlights).
interface TextNodeSegment {
	node: Text;
	normStart: number;
	normEnd: number;
	prevWasSpace: boolean;
}
interface NormalizedTextIndex {
	text: string;
	segments: TextNodeSegment[];
}

let normalizedTextIndexCache: NormalizedTextIndex | null = null;
let normalizedTextIndexRoot: Element | null = null;

function getNormalizedTextIndex(): NormalizedTextIndex {
	const root = getTextSearchRoot();
	if (normalizedTextIndexCache && normalizedTextIndexRoot === root && root.isConnected) {
		return normalizedTextIndexCache;
	}
	normalizedTextIndexRoot = root;
	normalizedTextIndexCache = buildNormalizedTextIndex(root);
	return normalizedTextIndexCache;
}

function buildNormalizedTextIndex(root: Element): NormalizedTextIndex {
	const segments: TextNodeSegment[] = [];
	let text = '';
	let prevWasSpace = true; // treat the start as preceded by space so leading whitespace collapses away
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.closest('script, style, noscript, ' + IGNORED_BOUNDARY_SELECTOR)
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	});
	let node: Node | null;
	while ((node = walker.nextNode())) {
		const normStart = text.length;
		const segPrevWasSpace = prevWasSpace;
		const raw = node.textContent || '';
		for (let i = 0; i < raw.length; i++) {
			if (/\s/.test(raw[i])) {
				if (!prevWasSpace) { text += ' '; prevWasSpace = true; }
			} else {
				text += raw[i];
				prevWasSpace = false;
			}
		}
		segments.push({ node: node as Text, normStart, normEnd: text.length, prevWasSpace: segPrevWasSpace });
	}
	return { text, segments };
}

// Segments are contiguous and sorted by normStart, so binary-search for the one
// whose [normStart, normEnd) range owns the offset. Empty segments (no emitted
// chars) are skipped naturally since offset >= normEnd moves the search right.
function findSegmentForOffset(segments: TextNodeSegment[], offset: number): TextNodeSegment | null {
	let lo = 0;
	let hi = segments.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const seg = segments[mid];
		if (offset < seg.normStart) hi = mid - 1;
		else if (offset >= seg.normEnd) lo = mid + 1;
		else return seg;
	}
	return null;
}

// Map an offset in the normalized text back to a live (node, raw offset) by
// finding the owning text-node segment and replaying its whitespace collapse.
function domPositionForNormalizedOffset(index: NormalizedTextIndex, offset: number): { node: Text; offset: number } | null {
	const seg = findSegmentForOffset(index.segments, offset);
	if (!seg) return null;
	const target = offset - seg.normStart;
	const raw = seg.node.textContent || '';
	let emitted = 0;
	let prevWasSpace = seg.prevWasSpace;
	for (let i = 0; i < raw.length; i++) {
		const isSpace = /\s/.test(raw[i]);
		if (isSpace) {
			if (!prevWasSpace) {
				if (emitted === target) return { node: seg.node, offset: i };
				emitted++;
				prevWasSpace = true;
			}
		} else {
			if (emitted === target) return { node: seg.node, offset: i };
			emitted++;
			prevWasSpace = false;
		}
	}
	return null;
}

export function clearTextHighlights(): void {
	userHighlight?.clear();
	textHighlightRanges.clear();
	normalizedTextIndexCache = null;
	normalizedTextIndexRoot = null;
}

function findOverlayAtPoint(x: number, y: number): HTMLElement | null {
	const overlays = document.querySelectorAll<HTMLElement>('.obsidian-highlight-overlay');
	for (let i = 0; i < overlays.length; i++) {
		const el = overlays[i];
		const r = el.getBoundingClientRect();
		if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el;
	}
	return null;
}

// TODO: O(N × rects) per call. For pages with 50+ highlights, consider
// spatial indexing (e.g., a grid or interval tree) to reduce hit-test cost.
function findTextHighlightAtPoint(x: number, y: number): string | null {
	// Expand rects vertically to cover inter-line gaps (line-height spacing
	// between adjacent line rects). Without this, clicking between lines
	// of the same highlight wouldn't register.
	// NOTE: 4px padding could merge hover zones of highlights <8px apart
	// vertically. Unlikely in practice (line-height is usually 20px+).
	const PAD = 4;
	for (const [id, ranges] of textHighlightRanges) {
		for (const range of ranges) {
			const rects = range.getClientRects();
			for (let i = 0; i < rects.length; i++) {
				const rect = rects[i];
				if (x >= rect.left && x <= rect.right && y >= rect.top - PAD && y <= rect.bottom + PAD) {
					return id;
				}
			}
		}
	}
	return null;
}

// --- Floating remove button ---
//
// Shown on click/tap on any highlight, or on Alt+hover (desktop shortcut).
// Positioned center-top above the highlight's bounding box.

let highlightDeleteButton: HTMLButtonElement | null = null;
let highlightAnnotateButton: HTMLButtonElement | null = null;
let annotationEditor: HTMLDivElement | null = null;
let currentDeleteTargetId: string | null = null;
let deleteButtonShownViaAlt = false;

function ensureHighlightDeleteButton(): HTMLButtonElement {
	if (highlightDeleteButton) {
		if (!highlightDeleteButton.isConnected) document.body.appendChild(highlightDeleteButton);
		return highlightDeleteButton;
	}
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 'obsidian-highlight-delete';
	btn.setAttribute('aria-label', getMessage('remove'));
	setElementHTML(btn, `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg><span>${getMessage('remove')}</span>`);
	btn.style.display = 'none';
	btn.addEventListener('mousedown', e => e.stopPropagation());
	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		e.preventDefault();
		if (currentDeleteTargetId) {
			void deleteHighlightById(currentDeleteTargetId);
		}
	});
	document.body.appendChild(btn);
	highlightDeleteButton = btn;
	return btn;
}

// Continue the annotate prototype's textarea and notes storage, addressed by
// the stable highlight id rather than the overlay's transient array index.
function ensureHighlightAnnotateButton(): HTMLButtonElement {
	if (highlightAnnotateButton) {
		if (!highlightAnnotateButton.isConnected) document.body.appendChild(highlightAnnotateButton);
		return highlightAnnotateButton;
	}
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'obsidian-highlight-annotate-button';
	button.textContent = getMessage('annotateHighlight');
	button.style.display = 'none';
	button.addEventListener('mousedown', event => event.stopPropagation());
	button.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		if (currentDeleteTargetId) showAnnotationEditor(currentDeleteTargetId);
	});
	document.body.appendChild(button);
	highlightAnnotateButton = button;
	return button;
}

function closeAnnotationEditor(): void {
	annotationEditor?.remove();
	annotationEditor = null;
}

function positionAnnotationEditor(): void {
	if (!annotationEditor) return;
	// Reader scrolls inside its own container; keep the editor in the viewport.
	const width = annotationEditor.getBoundingClientRect().width || Math.min(320, window.innerWidth - 16);
	const height = annotationEditor.getBoundingClientRect().height || 180;
	const anchor = highlightAnnotateButton?.getBoundingClientRect();
	const left = Math.max(8, Math.min(anchor?.left || 8, window.innerWidth - width - 8));
	const top = Math.max(8, Math.min(anchor?.bottom || 8, window.innerHeight - height - 8));
	annotationEditor.style.left = left + 'px';
	annotationEditor.style.top = top + 'px';
}

function showAnnotationEditor(id: string): void {
	const target = highlights.find(highlight => highlight.id === id);
	if (!target) return;
	if (annotationEditor?.isConnected && annotationEditor.dataset.highlightId === id) {
		annotationEditor.querySelector('textarea')?.focus();
		return;
	}
	closeAnnotationEditor();
	const editor = document.createElement('div');
	editor.className = 'obsidian-highlight-annotation-editor';
	editor.dataset.highlightId = id;
	editor.setAttribute('role', 'dialog');
	editor.setAttribute('aria-label', getMessage('annotateHighlight'));
	const textarea = document.createElement('textarea');
	textarea.className = 'obsidian-highlight-annotation-textarea';
	textarea.placeholder = getMessage('annotationPlaceholder');
	textarea.setAttribute('aria-label', getMessage('annotateHighlight'));
	const members = target.groupId
		? highlights.filter(highlight => highlight.groupId === target.groupId)
		: [target];
	textarea.value = members.flatMap(highlight => highlight.notes ?? []).join('\n');
	const hint = document.createElement('div');
	hint.className = 'obsidian-highlight-annotation-hint';
	hint.textContent = getMessage('annotationShortcut');
	const actions = document.createElement('div');
	actions.className = 'obsidian-highlight-annotation-actions';
	const save = document.createElement('button');
	save.type = 'button';
	save.dataset.action = 'save';
	save.textContent = getMessage('save');
	const cancel = document.createElement('button');
	cancel.type = 'button';
	cancel.dataset.action = 'cancel';
	cancel.textContent = getMessage('cancel');
	const saveNote = () => {
		const value = textarea.value;
		closeAnnotationEditor();
		updateHighlightNotes(id, value);
	};
	save.addEventListener('click', saveNote);
	cancel.addEventListener('click', closeAnnotationEditor);
	textarea.addEventListener('keydown', event => {
		if (event.isComposing) return;
		if (event.key === 'Enter' && event.shiftKey) {
			event.preventDefault();
			saveNote();
		}
	});
	// Escape also cancels after keyboard focus moves to Save or Cancel.
	editor.addEventListener('keydown', event => {
		if (!event.isComposing && event.key === 'Escape') {
			event.preventDefault();
			closeAnnotationEditor();
		}
	});
	// Keep editor input out of article selection and Reader shortcut handlers.
	for (const type of ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend', 'keydown']) {
		editor.addEventListener(type, event => event.stopPropagation());
	}
	actions.append(save, cancel);
	editor.append(textarea, hint, actions);
	document.body.appendChild(editor);
	annotationEditor = editor;
	positionAnnotationEditor();
	textarea.focus();
}

function showHighlightDeleteButtonForText(id: string): void {
	const ranges = textHighlightRanges.get(id);
	if (!ranges || ranges.length === 0) return;
	const rects = ranges[0].getClientRects();
	if (rects.length === 0) return;
	// Compute bounding box across all line rects for center-top positioning.
	let left = Infinity, right = -Infinity, top = Infinity;
	for (let i = 0; i < rects.length; i++) {
		if (rects[i].left < left) left = rects[i].left;
		if (rects[i].right > right) right = rects[i].right;
		if (rects[i].top < top) top = rects[i].top;
	}
	positionDeleteButton(id, (left + right) / 2, top);
}

function showHighlightDeleteButtonForOverlay(overlay: HTMLElement): void {
	const id = overlay.dataset.highlightId;
	if (!id) return;
	const rect = overlay.getBoundingClientRect();
	positionDeleteButton(id, (rect.left + rect.right) / 2, rect.top);
}

function positionDeleteButton(id: string, centerX: number, top: number): void {
	const btn = ensureHighlightDeleteButton();
	currentDeleteTargetId = id;
	btn.style.display = 'flex';
	const annotate = ensureHighlightAnnotateButton();
	annotate.style.display = 'flex';
	const btnWidth = btn.offsetWidth || 80;
	const annotateWidth = annotate.offsetWidth || 90;
	const width = btnWidth + annotateWidth + 4;
	const idealLeft = centerX - width / 2;
	const left = Math.max(4, Math.min(idealLeft, window.innerWidth - width - 4));
	const buttonTop = Math.max(4, top - 28);
	annotate.style.left = (left + window.scrollX) + 'px';
	annotate.style.top = (buttonTop + window.scrollY) + 'px';
	btn.style.left = (left + annotateWidth + 4 + window.scrollX) + 'px';
	btn.style.top = (buttonTop + window.scrollY) + 'px';
}

export function hideHighlightDeleteButton(): void {
	if (highlightDeleteButton) highlightDeleteButton.style.display = 'none';
	if (highlightAnnotateButton) highlightAnnotateButton.style.display = 'none';
	currentDeleteTargetId = null;
}

async function deleteHighlightById(id: string): Promise<void> {
	const target = highlights.find((h: AnyHighlightData) => h.id === id);
	if (!target) return;
	// If the highlight is part of a group (multi-block selection), remove the
	// whole group so the user's single selection acts as one logical delete.
	const next = target.groupId
		? highlights.filter((h: AnyHighlightData) => h.groupId !== target.groupId)
		: highlights.filter((h: AnyHighlightData) => h.id !== id);
	if (next.length === highlights.length) return;
	updateHighlights(next);
	closeAnnotationEditor();
	hideHighlightDeleteButton();
	sortHighlights();
	applyHighlights();
	saveHighlights();
	updateHighlighterMenu();
}

// Nearest ancestor that's a block-whitelist element (figure, picture, img,
// table, pre), or null. Used for one-click block highlighting. FIGURE wraps
// PICTURE/IMG semantically, so it's preferred when both exist in the chain.
function findBlockToHighlight(target: Element | null): Element | null {
	if (!target || target.closest(IGNORED_BOUNDARY_SELECTOR)) return null;
	return target.closest('figure') as Element | null
		?? target.closest('table') as Element | null
		?? target.closest('pre') as Element | null
		?? target.closest('picture') as Element | null
		?? target.closest('img') as Element | null;
}

// Show/hide the remove button on click/tap rather than hover, so it works
// on mobile (no hover). Clicking highlighted text shows the button;
// clicking elsewhere (or a different highlight) hides/repositions it.
let lastHighlightCreatedAt = 0;
export function markHighlightJustCreated(): void {
	lastHighlightCreatedAt = Date.now();
	// Offer Annotate as soon as a selection becomes a highlight. The trailing
	// drag click is ignored below, so it cannot dismiss these actions.
	const selection = window.getSelection();
	if (!selection?.rangeCount) return;
	const range = selection.getRangeAt(0);
	const rect = range.getClientRects?.()[0];
	if (!rect) return;
	const id = findTextHighlightAtPoint((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2);
	if (id) showHighlightDeleteButtonForText(id);
}

function handleHighlightClick(event: MouseEvent) {
	const target = event.target as Element | null;

	// Clicking the remove button, selection button, or a link — let native behavior run.
	if (target?.closest('.obsidian-highlight-delete, .obsidian-highlight-annotate-button, .obsidian-highlight-annotation-editor, .obsidian-selection-action, a[href]')) return;

	// Preserve the actions just offered on selection: the trailing drag click
	// must not dismiss or reposition them.
	if (Date.now() - lastHighlightCreatedAt < 300) return;

	const { clientX, clientY } = event;

	// Text highlight: hit-test stored Ranges.
	const textId = findTextHighlightAtPoint(clientX, clientY);
	if (textId) {
		showHighlightDeleteButtonForText(textId);
		return;
	}

	// Element highlight overlay.
	const overlay = findOverlayAtPoint(clientX, clientY);
	if (overlay) {
		showHighlightDeleteButtonForOverlay(overlay);
		return;
	}

	hideHighlightDeleteButton();
}

// Handle mouse up — create highlight from selection, or from block click.
// Fires only while highlighter is active (attached via toggleHighlighterMenu).
export function handleMouseUp(event: MouseEvent | TouchEvent) {
	let target: Element;
	if (event instanceof MouseEvent) {
		target = event.target as Element;
	} else {
		if (isTouchMoved) {
			isTouchMoved = false;
			return;
		}
		const touch = event.changedTouches[0];
		target = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	if (target?.closest(IGNORED_BOUNDARY_SELECTOR)) return;

	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		// When the user drags past the left/right edge of the content area,
		// browsers extend the selection vertically (up for left, down for
		// right), often selecting the entire article. Detect this by checking
		// whether mouseup landed outside the text column — if so, discard.
		// NOTE: only works in reader mode (.obsidian-reader-content). On live
		// pages the content container isn't known, so this guard is a no-op.
		if (event instanceof MouseEvent) {
			const readerContent = document.querySelector('.obsidian-reader-content');
			if (readerContent) {
				const bounds = readerContent.getBoundingClientRect();
				if (event.clientX < bounds.left || event.clientX > bounds.right) {
					selection.removeAllRanges();
					return;
				}
			}
		}
		handleTextSelection(selection);
		return;
	}

	// Delete button / selection action button — let their own handlers run.
	if (target.closest('.obsidian-highlight-delete, .obsidian-highlight-annotate-button, .obsidian-highlight-annotation-editor, .obsidian-selection-action')) return;

	// Block-level one-click highlight (figure, img, table, pre, picture).
	const block = findBlockToHighlight(target);
	if (block) highlightElement(block);
}

// Add touch start handler
export function handleTouchStart(event: TouchEvent) {
	const touch = event.touches[0];
	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	isTouchMoved = false;
}

export function handleTouchMove(event: TouchEvent) {
	const touch = event.touches[0];
	const moveThreshold = 10;
	if (Math.abs(touch.clientX - touchStartX) > moveThreshold ||
		Math.abs(touch.clientY - touchStartY) > moveThreshold) {
		isTouchMoved = true;
	}
}

// Render one highlight. Text highlights go through the CSS Custom Highlight
// API; element highlights (figure, img, table, pre, picture) get one overlay
// div positioned over the target element.
export function planHighlightOverlayRects(target: Element | null, highlight: AnyHighlightData) {
	if (highlight.type === 'text') {
		// Text highlights re-anchor themselves (XPath, then content fallback),
		// so they don't need a resolved target element.
		renderTextHighlight(highlight);
		return;
	}
	// Element highlights position an overlay over the target, so a stale XPath
	// (null target) means there's nothing to draw.
	if (!target) return;
	const rect = target.getBoundingClientRect();
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightId = highlight.id;
	overlay.style.position = 'absolute';
	overlay.style.left = `${rect.left + window.scrollX - 2}px`;
	overlay.style.top = `${rect.top + window.scrollY - 2}px`;
	overlay.style.width = `${rect.width + 4}px`;
	overlay.style.height = `${rect.height + 4}px`;
	if (highlight.notes && highlight.notes.length > 0) {
		overlay.setAttribute('data-notes', JSON.stringify(highlight.notes));
	}
	const atPoint = document.elementFromPoint(rect.left, rect.top);
	if (atPoint && isDarkColor(getEffectiveBackgroundColor(atPoint as HTMLElement))) {
		overlay.classList.add('obsidian-highlight-overlay-dark');
	}
	document.body.appendChild(overlay);
}

function getEffectiveBackgroundColor(element: HTMLElement): string {
	let current: HTMLElement | null = element;
	while (current) {
		const bg = window.getComputedStyle(current).backgroundColor;
		if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
		current = current.parentElement;
	}
	return 'rgb(255, 255, 255)';
}

// Reposition element overlays after layout changes. Text highlights paint
// against the live text via CSS.highlights and reposition natively.
function updateHighlightOverlayPositions() {
	highlights.forEach((highlight) => {
		if (highlight.type === 'text') return;
		const target = getElementByXPath(highlight.xpath);
		if (!target) return;
		document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-id="${highlight.id}"]`)
			.forEach(el => el.remove());
		planHighlightOverlayRects(target, highlight);
	});
}

const throttledUpdateHighlights = throttle(() => {
	if (!isApplyingHighlights) updateHighlightOverlayPositions();
}, 100);

window.addEventListener('resize', () => { throttledUpdateHighlights(); hideHighlightDeleteButton(); positionAnnotationEditor(); });
window.addEventListener('scroll', throttledUpdateHighlights);

// Mutation observer re-positions element overlays when the page reflows.
// Lazily connected — observing document.body on every page the extension
// runs on (before any highlights exist) is wasted work, especially on busy
// SPAs. syncHoverListener connects/disconnects based on need.
const observer = new MutationObserver((mutations) => {
	if (isApplyingHighlights) return;
	const shouldUpdate = mutations.some(m => {
		if (!(m.target instanceof Element) || m.target.id.startsWith('obsidian-highlight') || m.target.closest('.obsidian-highlight-annotation-editor, .obsidian-highlight-annotate-button, .obsidian-highlight-delete')) return false;
		return m.type === 'childList'
			|| (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class'));
	});
	if (shouldUpdate) throttledUpdateHighlights();
});

// cursor:pointer on highlight hover + Alt+hover to surface the Remove
// button. Gated by rAF to avoid redundant hit-tests within the same frame.
let hoverRafPending = false;
let lastCursor = '';
function handleHighlightHover(event: MouseEvent) {
	if (hoverRafPending) return;
	// Capture values synchronously — the event object is reused.
	const { clientX, clientY, altKey } = event;
	const target = event.target as Element | null;
	hoverRafPending = true;
	requestAnimationFrame(() => {
		hoverRafPending = false;
		if (target?.closest('.obsidian-highlight-annotation-editor')) return;
		const textId = findTextHighlightAtPoint(clientX, clientY);
		const overlay = !textId ? findOverlayAtPoint(clientX, clientY) : null;
		const onHighlight = !!textId || !!overlay;
		const cursor = onHighlight ? 'pointer' : '';
		if (cursor !== lastCursor) { document.body.style.cursor = cursor; lastCursor = cursor; }

		const onButton = !!target?.closest('.obsidian-highlight-delete, .obsidian-highlight-annotate-button');

		if (altKey && (onHighlight || onButton)) {
			if (textId) showHighlightDeleteButtonForText(textId);
			else if (overlay) showHighlightDeleteButtonForOverlay(overlay);
			deleteButtonShownViaAlt = true;
		} else if (deleteButtonShownViaAlt) {
			hideHighlightDeleteButton();
			deleteButtonShownViaAlt = false;
		}
	});
}

// Click + mousemove + mutation observer attached lazily — only when
// highlights exist on this page OR highlighter is active.
let listenersAttached = false;
let observerAttached = false;
export function syncHoverListener(): void {
	const isActive = document.body.classList.contains('obsidian-highlighter-active');
	const needed = highlights.length > 0 || isActive;
	if (needed && !listenersAttached) {
		// Capture phase so the click fires before disableLinkClicks()'s
		// stopPropagation on <a> elements — otherwise clicking highlighted
		// text inside or near a link never reaches a bubbling handler.
		document.addEventListener('click', handleHighlightClick, true);
		document.addEventListener('mousemove', handleHighlightHover);
		listenersAttached = true;
	} else if (!needed && listenersAttached) {
		document.removeEventListener('click', handleHighlightClick, true);
		document.removeEventListener('mousemove', handleHighlightHover);
		document.body.style.cursor = '';
		listenersAttached = false;
		hideHighlightDeleteButton();
		closeAnnotationEditor();
	}
	if (needed && !observerAttached) {
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class'],
			characterData: false,
		});
		observerAttached = true;
	} else if (!needed && observerAttached) {
		observer.disconnect();
		observerAttached = false;
	}
}

// Remove all existing highlight overlays from the page
export function removeExistingHighlights() {
	if (annotationEditor && !highlights.some(highlight => highlight.id === annotationEditor?.dataset.highlightId)) closeAnnotationEditor();
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(el => el.remove());
	clearTextHighlights();
	hideHighlightDeleteButton();
}