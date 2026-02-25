import { 
	handleTextSelection, 
	highlightElement, 
	AnyHighlightData, 
	TextHighlightData,
	highlights, 
	isApplyingHighlights,
	sortHighlights,
	applyHighlights,
	saveHighlights,
	updateHighlights,
	updateHighlighterMenu,
	setLastUsedHighlightColor
} from './highlighter';
import browser from './browser-polyfill';
import { throttle } from './throttle';
import { getElementByXPath, isDarkColor } from './dom-utils';
import {
	initializeHighlightWidget,
	isHighlightWidgetElement,
	scheduleHighlightWidgetOpenFromPoint,
	openHighlightWidgetForOverlay,
	syncHighlightWidgetPosition,
	closeHighlightWidget,
	hideHighlightWidgetTooltip,
	decorateHighlightOverlayElement
} from './highlighter-widget';

let hoverOverlay: HTMLElement | null = null;
let touchStartX: number = 0;
let touchStartY: number = 0;
let isTouchMoved: boolean = false;
let lastHoverTarget: Element | null = null;

const LINE_BY_LINE_OVERLAY_TAGS = ['P'];
const SELECTED_OVERLAY_CLASS = 'is-selected';
const OVERLAY_SELECTOR = '.obsidian-highlight-overlay';
const HIGHLIGHT_SELECTION_MESSAGE = 'highlightSelectedInPage';
const OFFSET_HANDLE_CLASS = 'obsidian-highlight-offset-handle';
const OFFSET_HANDLE_SIZE_PX = 12;
const OFFSET_HANDLE_EDGE_START = 'start';
const OFFSET_HANDLE_EDGE_END = 'end';
const OFFSET_HANDLE_DRAG_THRESHOLD_PX = 2;
const OFFSET_HANDLE_DRAGGING_CLASS = 'obsidian-offset-handle-dragging';
const HIGHLIGHT_SELECTION_COLOR_VAR = '--obsidian-highlight-selection-color';
const DEFAULT_SELECTION_PREVIEW_ALPHA = 0.35;
const DRAG_SELECTION_PREVIEW_ALPHA = 0.72;
const DEFAULT_HIGHLIGHT_SELECTION_COLOR = 'rgba(255, 235, 0, 0.35)';
const CARET_HIT_TEST_OFFSETS_PX: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[-1, 0],
	[1, 0],
	[0, -1],
	[0, 1],
	[-2, 0],
	[2, 0],
	[0, -2],
	[0, 2]
];

let selectedHighlightId: string | null = null;
let selectedHighlightIndex: string | null = null;
let startOffsetHandle: HTMLElement | null = null;
let endOffsetHandle: HTMLElement | null = null;
let suppressNextMouseUpHighlight: boolean = false;
let activeOffsetHandleDrag: OffsetHandleDragState | null = null;

type OffsetHandleDragInputType = 'pointer' | 'mouse';

interface OffsetHandleDragState {
	anchorNode: Node;
	anchorOffset: number;
	target: Element;
	edge: 'start' | 'end';
	pointerId: number | null;
	inputType: OffsetHandleDragInputType;
	handle: HTMLElement;
	startClientX: number;
	startClientY: number;
	hasMoved: boolean;
	initialSelectionText: string;
	disabledOverlayPointerEvents: Array<{ overlay: HTMLElement; value: string }>;
}

interface OverlaySelectionOptions {
	openWidget?: boolean;
	scrollIntoView?: boolean;
	notifyPanel?: boolean;
	openPoint?: { clientX: number; clientY: number } | null;
}

function normalizeSelectionColor(color?: string, alpha: number = DEFAULT_SELECTION_PREVIEW_ALPHA): string {
	if (typeof color !== 'string') {
		return DEFAULT_HIGHLIGHT_SELECTION_COLOR;
	}

	const normalized = color.trim().toLowerCase();
	if (/^#[0-9a-f]{3}$/.test(normalized)) {
		const r = parseInt(normalized[1] + normalized[1], 16);
		const g = parseInt(normalized[2] + normalized[2], 16);
		const b = parseInt(normalized[3] + normalized[3], 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	if (/^#[0-9a-f]{6}$/.test(normalized)) {
		const r = parseInt(normalized.slice(1, 3), 16);
		const g = parseInt(normalized.slice(3, 5), 16);
		const b = parseInt(normalized.slice(5, 7), 16);
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	const rgbMatch = normalized.match(/^rgba?\(([^)]+)\)$/);
	if (rgbMatch) {
		const parts = rgbMatch[1]
			.split(',')
			.map((part) => Number.parseFloat(part.trim()))
			.filter((value) => Number.isFinite(value));
		if (parts.length >= 3) {
			const r = Math.max(0, Math.min(255, Math.round(parts[0])));
			const g = Math.max(0, Math.min(255, Math.round(parts[1])));
			const b = Math.max(0, Math.min(255, Math.round(parts[2])));
			return `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}
	}

	return DEFAULT_HIGHLIGHT_SELECTION_COLOR;
}

function setSelectionPreviewColor(color?: string, alpha: number = DEFAULT_SELECTION_PREVIEW_ALPHA): void {
	document.documentElement.style.setProperty(
		HIGHLIGHT_SELECTION_COLOR_VAR,
		normalizeSelectionColor(color, alpha)
	);
}

// Wire overlay-owned widget callbacks once for this content-script context.
initializeHighlightWidget({
	getHighlights: () => highlights,
	persistHighlights: (nextHighlights: AnyHighlightData[]) => {
		updateHighlights(nextHighlights);
		sortHighlights();
		applyHighlights();
		saveHighlights();
		updateHighlighterMenu();
	},
	rememberColorPreference: (color: string) => {
		setLastUsedHighlightColor(color);
	}
});

// Check if an element should be ignored for highlighting
function isIgnoredElement(element: Element): boolean {
	const tagName = element.tagName.toUpperCase();
	const isDisallowedTag = ![
		'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
		'MATH', 'FIGURE', 'UL', 'OL', 'TABLE', 'LI', 'TR', 'TD', 'TH', 'CODE', 'PRE', 'BLOCKQUOTE', 'EM', 'STRONG', 'A'
	].includes(tagName);

	return element.tagName.toLowerCase() === 'html' || 
		element.tagName.toLowerCase() === 'body' || 
		element.classList.contains('obsidian-highlighter-menu') ||
		element.closest('.obsidian-highlighter-menu') !== null ||
		element.classList.contains(OFFSET_HANDLE_CLASS) ||
		element.closest(`.${OFFSET_HANDLE_CLASS}`) !== null ||
		isHighlightWidgetElement(element) ||
		isDisallowedTag;
}

// Returns true when an element belongs to highlighter-owned UI.
// Why: used by MutationObserver filtering and ignore checks so our own overlay/widget DOM changes
// do not trigger highlight repaint loops or accidental hover/selection handling.
function isHighlighterManagedElement(element: Element): boolean {
	return (
		element.id.startsWith('obsidian-highlight') ||
		element.classList.contains('obsidian-highlight-overlay') ||
		element.classList.contains(OFFSET_HANDLE_CLASS) ||
		isHighlightWidgetElement(element) ||
		element.classList.contains('obsidian-highlighter-menu') ||
		element.closest('.obsidian-highlighter-menu') !== null
	);
}

// True when a childList mutation only adds/removes highlighter-owned nodes.
// Why: used inside MutationObserver to skip no-op repaint cycles caused by overlay/widget updates.
function isChildListMutationOnlyHighlighterManaged(mutation: MutationRecord): boolean {
	const allChangedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
	if (allChangedNodes.length === 0) {
		return false;
	}

	return allChangedNodes.every((node) => (
		node instanceof Element && isHighlighterManagedElement(node)
	));
}

// Normalizes mouse/touch events to one viewport point.
// Why: click/touch flows share overlay hit-testing (findOverlayFromEvent) and immediate widget open.
function getEventPoint(event: MouseEvent | TouchEvent | Event): { clientX: number; clientY: number } | null {
	if (event instanceof MouseEvent) {
		return { clientX: event.clientX, clientY: event.clientY };
	} else if (event instanceof TouchEvent && event.changedTouches.length > 0) {
		return {
			clientX: event.changedTouches[0].clientX,
			clientY: event.changedTouches[0].clientY
		};
	}
	return null;
}

// Finds the topmost highlight overlay at viewport coordinates.
// Why: fallback path when event.target is not the overlay root (e.g. nested badge/icon).
function findOverlayAtPoint(clientX: number, clientY: number): HTMLElement | null {
	const overlays = Array.from(document.querySelectorAll('.obsidian-highlight-overlay')) as HTMLElement[];
	for (let i = overlays.length - 1; i >= 0; i--) {
		const overlay = overlays[i];
		const rect = overlay.getBoundingClientRect();
		if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
			return overlay;
		}
	}
	return null;
}

// Resolves an overlay from event target first, then coordinate hit-test fallback.
// Why: used by click/touch handlers and mouseup flow so widget open works reliably across DOM variations.
function findOverlayFromEvent(event: MouseEvent | TouchEvent | Event): HTMLElement | null {
	const target = event.target instanceof Element
		? event.target.closest('.obsidian-highlight-overlay') as HTMLElement | null
		: null;
	if (target) {
		return target;
	}

	const point = getEventPoint(event);
	if (!point) {
		return null;
	}

	return findOverlayAtPoint(point.clientX, point.clientY);
}

function notifyPanelSelection(highlightId: string): void {
	if (!highlightId) {
		return;
	}
	browser.runtime.sendMessage({
		action: HIGHLIGHT_SELECTION_MESSAGE,
		highlightId
	}).catch(() => {
		// Panel might be closed; selection still applies locally.
	});
}

function getMatchingOverlays(highlightId: string | null, highlightIndex: string | null): HTMLElement[] {
	const overlays = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)) as HTMLElement[];
	let matches: HTMLElement[] = [];

	if (highlightId) {
		matches = overlays.filter((overlay) => overlay.dataset.highlightId === highlightId);
		if (matches.length > 0) {
			return matches.sort((a, b) => {
				const aRect = a.getBoundingClientRect();
				const bRect = b.getBoundingClientRect();
				if (Math.abs(aRect.top - bRect.top) > 1) {
					return aRect.top - bRect.top;
				}
				return aRect.left - bRect.left;
			});
		}
	}

	if (highlightIndex) {
		matches = overlays.filter((overlay) => overlay.dataset.highlightIndex === highlightIndex);
	}

	return matches.sort((a, b) => {
		const aRect = a.getBoundingClientRect();
		const bRect = b.getBoundingClientRect();
		if (Math.abs(aRect.top - bRect.top) > 1) {
			return aRect.top - bRect.top;
		}
		return aRect.left - bRect.left;
	});
}

function resolveSelectedTextHighlight(): { highlight: TextHighlightData; target: Element } | null {
	let selectedHighlight: AnyHighlightData | undefined;

	if (selectedHighlightId) {
		selectedHighlight = highlights.find((item) => item.id === selectedHighlightId);
	}

	if (!selectedHighlight && selectedHighlightIndex) {
		const parsedIndex = Number.parseInt(selectedHighlightIndex, 10);
		if (Number.isInteger(parsedIndex) && parsedIndex >= 0 && parsedIndex < highlights.length) {
			selectedHighlight = highlights[parsedIndex];
		}
	}

	if (!selectedHighlight || selectedHighlight.type !== 'text') {
		return null;
	}

	const target = getElementByXPath(selectedHighlight.xpath);
	if (!target) {
		return null;
	}

	return {
		highlight: selectedHighlight,
		target
	};
}

function ensureOffsetHandle(edge: 'start' | 'end'): HTMLElement {
	const existing = edge === OFFSET_HANDLE_EDGE_START ? startOffsetHandle : endOffsetHandle;
	if (existing) {
		return existing;
	}

	const handle = document.createElement('div');
	handle.className = `${OFFSET_HANDLE_CLASS} ${OFFSET_HANDLE_CLASS}-${edge}`;
	handle.dataset.edge = edge;
	handle.title = edge === OFFSET_HANDLE_EDGE_START ? 'Adjust highlight start' : 'Adjust highlight end';
	handle.setAttribute('role', 'button');
	handle.setAttribute('aria-label', handle.title);
	handle.style.display = 'none';

	handle.addEventListener('pointerdown', handleOffsetHandleDown);
	handle.addEventListener('mousedown', handleOffsetHandleMouseDown);
	document.body.appendChild(handle);

	if (edge === OFFSET_HANDLE_EDGE_START) {
		startOffsetHandle = handle;
	} else {
		endOffsetHandle = handle;
	}

	return handle;
}

// Toggles a global "dragging offset handle" UI mode on the root element.
// Why: drag-specific selection styling should stay stable without triggering body-class mutation repaint paths.
function setOffsetHandleDraggingState(isDragging: boolean): void {
	document.documentElement.classList.toggle(OFFSET_HANDLE_DRAGGING_CLASS, isDragging);
}

function hideOffsetHandles(): void {
	if (activeOffsetHandleDrag) {
		teardownOffsetHandleDrag();
	}
	setOffsetHandleDraggingState(false);

	setSelectionPreviewColor();

	if (startOffsetHandle) {
		startOffsetHandle.style.display = 'none';
	}
	if (endOffsetHandle) {
		endOffsetHandle.style.display = 'none';
	}
}

function positionOffsetHandle(handle: HTMLElement, rect: DOMRect, edge: 'start' | 'end'): void {
	const left = edge === OFFSET_HANDLE_EDGE_START
		? rect.left + window.scrollX - OFFSET_HANDLE_SIZE_PX / 2
		: rect.right + window.scrollX - OFFSET_HANDLE_SIZE_PX / 2;
	const top = edge === OFFSET_HANDLE_EDGE_START
		? rect.top + window.scrollY - OFFSET_HANDLE_SIZE_PX
		: rect.bottom + window.scrollY;
	handle.style.left = `${left}px`;
	handle.style.top = `${top}px`;
	handle.style.display = 'flex';
	applyOffsetHandleLineHeight(handle, rect.height);
}

// Returns a caret-like rect for a text boundary so dragged handles can follow text rows/characters.
// Why: during resize we want handle movement tied to selection/caret geometry, not raw pointer pixels.
function getCaretRectAtPoint(node: Node, offset: number): DOMRect | null {
	const range = document.createRange();
	try {
		range.setStart(node, offset);
		range.setEnd(node, offset);
	} catch {
		return null;
	}

	let rect = range.getBoundingClientRect();
	if ((rect.width > 0 || rect.height > 0) && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
		return rect;
	}

	// Fallback: use an adjacent glyph rect to recover line metrics when collapsed ranges are zero-sized.
	if (node.nodeType === Node.TEXT_NODE) {
		const textLength = node.textContent?.length || 0;
		if (textLength > 0) {
			const from = Math.max(0, Math.min(offset, textLength - 1));
			const to = Math.max(from + 1, Math.min(textLength, from + 1));
			try {
				range.setStart(node, from);
				range.setEnd(node, to);
				rect = range.getBoundingClientRect();
				if ((rect.width > 0 || rect.height > 0) && Number.isFinite(rect.left) && Number.isFinite(rect.top)) {
					return rect;
				}
			} catch {
				// Ignore fallback failure; caller will keep previous handle position.
			}
		}
	}

	return null;
}

// Updates handle bar length to match nearby text line-height.
// Why: the vertical stem should align with text rows, not stay a fixed pixel length.
function applyOffsetHandleLineHeight(handle: HTMLElement, lineHeightPx: number): void {
	const normalizedHeight = Number.isFinite(lineHeightPx) ? lineHeightPx : OFFSET_HANDLE_SIZE_PX;
	const stemLength = Math.max(1, Math.round(normalizedHeight));
	handle.style.setProperty('--obsidian-offset-handle-bar-length', `${stemLength}px`);
}

function updateOffsetHandles(): void {
	const selectedTextHighlight = resolveSelectedTextHighlight();
	if (!selectedTextHighlight) {
		hideOffsetHandles();
		return;
	}

	setSelectionPreviewColor(selectedTextHighlight.highlight.color);

	const overlays = getMatchingOverlays(selectedHighlightId, selectedHighlightIndex);
	if (overlays.length === 0) {
		hideOffsetHandles();
		return;
	}

	const startHandle = ensureOffsetHandle(OFFSET_HANDLE_EDGE_START);
	const endHandle = ensureOffsetHandle(OFFSET_HANDLE_EDGE_END);
	const startOverlay = overlays[0];
	const endOverlay = overlays[overlays.length - 1];
	if (!startOverlay || !endOverlay) {
		hideOffsetHandles();
		return;
	}

	positionOffsetHandle(startHandle, startOverlay.getBoundingClientRect(), OFFSET_HANDLE_EDGE_START);
	positionOffsetHandle(endHandle, endOverlay.getBoundingClientRect(), OFFSET_HANDLE_EDGE_END);
}

function applyNativeSelection(anchor: { node: Node; offset: number }, focus: { node: Node; offset: number }): void {
	const selection = window.getSelection();
	if (!selection) {
		return;
	}

	selection.removeAllRanges();
	try {
		selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
		return;
	} catch {
		// Fall back to a range in either direction when setBaseAndExtent is unavailable.
	}

	const range = document.createRange();
	try {
		range.setStart(anchor.node, anchor.offset);
		range.setEnd(focus.node, focus.offset);
		selection.addRange(range);
		return;
	} catch {
		// Try reverse order if focus is before anchor.
	}

	try {
		range.setStart(focus.node, focus.offset);
		range.setEnd(anchor.node, anchor.offset);
		selection.addRange(range);
	} catch {
		selection.removeAllRanges();
	}
}

function getLegacyTextOffset(container: Element, targetNode: Node, targetOffset: number): number {
	let offset = 0;
	const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	let node: Node | null = treeWalker.currentNode;

	while (node) {
		if (node === targetNode) {
			return offset + targetOffset;
		}
		offset += node.textContent?.length || 0;
		node = treeWalker.nextNode();
	}

	return offset;
}

function shouldUseCanonicalOffsetDecoding(target: Element, startOffset: number, endOffset: number): boolean {
	const totalTextLength = target.textContent?.length || 0;
	if (totalTextLength <= 0) {
		return false;
	}

	// Legacy encoding stores offsets as (totalTextLength + actualOffset).
	// Canonical encoding stores raw offsets from the first text node.
	return startOffset < totalTextLength || endOffset < totalTextLength;
}

function updateSelectedTextHighlightFromSelection(selection: Selection): boolean {
	if (selection.rangeCount === 0 || selection.isCollapsed) {
		return false;
	}

	const selectedTextHighlight = resolveSelectedTextHighlight();
	if (!selectedTextHighlight) {
		return false;
	}

	const range = selection.getRangeAt(0);
	const { target } = selectedTextHighlight;
	const rawStart = getLegacyTextOffset(target, range.startContainer, range.startOffset);
	const rawEnd = getLegacyTextOffset(target, range.endContainer, range.endOffset);
	const startOffset = Math.min(rawStart, rawEnd);
	const endOffset = Math.max(rawStart, rawEnd);
	if (startOffset === endOffset) {
		return false;
	}

	const selectedContent = selection.toString();
	const mappedHighlights = highlights.map((item, index) => {
		const itemMatchesById = Boolean(selectedHighlightId && item.id === selectedHighlightId);
		const itemMatchesByIndex = selectedHighlightIndex === String(index);
		const isTargetHighlight = itemMatchesById || itemMatchesByIndex;
		if (!isTargetHighlight || item.type !== 'text') {
			return item;
		}

		return {
			...item,
			startOffset,
			endOffset,
			content: selectedContent
		};
	});

	updateHighlights(mappedHighlights);
	sortHighlights();
	applyHighlights();
	saveHighlights();
	updateHighlighterMenu();
	return true;
}

function getRawCaretPointAtClientPosition(
	clientX: number,
	clientY: number
): { node: Node; offset: number } | null {
	const documentWithCaret = document as Document & {
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
		caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
	};

	let node: Node | null = null;
	let offset = 0;

	if (typeof documentWithCaret.caretRangeFromPoint === 'function') {
		const caretRange = documentWithCaret.caretRangeFromPoint(clientX, clientY);
		if (caretRange) {
			node = caretRange.startContainer;
			offset = caretRange.startOffset;
		}
	} else if (typeof documentWithCaret.caretPositionFromPoint === 'function') {
		const caretPosition = documentWithCaret.caretPositionFromPoint(clientX, clientY);
		if (caretPosition) {
			node = caretPosition.offsetNode;
			offset = caretPosition.offset;
		}
	}

	if (!node) {
		return null;
	}

	return { node, offset };
}

function getCaretPointAtClientPosition(
	clientX: number,
	clientY: number,
	target: Element
): { node: Node; offset: number } | null {
	for (const [dx, dy] of CARET_HIT_TEST_OFFSETS_PX) {
		const rawPoint = getRawCaretPointAtClientPosition(clientX + dx, clientY + dy);
		if (!rawPoint || !target.contains(rawPoint.node)) {
			continue;
		}

		return resolveCaretPointToTextNode(target, rawPoint.node, rawPoint.offset);
	}

	return null;
}

// Converts caret hit-test output to a concrete text-node point.
// Why: drag-resize depends on text-node anchors; some engines return element-boundary carets.
function resolveCaretPointToTextNode(
	target: Element,
	node: Node,
	offset: number
): { node: Node; offset: number } | null {
	if (node.nodeType === Node.TEXT_NODE) {
		const length = node.textContent?.length || 0;
		return {
			node,
			offset: Math.max(0, Math.min(offset, length))
		};
	}

	const boundaryRange = document.createRange();
	try {
		boundaryRange.selectNodeContents(target);
		boundaryRange.setEnd(node, offset);
	} catch {
		return null;
	}

	const canonicalOffset = boundaryRange.toString().length;
	const resolved = findTextNodeAtOffset(target, canonicalOffset, true);
	if (!resolved) {
		return null;
	}

	const length = resolved.node.textContent?.length || 0;
	return {
		node: resolved.node,
		offset: Math.max(0, Math.min(resolved.offset, length))
	};
}

function teardownOffsetHandleDrag(): void {
	if (!activeOffsetHandleDrag) {
		return;
	}

	activeOffsetHandleDrag.disabledOverlayPointerEvents.forEach(({ overlay, value }) => {
		overlay.style.pointerEvents = value;
	});

	document.removeEventListener('pointermove', handleOffsetHandleDragMove, true);
	document.removeEventListener('pointerup', handleOffsetHandlePointerUp, true);
	document.removeEventListener('pointercancel', handleOffsetHandlePointerCancel, true);
	document.removeEventListener('mousemove', handleOffsetHandleDragMove, true);
	document.removeEventListener('mouseup', handleOffsetHandleMouseUp, true);

	if (activeOffsetHandleDrag.pointerId !== null) {
		try {
			activeOffsetHandleDrag.handle.releasePointerCapture(activeOffsetHandleDrag.pointerId);
		} catch {
			// Pointer capture may not be available or currently active.
		}
	}

	setOffsetHandleDraggingState(false);
	const selectedTextHighlight = resolveSelectedTextHighlight();
	setSelectionPreviewColor(selectedTextHighlight?.highlight.color);
	activeOffsetHandleDrag = null;
}

function handleOffsetHandleDragMove(event: PointerEvent | MouseEvent): void {
	if (!activeOffsetHandleDrag) {
		return;
	}

	if (activeOffsetHandleDrag.inputType === 'pointer') {
		if (!(event instanceof PointerEvent) || activeOffsetHandleDrag.pointerId === null) {
			return;
		}
		if (event.pointerId !== activeOffsetHandleDrag.pointerId) {
			return;
		}
	} else if (event instanceof PointerEvent) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();

	// Keep caret hit-testing on page text, not on the dragged handle itself.
	const handle = activeOffsetHandleDrag.handle;
	const previousPointerEvents = handle.style.pointerEvents;
	handle.style.pointerEvents = 'none';

	if (
		Math.abs(event.clientX - activeOffsetHandleDrag.startClientX) > OFFSET_HANDLE_DRAG_THRESHOLD_PX ||
		Math.abs(event.clientY - activeOffsetHandleDrag.startClientY) > OFFSET_HANDLE_DRAG_THRESHOLD_PX
	) {
		activeOffsetHandleDrag.hasMoved = true;
	}

	const focus = getCaretPointAtClientPosition(event.clientX, event.clientY, activeOffsetHandleDrag.target);
	handle.style.pointerEvents = previousPointerEvents;
	if (!focus) {
		return;
	}

	applyNativeSelection(
		{
			node: activeOffsetHandleDrag.anchorNode,
			offset: activeOffsetHandleDrag.anchorOffset
		},
		focus
	);

	const caretRect = getCaretRectAtPoint(focus.node, focus.offset);
	if (caretRect) {
		positionOffsetHandle(handle, caretRect, activeOffsetHandleDrag.edge);
	}
}

// Finalizes a resize drag by committing the current native selection to the selected highlight.
// Why: pointer and mouse paths share the same completion semantics and widget reopening behavior.
function finalizeOffsetHandleDrag(clientX: number, clientY: number): void {
	if (!activeOffsetHandleDrag) {
		return;
	}

	const selection = window.getSelection();
	const currentSelectionText = selection?.toString() || '';
	const didChangeSelection = activeOffsetHandleDrag.hasMoved || currentSelectionText !== activeOffsetHandleDrag.initialSelectionText;

	teardownOffsetHandleDrag();
	suppressNextMouseUpHighlight = true;

	if (!didChangeSelection || !selection || selection.isCollapsed) {
		return;
	}

	if (updateSelectedTextHighlightFromSelection(selection)) {
		selection.removeAllRanges();
		scheduleHighlightWidgetOpenFromPoint({ clientX, clientY });
	}
}

function handleOffsetHandlePointerUp(event: PointerEvent): void {
	if (!activeOffsetHandleDrag) {
		return;
	}
	if (activeOffsetHandleDrag.inputType !== 'pointer' || activeOffsetHandleDrag.pointerId === null) {
		return;
	}
	if (event.pointerId !== activeOffsetHandleDrag.pointerId) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	finalizeOffsetHandleDrag(event.clientX, event.clientY);
}

function handleOffsetHandlePointerCancel(event: PointerEvent): void {
	if (!activeOffsetHandleDrag) {
		return;
	}
	if (activeOffsetHandleDrag.inputType !== 'pointer' || activeOffsetHandleDrag.pointerId === null) {
		return;
	}
	if (event.pointerId !== activeOffsetHandleDrag.pointerId) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	teardownOffsetHandleDrag();
	suppressNextMouseUpHighlight = true;
}

function handleOffsetHandleMouseUp(event: MouseEvent): void {
	if (!activeOffsetHandleDrag || activeOffsetHandleDrag.inputType !== 'mouse') {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	finalizeOffsetHandleDrag(event.clientX, event.clientY);
}

// Starts a text-highlight resize drag from either pointer or mouse initiation.
// Why: some environments do not deliver pointer events consistently, but resize must stay fluent.
function beginOffsetHandleDrag(
	handle: HTMLElement,
	edge: 'start' | 'end',
	clientX: number,
	clientY: number,
	inputType: OffsetHandleDragInputType,
	pointerId: number | null
): void {
	hideHighlightWidgetTooltip();

	const selectedRange = selectHighlightTextFromOpposingEdge(edge);
	if (!selectedRange) {
		return;
	}

	if (activeOffsetHandleDrag) {
		teardownOffsetHandleDrag();
	}

	// Disable pointer events on all overlays during drag so overlapping highlights
	// cannot block caret hit-testing while resizing the selected highlight.
	const overlaysForDrag = Array.from(
		document.querySelectorAll(OVERLAY_SELECTOR)
	) as HTMLElement[];
	const disabledOverlayPointerEvents = overlaysForDrag.map((overlay) => {
		const value = overlay.style.pointerEvents;
		overlay.style.pointerEvents = 'none';
		return { overlay, value };
	});

	activeOffsetHandleDrag = {
		anchorNode: selectedRange.anchorNode,
		anchorOffset: selectedRange.anchorOffset,
		target: selectedRange.target,
		edge,
		pointerId,
		inputType,
		handle,
		startClientX: clientX,
		startClientY: clientY,
		hasMoved: false,
		initialSelectionText: window.getSelection()?.toString() || '',
		disabledOverlayPointerEvents
	};
	setOffsetHandleDraggingState(true);
	const selectedTextHighlight = resolveSelectedTextHighlight();
	setSelectionPreviewColor(selectedTextHighlight?.highlight.color, DRAG_SELECTION_PREVIEW_ALPHA);

	if (inputType === 'pointer' && pointerId !== null) {
		try {
			handle.setPointerCapture(pointerId);
		} catch {
			// Pointer capture can fail on some engines; document listeners still handle drag.
		}
	}

	document.addEventListener('pointermove', handleOffsetHandleDragMove, true);
	document.addEventListener('pointerup', handleOffsetHandlePointerUp, true);
	document.addEventListener('pointercancel', handleOffsetHandlePointerCancel, true);
	document.addEventListener('mousemove', handleOffsetHandleDragMove, true);
	document.addEventListener('mouseup', handleOffsetHandleMouseUp, true);
}

function selectHighlightTextFromOpposingEdge(edge: 'start' | 'end'): {
	target: Element;
	anchorNode: Node;
	anchorOffset: number;
} | null {
	const selectedTextHighlight = resolveSelectedTextHighlight();
	if (!selectedTextHighlight) {
		return null;
	}

	const { highlight, target } = selectedTextHighlight;
	const useCanonicalOffsets = shouldUseCanonicalOffsetDecoding(target, highlight.startOffset, highlight.endOffset);
	const startNodeResult = findTextNodeAtOffset(target, highlight.startOffset, useCanonicalOffsets);
	const endNodeResult = findTextNodeAtOffset(target, highlight.endOffset, useCanonicalOffsets);
	if (!startNodeResult || !endNodeResult) {
		return null;
	}

	// Anchor at the opposite edge so dragging behaves like extending a native selection.
	const anchor = edge === OFFSET_HANDLE_EDGE_START ? endNodeResult : startNodeResult;
	const focus = edge === OFFSET_HANDLE_EDGE_START ? startNodeResult : endNodeResult;
	applyNativeSelection(anchor, focus);

	return {
		target,
		anchorNode: anchor.node,
		anchorOffset: anchor.offset
	};
}

function handleOffsetHandleDown(event: PointerEvent): void {
	if (event.button !== 0) {
		return;
	}

	const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	if (!handle) {
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	const edge = handle.dataset.edge === OFFSET_HANDLE_EDGE_START ? OFFSET_HANDLE_EDGE_START : OFFSET_HANDLE_EDGE_END;
	beginOffsetHandleDrag(handle, edge, event.clientX, event.clientY, 'pointer', event.pointerId);
}

function handleOffsetHandleMouseDown(event: MouseEvent): void {
	event.preventDefault();
	event.stopPropagation();

	if (event.button !== 0 || activeOffsetHandleDrag) {
		return;
	}

	const handle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	if (!handle) {
		return;
	}

	const edge = handle.dataset.edge === OFFSET_HANDLE_EDGE_START ? OFFSET_HANDLE_EDGE_START : OFFSET_HANDLE_EDGE_END;
	beginOffsetHandleDrag(handle, edge, event.clientX, event.clientY, 'mouse', null);
}

function clearSelectedOverlays(): void {
	document.querySelectorAll(`${OVERLAY_SELECTOR}.${SELECTED_OVERLAY_CLASS}`).forEach((overlay) => {
		overlay.classList.remove(SELECTED_OVERLAY_CLASS);
	});
}

function applySelectedOverlayState(): HTMLElement | null {
	clearSelectedOverlays();

	const matches = getMatchingOverlays(selectedHighlightId, selectedHighlightIndex);
	if (matches.length === 0) {
		hideOffsetHandles();
		return null;
	}

	matches.forEach((overlay) => {
		overlay.classList.add(SELECTED_OVERLAY_CLASS);
	});

	updateOffsetHandles();
	return matches[0];
}

function rememberSelectedOverlayReference(overlay: HTMLElement): void {
	selectedHighlightId = overlay.dataset.highlightId || null;
	selectedHighlightIndex = overlay.dataset.highlightIndex || null;
}

function selectOverlay(
	overlay: HTMLElement,
	options: OverlaySelectionOptions = {}
): boolean {
	rememberSelectedOverlayReference(overlay);
	const primaryOverlay = applySelectedOverlayState();
	if (!primaryOverlay) {
		return false;
	}

	if (options.scrollIntoView) {
		primaryOverlay.scrollIntoView({
			block: 'center',
			inline: 'nearest',
			behavior: 'auto'
		});
	}

	if (options.openWidget !== false) {
		openHighlightWidgetForOverlay(primaryOverlay, options.openPoint ?? null);
	}

	if (options.notifyPanel !== false && selectedHighlightId) {
		notifyPanelSelection(selectedHighlightId);
	}

	return true;
}

function ensureHighlightOverlaysPresent(): void {
	if (document.querySelector(OVERLAY_SELECTOR) || highlights.length === 0) {
		return;
	}

	highlights.forEach((highlight, index) => {
		const target = getElementByXPath(highlight.xpath);
		if (target) {
			planHighlightOverlayRects(target, highlight, index);
		}
	});
}

export function selectHighlightOverlayById(
	highlightId: string,
	options: OverlaySelectionOptions = {}
): boolean {
	if (!highlightId) {
		return false;
	}

	ensureHighlightOverlaysPresent();
	const matches = getMatchingOverlays(highlightId, null);
	if (matches.length === 0) {
		return false;
	}

	return selectOverlay(matches[0], options);
}

// Handles mouse move events for hover effects
export function handleMouseMove(event: MouseEvent | TouchEvent) {
	let target: Element;
	if (event instanceof MouseEvent) {
		target = event.target as Element;
	} else {
		// Touch event
		const touch = event.changedTouches[0];
		target = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	if (!isIgnoredElement(target)) {
		createOrUpdateHoverOverlay(target);
	} else {
		removeHoverOverlay();
	}
}

// Handle mouse up events for highlighting
export function handleMouseUp(event: MouseEvent | TouchEvent) {
	if (suppressNextMouseUpHighlight) {
		suppressNextMouseUpHighlight = false;
		return;
	}

	const eventPoint = getEventPoint(event);
	let target: Element;
	if (event instanceof MouseEvent) {
		target = event.target as Element;
	} else {
		// Touch event
		if (isTouchMoved) {
			isTouchMoved = false;
			return; // Don't highlight if the touch moved (scrolling)
		}
		const touch = event.changedTouches[0];
		target = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		handleTextSelection(selection);
		scheduleHighlightWidgetOpenFromPoint(eventPoint);
	} else {
		const overlayFromEvent = findOverlayFromEvent(event);
		if (overlayFromEvent) {
			openHighlightWidgetForOverlay(overlayFromEvent, eventPoint);
		} else {
			let elementToProcess: Element | null = target;
			const targetTagName = target.tagName.toUpperCase();

			if (['TD', 'TH', 'TR'].includes(targetTagName)) {
				elementToProcess = target.closest('table');
				if (!elementToProcess) {
					// Clicked table cell/row not in a table, so do nothing.
					return; 
				}
				// If a table is found, elementToProcess is now the table.
				// highlightElement will verify if 'TABLE' is an allowed tag.
			} else {
				// Original target was not a table cell/row.
				// isIgnoredElement returns true if element is NOT allowed.
				if (isIgnoredElement(target)) {
					// If target is ignored, check its parent.
					if (target.parentElement && !isIgnoredElement(target.parentElement)) {
						elementToProcess = target.parentElement;
					} else {
						// Target is ignored, and parent is also ignored or doesn't exist.
						return;
					}
				}
				// If target was not ignored, elementToProcess remains target.
			}

			if (elementToProcess) {
				highlightElement(elementToProcess);
				scheduleHighlightWidgetOpenFromPoint(eventPoint);
			}
		}
	}
}

// Add touch start handler
export function handleTouchStart(event: TouchEvent) {
	const touch = event.touches[0];
	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	isTouchMoved = false;
}

// Add touch move handler
export function handleTouchMove(event: TouchEvent) {
	const touch = event.touches[0];
	const moveThreshold = 10; // pixels

	if (Math.abs(touch.clientX - touchStartX) > moveThreshold ||
		Math.abs(touch.clientY - touchStartY) > moveThreshold) {
		isTouchMoved = true;
	}

	handleMouseMove(event);
}

// Update event listeners for highlight overlays
export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(highlight => {
		highlight.removeEventListener('click', handleHighlightClick);
		highlight.removeEventListener('touchend', handleHighlightClick);
		highlight.addEventListener('click', handleHighlightClick);
		highlight.addEventListener('touchend', handleHighlightClick);
	});
}

// Find a text node at a given offset within an element
function findTextNodeAtOffset(
	element: Element,
	offset: number,
	useCanonicalOffsets: boolean = false
): { node: Node, offset: number } | null {
	let currentOffset = 0;
	const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	
	let node: Node | null = useCanonicalOffsets ? treeWalker.nextNode() : treeWalker.currentNode;
	let firstTextNode: Node | null = null;
	while (node) {
		const nodeLength = node.textContent?.length || 0;
			if (node.nodeType === Node.TEXT_NODE) {
				if (!firstTextNode) {
					firstTextNode = node;
				}
				if (currentOffset + nodeLength >= offset) {
					// Ensure offset is within bounds of the node
					const adjustedOffset = Math.min(Math.max(0, offset - currentOffset), nodeLength);
					return { node, offset: adjustedOffset };
				}
			}
		currentOffset += nodeLength;
		node = treeWalker.nextNode();
	}
	
	// If we couldn't find the exact offset, return the first text node with offset 0
	if (firstTextNode) {
		return { node: firstTextNode, offset: 0 };
	}
	
	return null;
}

// Calculate the average line height of a set of rectangles
function calculateAverageLineHeight(rects: DOMRectList): number {
	const heights = Array.from(rects).map(rect => rect.height);
	const sum = heights.reduce((a, b) => a + b, 0);
	return sum / heights.length;
}

function processRangeForOverlayRects(
	range: Range,
	content: string,
	existingOverlays: Element[],
	index: number,
	notes: string[] | undefined,
	color: string | undefined,
	highlightId: string,
	createdAt: number | undefined,
	targetElementForFallback: Element
): void {
	const rects = range.getClientRects();

	if (rects.length === 0) {
		const rect = targetElementForFallback.getBoundingClientRect();
		mergeHighlightOverlayRects([rect], content, existingOverlays, index, notes, color, highlightId, createdAt);
		return;
	}

	const averageLineHeight = calculateAverageLineHeight(rects);
	const textRects = Array.from(rects).filter(rect => rect.height <= averageLineHeight * 1.5);
	const complexRects = Array.from(rects).filter(rect => rect.height > averageLineHeight * 1.5);

	if (textRects.length > 0) {
		mergeHighlightOverlayRects(textRects, content, existingOverlays, index, notes, color, highlightId, createdAt);
	}
	if (complexRects.length > 0) {
		mergeHighlightOverlayRects(complexRects, content, existingOverlays, index, notes, color, highlightId, createdAt);
	}
}

// Plan out the overlay rectangles depending on the type of highlight
export function planHighlightOverlayRects(target: Element, highlight: AnyHighlightData, index: number) {
	const existingOverlays = Array.from(document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`));
	const tagName = target.tagName.toUpperCase(); // Get tagName early for P check

	if (highlight.type === 'complex' || highlight.type === 'element') {
		if (LINE_BY_LINE_OVERLAY_TAGS.includes(tagName)) { // LINE_BY_LINE_OVERLAY_TAGS is now just ['P']
			const range = document.createRange();
			try {
				range.selectNodeContents(target);
				processRangeForOverlayRects(range, highlight.content, existingOverlays, index, highlight.notes, highlight.color, highlight.id, highlight.createdAt, target);
			} catch (error) {
				console.error('Error creating line-by-line highlight for element:', target, error);
				const rect = target.getBoundingClientRect();
				mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, index, highlight.notes, highlight.color, highlight.id, highlight.createdAt);
			} finally {
				range.detach();
			}
		} else {
			// Original logic for other element/complex types (single box)
			const rect = target.getBoundingClientRect();
			mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, index, highlight.notes, highlight.color, highlight.id, highlight.createdAt);
		}
	} else if (highlight.type === 'text') {
		const range = document.createRange();
		try {
			const useCanonicalOffsets = shouldUseCanonicalOffsetDecoding(target, highlight.startOffset, highlight.endOffset);
			const startNodeResult = findTextNodeAtOffset(target, highlight.startOffset, useCanonicalOffsets);
			const endNodeResult = findTextNodeAtOffset(target, highlight.endOffset, useCanonicalOffsets);

			if (startNodeResult && endNodeResult) {
				try {
					// Try to set start position
					try {
						range.setStart(startNodeResult.node, startNodeResult.offset);
					} catch {
						// Fallback to node start
						range.setStart(startNodeResult.node, 0);
					}
					
					// Try to set end position
					try {
						range.setEnd(endNodeResult.node, endNodeResult.offset);
					} catch {
						// Fallback to node end
						range.setEnd(endNodeResult.node, endNodeResult.node.textContent?.length || 0);
					}

					processRangeForOverlayRects(
						range,
						highlight.content,
						existingOverlays,
						index,
						highlight.notes,
						highlight.color,
						highlight.id,
						highlight.createdAt,
						target
					);
				} catch (error) { // Catch errors from setStart/setEnd or processRange itself
					console.warn('Error setting range or processing rects for text highlight:', error);
					const rect = target.getBoundingClientRect();
					mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, index, highlight.notes, highlight.color, highlight.id, highlight.createdAt);
				}
			} else {
				// Fallback to element highlight if start/end nodes not found
				console.warn('Could not find start/end node for text highlight, falling back to element bounds.');
				const rect = target.getBoundingClientRect();
				mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, index, highlight.notes, highlight.color, highlight.id, highlight.createdAt);
			}
		} catch (error) { // Outer catch for findTextNodeAtOffset or other unexpected issues
			console.error('Error creating text highlight:', error);
			const rect = target.getBoundingClientRect();
			mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, index, highlight.notes, highlight.color, highlight.id, highlight.createdAt);
		} finally {
			range.detach();
		}
	}
}

// Merge a set of rectangles, to avoid adjacent and overlapping highlights where possible
function mergeHighlightOverlayRects(
	rects: DOMRect[],
	content: string,
	existingOverlays: Element[],
	index: number,
	notes?: string[],
	color?: string,
	highlightId?: string,
	createdAt?: number
) {
	let mergedRects: DOMRect[] = [];
	let currentRect: DOMRect | null = null;

	for (let i = 0; i < rects.length; i++) {
		const rect = rects[i];
		if (!currentRect) {
			currentRect = new DOMRect(rect.x, rect.y, rect.width, rect.height);
		} else if (Math.abs(rect.y - currentRect.y) < 1 && Math.abs(rect.height - currentRect.height) < 1) {
			// Merge adjacent rects with the same height and y-position
			currentRect.width = rect.right - currentRect.left;
		} else {
			mergedRects.push(currentRect);
			currentRect = new DOMRect(rect.x, rect.y, rect.width, rect.height);
		}
	}
	if (currentRect) {
		mergedRects.push(currentRect);
	}

	mergedRects.forEach((rect, rectIndex) => {
		const isDuplicate = existingOverlays.some(overlay => {
			const overlayRect = overlay.getBoundingClientRect();
			return (
				Math.abs(rect.left - overlayRect.left) < 1 &&
				Math.abs(rect.top - overlayRect.top) < 1 &&
				Math.abs(rect.width - overlayRect.width) < 1 &&
				Math.abs(rect.height - overlayRect.height) < 1
			);
		});

		if (!isDuplicate) {
			const showCommentBadge = Array.isArray(notes) && notes.length > 0 && rectIndex === 0;
			createHighlightOverlayElement(rect, content, index, notes, color, highlightId, createdAt, showCommentBadge);
		}
	});
}

// Create an overlay element
function createHighlightOverlayElement(
	rect: DOMRect,
	content: string,
	index: number,
	notes?: string[],
	color?: string,
	highlightId?: string,
	createdAt?: number,
	showCommentBadge = false
) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightIndex = index.toString();
	if (highlightId) {
		overlay.dataset.highlightId = highlightId;
	}
	if (
		(selectedHighlightId && overlay.dataset.highlightId === selectedHighlightId) ||
		(!selectedHighlightId && selectedHighlightIndex && overlay.dataset.highlightIndex === selectedHighlightIndex)
	) {
		overlay.classList.add(SELECTED_OVERLAY_CLASS);
	}
	
	overlay.style.position = 'absolute';

	overlay.style.left = `${rect.left + window.scrollX - 2}px`;
	overlay.style.top = `${rect.top + window.scrollY - 2}px`;
	overlay.style.width = `${rect.width + 4}px`;
	overlay.style.height = `${rect.height + 4}px`;
	
	overlay.setAttribute('data-content', content);
	if (notes && notes.length > 0) {
		overlay.setAttribute('data-notes', JSON.stringify(notes));
	}
	
	// Get the background color of the element under the highlight
	const elementAtPoint = document.elementFromPoint(rect.left, rect.top);
	let isDarkBackground = false;
	if (elementAtPoint) {
		const bgColor = getEffectiveBackgroundColor(elementAtPoint as HTMLElement);
		if (isDarkColor(bgColor)) {
			isDarkBackground = true;
			overlay.classList.add('obsidian-highlight-overlay-dark');
		}
	}
	decorateHighlightOverlayElement(overlay, {
		color,
		isDarkBackground,
		notes,
		createdAt,
		showCommentBadge
	});
	
	overlay.addEventListener('click', handleHighlightClick);
	overlay.addEventListener('touchend', handleHighlightClick);
	document.body.appendChild(overlay);
}

// Helper function to get the effective background color
function getEffectiveBackgroundColor(element: HTMLElement): string {
	let currentElement: HTMLElement | null = element;
	while (currentElement) {
		const backgroundColor = window.getComputedStyle(currentElement).backgroundColor;
		if (backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
			return backgroundColor;
		}
		currentElement = currentElement.parentElement;
	}
	// If we've reached here, we haven't found a non-transparent background.
	// Return white as a default.
	return 'rgb(255, 255, 255)';
}

// Update positions of all highlight overlays
function updateHighlightOverlayPositions() {
	highlights.forEach((highlight, index) => {
		const target = getElementByXPath(highlight.xpath);
		if (target) {
			const existingOverlays = document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`);
			if (existingOverlays.length > 0) {
				removeExistingHighlightOverlays(index);
			}
			planHighlightOverlayRects(target, highlight, index);
		}
	});
	applySelectedOverlayState();
	syncHighlightWidgetPosition();
}

// Remove existing highlight overlays for a specific index
function removeExistingHighlightOverlays(index: number) {
	// Intentionally does not close the action menu.
	// Mutation-driven reflows (notably on GitHub) would otherwise dismiss the editor while typing.
	// The menu is re-anchored in `syncHighlightWidgetPosition()` after repaint.
	document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => el.remove());
}

const throttledUpdateHighlights = throttle(() => {
	if (!isApplyingHighlights) {
		updateHighlightOverlayPositions();
	}
}, 100);

window.addEventListener('resize', throttledUpdateHighlights);
window.addEventListener('scroll', throttledUpdateHighlights);
// Keep the action menu stable during viewport/system transitions (e.g. screenshot shortcut overlays).

const observer = new MutationObserver((mutations) => {
	if (!isApplyingHighlights) {
		const shouldUpdate = mutations.some(mutation =>
			(mutation.type === 'childList' && (() => {
				if (!(mutation.target instanceof Element)) {
					return false;
				}

				// Avoid repaint loops from our own overlays/menu being inserted/updated.
				if (isChildListMutationOnlyHighlighterManaged(mutation)) {
					return false;
				}

				return !isHighlighterManagedElement(mutation.target);
			})()) ||
			(mutation.type === 'attributes' &&
				(mutation.attributeName === 'style' || mutation.attributeName === 'class') &&
				(mutation.target instanceof Element) &&
				!isHighlighterManagedElement(mutation.target))
		);
		if (shouldUpdate) {
			throttledUpdateHighlights();
		}
	}
});

observer.observe(document.body, { 
	childList: true, 
	subtree: true, 
	attributes: true,
	attributeFilter: ['style', 'class'],
	characterData: false
});

// Create or update the hover overlay used to indicate which element will be highlighted
function createOrUpdateHoverOverlay(target: Element) {
	// Only update if the target has changed
	if (target === lastHoverTarget) return;
	lastHoverTarget = target;

	let elementForHoverRect: Element | null = target;
	const eventTargetTagName = target.tagName.toUpperCase();

	if (['TD', 'TH', 'TR'].includes(eventTargetTagName)) {
		elementForHoverRect = target.closest('table');
	}

	// Now, elementForHoverRect is either the table, the original target, or null.
	// Check if this elementForHoverRect itself is valid (i.e., not ignored).
	// isIgnoredElement returns true if the element's tag is NOT in the allowed list for hover
	// (or if it's html, body etc.).
	if (elementForHoverRect && !isIgnoredElement(elementForHoverRect)) {
		// This is a valid element to get bounds from.
	} else if (target.parentElement && !isIgnoredElement(target.parentElement) && !['TD', 'TH', 'TR'].includes(eventTargetTagName)) {
		// If the primary elementForHoverRect (table or original target) was not valid (null or ignored),
		// AND the original event target was not a table cell (because for cells, we only care about the table's validity),
		// THEN consider the original event target's parent as the element for the hover rectangle.
		elementForHoverRect = target.parentElement;
	} else {
		// Otherwise (no valid candidate found after checking primary and parent (for non-cells))
		removeHoverOverlay();
		return;
	}

	// If, after all logic, elementForHoverRect is null (e.g. a TD not in a table, or other unhandled cases), remove overlay.
	if (!elementForHoverRect) {
		removeHoverOverlay();
		return;
	}

	if (!hoverOverlay) {
		hoverOverlay = document.createElement('div');
		hoverOverlay.id = 'obsidian-highlight-hover-overlay';
		document.body.appendChild(hoverOverlay);
	}
	
	const rect = elementForHoverRect.getBoundingClientRect();

	hoverOverlay.style.position = 'absolute';
	hoverOverlay.style.left = `${rect.left + window.scrollX - 2}px`;
	hoverOverlay.style.top = `${rect.top + window.scrollY - 2}px`;
	hoverOverlay.style.width = `${rect.width + 4}px`;
	hoverOverlay.style.height = `${rect.height + 4}px`;
	hoverOverlay.style.display = 'block';

	// Remove 'is-hovering' class from all highlight overlays
	document.querySelectorAll('.obsidian-highlight-overlay.is-hovering').forEach(el => {
		el.classList.remove('is-hovering');
	});

	// Remove 'on-highlight' class from hover overlay
	hoverOverlay.classList.remove('on-highlight');

	// Check if the target is a highlight overlay
	if (target.classList.contains('obsidian-highlight-overlay')) {
		const index = target.getAttribute('data-highlight-index');
		if (index) {
			// Add 'is-hovering' class to all highlight overlays with the same index
			document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => {
				el.classList.add('is-hovering');
			});
			// Add 'on-highlight' class to hover overlay
			hoverOverlay.classList.add('on-highlight');
		}
	}
}

// Modify the removeHoverOverlay function to also remove the 'is-hovering' class
export function removeHoverOverlay() {
	if (hoverOverlay) {
		hoverOverlay.style.display = 'none';
	}
	lastHoverTarget = null;

	// Remove 'is-hovering' class from all highlight overlays
	document.querySelectorAll('.obsidian-highlight-overlay.is-hovering').forEach(el => {
		el.classList.remove('is-hovering');
	});
}

function handleHighlightClick(event: Event) {
	event.stopPropagation();
	event.preventDefault(); // Prevent default touch behavior
	hideHighlightWidgetTooltip();
	const overlay = findOverlayFromEvent(event);
	
	if (!overlay) {
		return;
	}
	const eventPoint = getEventPoint(event);
	selectOverlay(overlay, {
		openWidget: true,
		scrollIntoView: false,
		notifyPanel: true,
		openPoint: eventPoint
	});
}

// Remove all existing highlight overlays from the page
export function removeExistingHighlights() {
	const existingHighlights = document.querySelectorAll('.obsidian-highlight-overlay');
	if (existingHighlights.length > 0) {
		existingHighlights.forEach(el => el.remove());
	}
	selectedHighlightId = null;
	selectedHighlightIndex = null;
	hideOffsetHandles();
	hideHighlightWidgetTooltip();
	closeHighlightWidget();
}
