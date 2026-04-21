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
} from './highlighter';
import { throttle } from './throttle';
import { getElementByXPath, isDarkColor, setElementHTML } from './dom-utils';
import { getMessage } from './i18n';
import { debugLog } from './debug';

let touchStartX: number = 0;
let touchStartY: number = 0;
let isTouchMoved: boolean = false;

const IGNORED_BOUNDARY_SELECTOR =
	'.obsidian-highlighter-menu, .obsidian-reader-settings, .transcript-segment > strong, .obsidian-highlight-delete, .obsidian-selection-action';

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

export function renderTextHighlight(highlight: { id: string; xpath: string; startOffset: number; endOffset: number }): void {
	const hl = ensureUserHighlight();
	if (!hl) return;
	const container = getElementByXPath(highlight.xpath);
	if (!container) return;
	const start = findTextNodeAtOffset(container, highlight.startOffset);
	const end = findTextNodeAtOffset(container, highlight.endOffset);
	if (!start || !end) return;
	try {
		const range = document.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		if (range.collapsed) return;
		hl.add(range);
		const existing = textHighlightRanges.get(highlight.id);
		if (existing) existing.push(range);
		else textHighlightRanges.set(highlight.id, [range]);
	} catch (e) {
		console.warn('Failed to build Range for text highlight', highlight.id, e);
	}
}

export function clearTextHighlights(): void {
	userHighlight?.clear();
	textHighlightRanges.clear();
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
let currentDeleteTargetId: string | null = null;
let deleteButtonShownViaAlt = false;

function ensureHighlightDeleteButton(): HTMLButtonElement {
	if (highlightDeleteButton) return highlightDeleteButton;
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
	const btnWidth = btn.offsetWidth || 80;
	const idealLeft = centerX - btnWidth / 2;
	const clampedLeft = Math.max(4, Math.min(idealLeft, window.innerWidth - btnWidth - 4));
	btn.style.left = `${clampedLeft + window.scrollX}px`;
	btn.style.top = `${top + window.scrollY - 28}px`;
}

export function hideHighlightDeleteButton(): void {
	if (highlightDeleteButton) highlightDeleteButton.style.display = 'none';
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
}

function handleHighlightClick(event: MouseEvent) {
	const target = event.target as Element | null;

	// Clicking the remove button, selection button, or a link — let native behavior run.
	if (target?.closest('.obsidian-highlight-delete, .obsidian-selection-action, a[href]')) return;

	// Don't show the remove button immediately after creating a highlight —
	// the click that ends a drag-selection shouldn't also surface "Remove".
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
	if (target.closest('.obsidian-highlight-delete, .obsidian-selection-action')) return;

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
export function planHighlightOverlayRects(target: Element, highlight: AnyHighlightData) {
	if (highlight.type === 'text') {
		renderTextHighlight(highlight);
		return;
	}
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

window.addEventListener('resize', () => { throttledUpdateHighlights(); hideHighlightDeleteButton(); });
window.addEventListener('scroll', throttledUpdateHighlights);

// Mutation observer re-positions element overlays when the page reflows.
// Lazily connected — observing document.body on every page the extension
// runs on (before any highlights exist) is wasted work, especially on busy
// SPAs. syncHoverListener connects/disconnects based on need.
const observer = new MutationObserver((mutations) => {
	if (isApplyingHighlights) return;
	const shouldUpdate = mutations.some(m => {
		if (!(m.target instanceof Element) || m.target.id.startsWith('obsidian-highlight')) return false;
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
		const textId = findTextHighlightAtPoint(clientX, clientY);
		const overlay = !textId ? findOverlayAtPoint(clientX, clientY) : null;
		const onHighlight = !!textId || !!overlay;
		const cursor = onHighlight ? 'pointer' : '';
		if (cursor !== lastCursor) { document.body.style.cursor = cursor; lastCursor = cursor; }

		const onButton = !!target?.closest('.obsidian-highlight-delete');

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
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(el => el.remove());
	clearTextHighlights();
	hideHighlightDeleteButton();
}