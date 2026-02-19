import { generalSettings, DEFAULT_HIGHLIGHT_PALETTE } from './storage-utils';
import { convertDate } from './date-utils';
import { createElement as createLucideElement, MessageSquare, Trash2, Check, X } from 'lucide';
import type { IconNode } from 'lucide';
import type { AnyHighlightData } from './highlighter';

const OVERLAY_SELECTOR = '.obsidian-highlight-overlay';
const HIGHLIGHT_WIDGET_ROOT_CLASS = 'obsidian-highlight-widget';
const HIGHLIGHT_WIDGET_ROOT_SELECTOR = `.${HIGHLIGHT_WIDGET_ROOT_CLASS}`;
const HIGHLIGHT_WIDGET_BADGE_CLASS = 'obsidian-highlight-widget-badge';
const HIGHLIGHT_WIDGET_TOOLTIP_CLASS = 'obsidian-highlight-widget-tooltip';
const HIGHLIGHT_WIDGET_TOOLTIP_HEADER_CLASS = 'obsidian-highlight-widget-tooltip-header';
const HIGHLIGHT_WIDGET_TOOLTIP_DATE_CLASS = 'obsidian-highlight-widget-tooltip-date';
const HIGHLIGHT_WIDGET_TOOLTIP_BODY_CLASS = 'obsidian-highlight-widget-tooltip-body';
const HIGHLIGHT_WIDGET_ROW_CLASS = 'obsidian-highlight-widget-row';
const HIGHLIGHT_WIDGET_COLORS_CLASS = 'obsidian-highlight-widget-colors';
const HIGHLIGHT_WIDGET_COLOR_SWATCH_CLASS = 'obsidian-highlight-widget-color-swatch';
const HIGHLIGHT_WIDGET_DIVIDER_CLASS = 'obsidian-highlight-widget-divider';
const HIGHLIGHT_WIDGET_BUTTONS_CLASS = 'obsidian-highlight-widget-buttons';
const HIGHLIGHT_WIDGET_ICON_BUTTON_CLASS = 'obsidian-highlight-widget-icon-button';
const HIGHLIGHT_WIDGET_COMMENT_EDITOR_CLASS = 'obsidian-highlight-widget-comment-editor';
const HIGHLIGHT_WIDGET_COMMENT_EDITOR_SELECTOR = `.${HIGHLIGHT_WIDGET_COMMENT_EDITOR_CLASS}`;
const HIGHLIGHT_WIDGET_COMMENT_INPUT_CLASS = 'obsidian-highlight-widget-comment-input';
const HIGHLIGHT_WIDGET_COMMENT_EDITOR_ACTIONS_CLASS = 'obsidian-highlight-widget-comment-editor-actions';
const HIGHLIGHT_WIDGET_STATE_OPEN = 'is-open';
const HIGHLIGHT_WIDGET_STATE_EDITOR_OPEN = 'is-comment-editor-open';
const HIGHLIGHT_WIDGET_STATE_NO_COMMENT = 'is-no-comment';
const DEFAULT_HIGHLIGHT_COLOR = DEFAULT_HIGHLIGHT_PALETTE[0];
const MAX_COMMENT_EDITOR_HEIGHT_PX = 180;
const WIDGET_VIEWPORT_PADDING_PX = 8;
const WIDGET_ANCHOR_GAP_PX = 8;
const WIDGET_AUTO_DISMISS_MARGIN_PX = 14;
const WIDGET_ANCHOR_CLIENT_X_DATASET_KEY = 'anchorClientX';
const WIDGET_ANCHOR_CLIENT_Y_DATASET_KEY = 'anchorClientY';

type Point = { clientX: number; clientY: number };

type HighlightTooltipData = {
	comment?: string;
	addedAt?: string;
};

export interface HighlightWidgetBindings {
	getHighlights: () => AnyHighlightData[];
	persistHighlights: (nextHighlights: AnyHighlightData[]) => void;
	rememberColorPreference: (color: string) => void;
}

interface OverlayDecorationOptions {
	color?: string;
	isDarkBackground: boolean;
	notes?: string[];
	createdAt?: number;
	showCommentBadge?: boolean;
}

let highlightActionMenu: HTMLElement | null = null;
let highlightCommentTooltip: HTMLElement | null = null;
let bindings: HighlightWidgetBindings | null = null;
let dismissListenersInstalled = false;

/**
 * Wires overlay-owned state/persistence callbacks into the widget module.
 * Called from highlighter-overlays to keep this module independent from highlighter state internals.
 */
export function initializeHighlightWidget(nextBindings: HighlightWidgetBindings): void {
	bindings = nextBindings;
	if (dismissListenersInstalled) {
		return;
	}
	dismissListenersInstalled = true;

	// Viewport movement can recreate/reposition overlays without a matching mouseleave.
	// Reset tooltip state so it never lingers after scroll/resize.
	window.addEventListener('scroll', hideHighlightWidgetTooltip, { passive: true });
	window.addEventListener('resize', hideHighlightWidgetTooltip);

	document.addEventListener('click', (event: MouseEvent) => {
		// Modified clicks are treated as non-dismiss interactions to avoid interfering with browser/OS shortcuts.
		if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
			return;
		}

		const target = event.target instanceof Element ? event.target : null;
		if (target === null) {
			return;
		}
		if (target.closest(HIGHLIGHT_WIDGET_ROOT_SELECTOR)) {
			return;
		}
		if (target.classList.contains('obsidian-highlight-overlay')) {
			return;
		}
		if (isHighlightWidgetEditorActive()) {
			return;
		}
		closeHighlightWidget();
	}, true);

	document.addEventListener('touchstart', (event: TouchEvent) => {
		const target = event.target instanceof Element ? event.target : null;
		if (target === null) {
			return;
		}
		if (target.closest(HIGHLIGHT_WIDGET_ROOT_SELECTOR)) {
			return;
		}
		if (target.classList.contains('obsidian-highlight-overlay')) {
			return;
		}
		if (isHighlightWidgetEditorActive()) {
			return;
		}
		closeHighlightWidget();
	}, { capture: true, passive: true });

	document.addEventListener('keydown', (event: KeyboardEvent) => {
		// Keyboard dismiss parity with the top highlighter toolbar.
		if (event.key !== 'Escape') {
			return;
		}
		if (!highlightActionMenu?.classList.contains(HIGHLIGHT_WIDGET_STATE_OPEN)) {
			return;
		}
		closeHighlightWidget();
	}, true);

	document.addEventListener('mousemove', (event: MouseEvent) => {
		// Keep tooltip strictly hover-bound: if pointer leaves all overlays, close it.
		if (!highlightCommentTooltip?.classList.contains(HIGHLIGHT_WIDGET_STATE_OPEN)) {
			// Continue: widget auto-dismiss also runs on mouse move.
		} else {
			const target = event.target instanceof Element ? event.target : null;
			if (!target?.closest(OVERLAY_SELECTOR)) {
				hideHighlightWidgetTooltip();
			}
		}

		if (!highlightActionMenu?.classList.contains(HIGHLIGHT_WIDGET_STATE_OPEN)) {
			return;
		}
		if (isHighlightWidgetEditorActive()) {
			return;
		}
		if (isPointWithinWidgetDismissArea({ clientX: event.clientX, clientY: event.clientY })) {
			return;
		}
		closeHighlightWidget();
	}, true);
}

/**
 * Returns true when the provided element belongs to the floating highlight widget.
 */
export function isHighlightWidgetElement(element: Element): boolean {
	return element.classList.contains(HIGHLIGHT_WIDGET_ROOT_CLASS) || element.closest(HIGHLIGHT_WIDGET_ROOT_SELECTOR) !== null;
}

/**
 * Returns true while the inline comment editor is expanded inside the widget.
 */
export function isHighlightWidgetEditorActive(): boolean {
	return Boolean(highlightActionMenu?.classList.contains(HIGHLIGHT_WIDGET_STATE_EDITOR_OPEN));
}

/**
 * Opens the widget for the overlay under the given viewport point.
 * Used immediately after creating highlights so users can set color/comment inline.
 */
export function scheduleHighlightWidgetOpenFromPoint(point: Point | null): void {
	if (!point) {
		return;
	}

	window.setTimeout(() => {
		const overlay = findOverlayAtPoint(point.clientX, point.clientY);
		if (overlay) {
			openHighlightWidgetForOverlay(overlay, point);
		}
	}, 0);
}

/**
 * Keeps widget position anchored to its current overlay after overlay re-renders.
 */
export function syncHighlightWidgetPosition(): void {
	if (!highlightActionMenu?.classList.contains(HIGHLIGHT_WIDGET_STATE_OPEN)) {
		return;
	}

	const openHighlightId = highlightActionMenu.dataset.highlightId || '';
	const fallbackIndex = Number.parseInt(highlightActionMenu.dataset.highlightIndex || '', 10);
	const overlay = findOverlayByHighlightRef(openHighlightId, fallbackIndex);
	const anchorPoint = readStoredWidgetAnchorPoint();

	if (!overlay) {
		if (isHighlightWidgetEditorActive()) {
			return;
		}
		closeHighlightWidget();
		return;
	}

	positionHighlightWidget(overlay, anchorPoint);
}

/**
 * Hides the comment/date tooltip without affecting widget open state.
 */
export function hideHighlightWidgetTooltip(): void {
	if (highlightCommentTooltip) {
		highlightCommentTooltip.classList.remove(HIGHLIGHT_WIDGET_STATE_OPEN);
	}
}

/**
 * Closes the floating widget and any open tooltip.
 */
export function closeHighlightWidget(): void {
	if (highlightActionMenu) {
		highlightActionMenu.classList.remove(HIGHLIGHT_WIDGET_STATE_OPEN);
		highlightActionMenu.classList.remove(HIGHLIGHT_WIDGET_STATE_EDITOR_OPEN);
		highlightActionMenu.style.minWidth = '';
		highlightActionMenu.style.maxWidth = '';
		delete highlightActionMenu.dataset.highlightId;
		delete highlightActionMenu.dataset.highlightIndex;
		delete highlightActionMenu.dataset[WIDGET_ANCHOR_CLIENT_X_DATASET_KEY];
		delete highlightActionMenu.dataset[WIDGET_ANCHOR_CLIENT_Y_DATASET_KEY];
	}
	hideHighlightWidgetTooltip();
}

/**
 * Applies widget-specific overlay affordances: color tint, comment badge, and comment/date tooltip handlers.
 */
export function decorateHighlightOverlayElement(overlay: HTMLElement, options: OverlayDecorationOptions): void {
	overlay.style.backgroundColor = hexToRgba(
		options.color || DEFAULT_HIGHLIGHT_COLOR,
		options.isDarkBackground ? 0.25 : 0.35
	);

	const tooltipData = buildHighlightTooltipData(options.notes, options.createdAt);
	if (tooltipData) {
		overlay.addEventListener('mouseenter', () => {
			showHighlightWidgetTooltip(overlay, tooltipData);
		});
		overlay.addEventListener('mouseleave', () => {
			hideHighlightWidgetTooltip();
		});
	}

	if (options.showCommentBadge) {
		const badge = document.createElement('span');
		badge.className = HIGHLIGHT_WIDGET_BADGE_CLASS;
		badge.setAttribute('aria-hidden', 'true');
		badge.appendChild(createActionIcon(MessageSquare));
		overlay.appendChild(badge);
	}
}

/**
 * Opens (or reopens) the widget for a concrete overlay element.
 * Optional `preferredPoint` anchors the menu to the user's click/touch position.
 */
export function openHighlightWidgetForOverlay(overlay: HTMLElement, preferredPoint: Point | null = null): void {
	if (!bindings) {
		return;
	}

	const highlightId = overlay.dataset.highlightId;
	const fallbackIndex = Number.parseInt(overlay.dataset.highlightIndex || '', 10);
	const currentHighlights = bindings.getHighlights();
	const indexFromId = highlightId
		? currentHighlights.findIndex((item) => item.id === highlightId)
		: -1;
	const highlightIndex = indexFromId >= 0 ? indexFromId : fallbackIndex;

	if (!Number.isInteger(highlightIndex) || highlightIndex < 0 || highlightIndex >= currentHighlights.length) {
		return;
	}

	const resolveCurrentHighlightIndex = (): number => {
		const highlights = bindings?.getHighlights() || [];
		// Prefer ID lookup when available so actions still target the same highlight after re-sorts.
		if (highlightId) {
			const currentIndex = highlights.findIndex((item) => item.id === highlightId);
			if (currentIndex >= 0) {
				return currentIndex;
			}
		}
		return highlightIndex;
	};

	const highlight = currentHighlights[resolveCurrentHighlightIndex()];
	if (!highlight) {
		return;
	}

	const applyHighlightUpdate = (updater: (item: AnyHighlightData) => AnyHighlightData) => {
		return updateHighlightAtIndex(resolveCurrentHighlightIndex(), updater);
	};

	const removeHighlight = () => {
		removeHighlightAtIndex(resolveCurrentHighlightIndex());
	};

	const menu = ensureHighlightActionMenu();
	if (!document.body.contains(menu)) {
		document.body.appendChild(menu);
	}
	menu.dataset.highlightId = highlight.id;
	menu.dataset.highlightIndex = String(highlightIndex);
	if (preferredPoint) {
		menu.dataset[WIDGET_ANCHOR_CLIENT_X_DATASET_KEY] = String(preferredPoint.clientX);
		menu.dataset[WIDGET_ANCHOR_CLIENT_Y_DATASET_KEY] = String(preferredPoint.clientY);
	} else {
		delete menu.dataset[WIDGET_ANCHOR_CLIENT_X_DATASET_KEY];
		delete menu.dataset[WIDGET_ANCHOR_CLIENT_Y_DATASET_KEY];
	}

	const palette = getHighlightPalette();
	const selectedColor = normalizeHexColor(highlight.color || palette[0] || DEFAULT_HIGHLIGHT_COLOR);
	const hasComment = Array.isArray(highlight.notes) && highlight.notes.length > 0;

	menu.textContent = '';

	const menuRow = document.createElement('div');
	menuRow.className = HIGHLIGHT_WIDGET_ROW_CLASS;

	const colorsRow = document.createElement('div');
	colorsRow.className = HIGHLIGHT_WIDGET_COLORS_CLASS;
	palette.forEach((color) => {
		const colorButton = document.createElement('button');
		colorButton.type = 'button';
		colorButton.className = HIGHLIGHT_WIDGET_COLOR_SWATCH_CLASS;
		colorButton.title = `Set color ${color}`;
		colorButton.setAttribute('aria-label', `Set highlight color ${color}`);
		colorButton.style.backgroundColor = color;
		if (selectedColor === color) {
			colorButton.classList.add('is-selected');
		}
		colorButton.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			applyHighlightUpdate((item) => ({
				...item,
				color
			}));
			// Persist this swatch as the default for subsequent highlights.
			bindings?.rememberColorPreference(color);
			closeHighlightWidget();
		});
		colorsRow.appendChild(colorButton);
	});

	const divider = document.createElement('div');
	divider.className = HIGHLIGHT_WIDGET_DIVIDER_CLASS;

	const actionsRow = document.createElement('div');
	actionsRow.className = HIGHLIGHT_WIDGET_BUTTONS_CLASS;

	const noteButton = document.createElement('button');
	noteButton.type = 'button';
	noteButton.className = HIGHLIGHT_WIDGET_ICON_BUTTON_CLASS;
	if (hasComment) {
		noteButton.classList.add('is-active');
	}
	noteButton.title = hasComment ? 'Edit comment' : 'Add comment';
	noteButton.setAttribute('aria-label', hasComment ? 'Edit comment' : 'Add comment');
	noteButton.appendChild(createActionIcon(MessageSquare));
	const saveComment = (rawComment: string) => {
		const trimmed = rawComment.trim();
		applyHighlightUpdate((item) => {
			const notes = Array.isArray(item.notes) ? [...item.notes] : [];
			if (!trimmed) {
				return {
					...item,
					notes: []
				};
			}
			if (notes.length === 0) {
				notes.push(trimmed);
			} else {
				notes[0] = trimmed;
			}
			return {
				...item,
				notes
			};
		});
		closeHighlightWidget();
	};

	const closeCommentEditor = () => {
		const existingEditor = menu.querySelector(HIGHLIGHT_WIDGET_COMMENT_EDITOR_SELECTOR);
		if (existingEditor) {
			existingEditor.remove();
		}
		noteButton.classList.remove('is-editing');
		menu.classList.remove(HIGHLIGHT_WIDGET_STATE_EDITOR_OPEN);
		menu.style.minWidth = '';
		positionHighlightWidget(overlay, readStoredWidgetAnchorPoint());
	};

	const openCommentEditor = (focusInput: boolean) => {
		const existingEditor = menu.querySelector(HIGHLIGHT_WIDGET_COMMENT_EDITOR_SELECTOR);
		if (existingEditor) {
			return;
		}

		noteButton.classList.add('is-editing');
		const activeHighlights = bindings?.getHighlights() || [];
		const currentHighlight = activeHighlights[resolveCurrentHighlightIndex()];
		const currentComment = Array.isArray(currentHighlight?.notes) ? (currentHighlight.notes[0] || '') : '';

		const editor = document.createElement('div');
		editor.className = HIGHLIGHT_WIDGET_COMMENT_EDITOR_CLASS;

		const commentInput = document.createElement('textarea');
		commentInput.className = HIGHLIGHT_WIDGET_COMMENT_INPUT_CLASS;
		commentInput.placeholder = 'Add comment';
		commentInput.value = currentComment;
		commentInput.rows = 2;

		// Autosize keeps multiline comments readable when reopening existing annotations.
		const resizeCommentInput = () => {
			commentInput.style.height = 'auto';
			const nextHeight = Math.min(commentInput.scrollHeight, MAX_COMMENT_EDITOR_HEIGHT_PX);
			commentInput.style.height = `${nextHeight}px`;
			commentInput.style.overflowY = commentInput.scrollHeight > MAX_COMMENT_EDITOR_HEIGHT_PX ? 'auto' : 'hidden';
			positionHighlightWidget(overlay, readStoredWidgetAnchorPoint());
		};

		const editorActions = document.createElement('div');
		editorActions.className = HIGHLIGHT_WIDGET_COMMENT_EDITOR_ACTIONS_CLASS;

		const saveButton = document.createElement('button');
		saveButton.type = 'button';
		saveButton.className = `${HIGHLIGHT_WIDGET_ICON_BUTTON_CLASS} mod-secondary`;
		saveButton.title = 'Save comment';
		saveButton.setAttribute('aria-label', 'Save comment');
		saveButton.appendChild(createActionIcon(Check));
		saveButton.addEventListener('click', (saveEvent) => {
			saveEvent.preventDefault();
			saveEvent.stopPropagation();
			saveComment(commentInput.value);
		});

		const cancelButton = document.createElement('button');
		cancelButton.type = 'button';
		cancelButton.className = `${HIGHLIGHT_WIDGET_ICON_BUTTON_CLASS} mod-secondary`;
		cancelButton.title = 'Cancel comment';
		cancelButton.setAttribute('aria-label', 'Cancel comment');
		cancelButton.appendChild(createActionIcon(X));
		cancelButton.addEventListener('click', (cancelEvent) => {
			cancelEvent.preventDefault();
			cancelEvent.stopPropagation();
			closeCommentEditor();
		});

		commentInput.addEventListener('keydown', (inputEvent) => {
			// Plain Enter should stay in the textarea; use Mod+Enter for keyboard save.
			if (inputEvent.key === 'Enter' && (inputEvent.metaKey || inputEvent.ctrlKey)) {
				inputEvent.preventDefault();
				saveComment(commentInput.value);
			}
			if (inputEvent.key === 'Escape') {
				inputEvent.preventDefault();
				inputEvent.stopPropagation();
				closeCommentEditor();
			}
		});
		commentInput.addEventListener('input', resizeCommentInput);

		editorActions.appendChild(saveButton);
		editorActions.appendChild(cancelButton);
		editor.appendChild(commentInput);
		editor.appendChild(editorActions);
		menu.appendChild(editor);
		menu.classList.add(HIGHLIGHT_WIDGET_STATE_EDITOR_OPEN);
		const menuRowWidth = Math.ceil(menuRow.getBoundingClientRect().width);
		if (menuRowWidth > 0) {
			menu.style.minWidth = `${menuRowWidth}px`;
		}
		resizeCommentInput();
		positionHighlightWidget(overlay, readStoredWidgetAnchorPoint());
		if (focusInput) {
			commentInput.focus();
			commentInput.select();
		}
	};

	noteButton.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		const existingEditor = menu.querySelector(HIGHLIGHT_WIDGET_COMMENT_EDITOR_SELECTOR);
		if (existingEditor) {
			closeCommentEditor();
			return;
		}
		openCommentEditor(true);
	});

	const removeButton = document.createElement('button');
	removeButton.type = 'button';
	removeButton.className = HIGHLIGHT_WIDGET_ICON_BUTTON_CLASS;
	removeButton.title = 'Remove highlight';
	removeButton.setAttribute('aria-label', 'Remove highlight');
	removeButton.appendChild(createActionIcon(Trash2));
	removeButton.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		removeHighlight();
		closeHighlightWidget();
	});

	const closeButton = document.createElement('button');
	closeButton.type = 'button';
	closeButton.className = HIGHLIGHT_WIDGET_ICON_BUTTON_CLASS;
	closeButton.title = 'Close';
	closeButton.setAttribute('aria-label', 'Close');
	closeButton.appendChild(createActionIcon(X));
	closeButton.addEventListener('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		closeHighlightWidget();
	});

	actionsRow.appendChild(noteButton);
	actionsRow.appendChild(removeButton);
	actionsRow.appendChild(closeButton);

	menuRow.appendChild(colorsRow);
	menuRow.appendChild(divider);
	menuRow.appendChild(actionsRow);
	menu.appendChild(menuRow);

	menu.classList.add(HIGHLIGHT_WIDGET_STATE_OPEN);
	positionHighlightWidget(overlay, preferredPoint);
	if (hasComment) {
		openCommentEditor(false);
	}
}

function getHighlightPalette(): string[] {
	const palette = Array.isArray(generalSettings.highlightPalette) && generalSettings.highlightPalette.length > 0
		? generalSettings.highlightPalette
		: DEFAULT_HIGHLIGHT_PALETTE;
	return palette.map(normalizeHexColor);
}

function buildHighlightTooltipData(notes: string[] | undefined, createdAt?: number): HighlightTooltipData | null {
	// Tooltip payload is built from explicit highlight metadata (createdAt/notes), not inferred ID structure.
	const comment = Array.isArray(notes)
		? notes.find((note) => typeof note === 'string' && note.trim().length > 0)
		: '';
	const hasCreatedAt = typeof createdAt === 'number' && Number.isFinite(createdAt) && createdAt > 0;
	if (!comment && !hasCreatedAt) {
		return null;
	}

	return {
		comment: comment ? comment.trim() : undefined,
		// Use shared date utils (dayjs-backed) so tooltip formatting stays consistent with extension formatting.
		addedAt: hasCreatedAt ? convertDate(new Date(createdAt), 'MMM D, YYYY, h:mm A') : undefined
	};
}

function ensureHighlightCommentTooltip(): HTMLElement {
	if (highlightCommentTooltip) {
		return highlightCommentTooltip;
	}

	const tooltip = document.createElement('div');
	tooltip.id = HIGHLIGHT_WIDGET_TOOLTIP_CLASS;
	tooltip.className = HIGHLIGHT_WIDGET_TOOLTIP_CLASS;

	const header = document.createElement('div');
	header.className = HIGHLIGHT_WIDGET_TOOLTIP_HEADER_CLASS;

	const date = document.createElement('div');
	date.className = HIGHLIGHT_WIDGET_TOOLTIP_DATE_CLASS;

	const body = document.createElement('div');
	body.className = HIGHLIGHT_WIDGET_TOOLTIP_BODY_CLASS;

	header.appendChild(date);
	tooltip.appendChild(header);
	tooltip.appendChild(body);
	document.body.appendChild(tooltip);
	highlightCommentTooltip = tooltip;
	return tooltip;
}

function positionHighlightWidgetTooltip(anchorElement: HTMLElement): void {
	if (!highlightCommentTooltip) {
		return;
	}

	const anchorRect = anchorElement.getBoundingClientRect();
	const tooltipRect = highlightCommentTooltip.getBoundingClientRect();
	const gap = 8;
	const viewportPadding = 8;
	const preferredTop = anchorRect.top + window.scrollY - tooltipRect.height - gap;
	const fallbackTop = anchorRect.bottom + window.scrollY + gap;
	const top = preferredTop >= window.scrollY + viewportPadding ? preferredTop : fallbackTop;
	const maxLeft = window.scrollX + window.innerWidth - tooltipRect.width - viewportPadding;
	const left = Math.min(
		Math.max(window.scrollX + anchorRect.left, window.scrollX + viewportPadding),
		Math.max(window.scrollX + viewportPadding, maxLeft)
	);

	highlightCommentTooltip.style.top = `${top}px`;
	highlightCommentTooltip.style.left = `${left}px`;
}

function showHighlightWidgetTooltip(anchorElement: HTMLElement, tooltipData: HighlightTooltipData): void {
	const tooltip = ensureHighlightCommentTooltip();
	const dateElement = tooltip.querySelector(`.${HIGHLIGHT_WIDGET_TOOLTIP_DATE_CLASS}`);
	const bodyElement = tooltip.querySelector(`.${HIGHLIGHT_WIDGET_TOOLTIP_BODY_CLASS}`);

	if (!(dateElement instanceof HTMLElement) || !(bodyElement instanceof HTMLElement)) {
		return;
	}

	dateElement.textContent = tooltipData.addedAt || '';
	dateElement.style.display = tooltipData.addedAt ? 'block' : 'none';
	bodyElement.textContent = tooltipData.comment || '';
	bodyElement.style.display = tooltipData.comment ? 'block' : 'none';
	tooltip.classList.toggle(HIGHLIGHT_WIDGET_STATE_NO_COMMENT, !tooltipData.comment);

	tooltip.classList.add(HIGHLIGHT_WIDGET_STATE_OPEN);
	positionHighlightWidgetTooltip(anchorElement);
}

function ensureHighlightActionMenu(): HTMLElement {
	if (highlightActionMenu) {
		return highlightActionMenu;
	}

	highlightActionMenu = document.createElement('div');
	highlightActionMenu.className = HIGHLIGHT_WIDGET_ROOT_CLASS;
	highlightActionMenu.style.zIndex = '2147483647';
	highlightActionMenu.addEventListener('mousedown', (event) => event.stopPropagation());
	highlightActionMenu.addEventListener('mouseup', (event) => event.stopPropagation());
	highlightActionMenu.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
	highlightActionMenu.addEventListener('touchend', (event) => event.stopPropagation());
	document.body.appendChild(highlightActionMenu);
	return highlightActionMenu;
}

function findCurrentWidgetAnchorOverlay(): HTMLElement | null {
	if (!highlightActionMenu) {
		return null;
	}

	const highlightId = highlightActionMenu.dataset.highlightId || '';
	const rawIndex = Number.parseInt(highlightActionMenu.dataset.highlightIndex || '', 10);
	const highlightIndex = Number.isInteger(rawIndex) ? rawIndex : -1;
	return findOverlayByHighlightRef(highlightId, highlightIndex) ?? null;
}

function readStoredWidgetAnchorPoint(): Point | null {
	if (!highlightActionMenu) {
		return null;
	}

	const rawX = highlightActionMenu.dataset[WIDGET_ANCHOR_CLIENT_X_DATASET_KEY];
	const rawY = highlightActionMenu.dataset[WIDGET_ANCHOR_CLIENT_Y_DATASET_KEY];
	const clientX = Number.parseFloat(rawX || '');
	const clientY = Number.parseFloat(rawY || '');
	if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
		return null;
	}

	return { clientX, clientY };
}

// True when pointer remains within a slightly expanded rect around widget/highlight.
// Why: lets users move naturally near controls without accidental close, while still dismissing once they leave.
function isPointNearRect(point: Point, rect: DOMRect, margin: number): boolean {
	return (
		point.clientX >= rect.left - margin &&
		point.clientX <= rect.right + margin &&
		point.clientY >= rect.top - margin &&
		point.clientY <= rect.bottom + margin
	);
}

// Returns overlays for the currently open widget highlight (multiline-safe).
// Why: proximity-dismiss should treat the whole selected highlight as one active area.
function findCurrentWidgetHighlightOverlays(): HTMLElement[] {
	if (!highlightActionMenu) {
		return [];
	}

	const highlightId = highlightActionMenu.dataset.highlightId || '';
	const rawIndex = Number.parseInt(highlightActionMenu.dataset.highlightIndex || '', 10);
	const highlightIndex = Number.isInteger(rawIndex) ? rawIndex : -1;
	const overlays = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)) as HTMLElement[];
	if (highlightId) {
		return overlays.filter((overlay) => overlay.dataset.highlightId === highlightId);
	}
	return overlays.filter((overlay) => overlay.dataset.highlightIndex === String(highlightIndex));
}

// Proximity guard used by mousemove auto-dismiss of the floating widget.
// Why: widget should fade when pointer leaves both the widget and the active highlight region.
function isPointWithinWidgetDismissArea(point: Point): boolean {
	if (!highlightActionMenu) {
		return false;
	}

	const margin = WIDGET_AUTO_DISMISS_MARGIN_PX;
	const menuRect = highlightActionMenu.getBoundingClientRect();
	if (isPointNearRect(point, menuRect, margin)) {
		return true;
	}

	const overlays = findCurrentWidgetHighlightOverlays();
	return overlays.some((overlay) => isPointNearRect(point, overlay.getBoundingClientRect(), margin));
}

function clampToViewport(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}
	if (max < min) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}

function positionHighlightWidget(anchorElement: HTMLElement, preferredPoint: Point | null = null): void {
	if (!highlightActionMenu) {
		return;
	}

	// Overlay nodes are frequently recreated during repaint cycles.
	// Re-resolve the current anchor by highlight id/index to avoid stale detached nodes
	// snapping the widget to viewport origin.
	let resolvedAnchor = anchorElement;
	if (!resolvedAnchor.isConnected) {
		const currentAnchor = findCurrentWidgetAnchorOverlay();
		if (!currentAnchor) {
			return;
		}
		resolvedAnchor = currentAnchor;
	}

	const rect = resolvedAnchor.getBoundingClientRect();
	if (rect.width <= 0 && rect.height <= 0) {
		return;
	}

	const viewportPadding = WIDGET_VIEWPORT_PADDING_PX;
	const anchorGap = WIDGET_ANCHOR_GAP_PX;
	highlightActionMenu.style.maxWidth = `${Math.max(1, window.innerWidth - viewportPadding * 2)}px`;

	const menuRect = highlightActionMenu.getBoundingClientRect();
	const minLeft = window.scrollX + viewportPadding;
	const maxLeft = window.scrollX + window.innerWidth - menuRect.width - viewportPadding;
	const minTop = window.scrollY + viewportPadding;
	const maxTop = window.scrollY + window.innerHeight - menuRect.height - viewportPadding;
	let desiredLeft: number;
	let desiredTop: number;

	if (preferredPoint) {
		const anchorX = window.scrollX + preferredPoint.clientX;
		const anchorY = window.scrollY + preferredPoint.clientY;

		// Cursor-anchored rule: place widget top-right of click whenever space permits.
		desiredLeft = anchorX + anchorGap;
		desiredTop = anchorY - menuRect.height - anchorGap;
		if (desiredTop < minTop) {
			// Viewport safety has priority: if top placement would clip, place below cursor.
			desiredTop = anchorY + anchorGap;
		}
	} else {
		const anchorX = window.scrollX + rect.left;
		const anchorTop = window.scrollY + rect.top;
		const anchorBottom = window.scrollY + rect.bottom;
		desiredLeft = anchorX;
		const preferredTop = anchorBottom + anchorGap;
		const fallbackTop = anchorTop - menuRect.height - anchorGap;
		desiredTop = preferredTop <= maxTop ? preferredTop : fallbackTop;
	}

	const left = clampToViewport(desiredLeft, minLeft, maxLeft);
	const top = clampToViewport(desiredTop, minTop, maxTop);

	highlightActionMenu.style.top = `${top}px`;
	highlightActionMenu.style.left = `${left}px`;
}

function updateHighlightAtIndex(highlightIndex: number, updater: (highlight: AnyHighlightData) => AnyHighlightData): boolean {
	if (!bindings) {
		return false;
	}
	const currentHighlights = bindings.getHighlights();
	if (highlightIndex < 0 || highlightIndex >= currentHighlights.length) {
		return false;
	}

	const nextHighlights = currentHighlights.map((highlight, index) => (
		index === highlightIndex ? updater(highlight) : highlight
	));
	bindings.persistHighlights(nextHighlights);
	return true;
}

function removeHighlightAtIndex(highlightIndex: number): void {
	if (!bindings) {
		return;
	}
	const currentHighlights = bindings.getHighlights();
	if (highlightIndex < 0 || highlightIndex >= currentHighlights.length) {
		return;
	}

	const nextHighlights = currentHighlights.filter((_, index) => index !== highlightIndex);
	bindings.persistHighlights(nextHighlights);
}

function findOverlayAtPoint(clientX: number, clientY: number): HTMLElement | null {
	const overlays = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)) as HTMLElement[];
	for (let i = overlays.length - 1; i >= 0; i--) {
		const overlay = overlays[i];
		const rect = overlay.getBoundingClientRect();
		if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
			return overlay;
		}
	}
	return null;
}

function findOverlayByHighlightRef(highlightId: string, highlightIndex: number): HTMLElement | undefined {
	const overlays = Array.from(document.querySelectorAll(OVERLAY_SELECTOR)) as HTMLElement[];
	return overlays.find((item) => (
		highlightId
			? item.dataset.highlightId === highlightId
			: item.dataset.highlightIndex === String(highlightIndex)
	));
}

function normalizeHexColor(color: string | undefined): string {
	if (!color) {
		return DEFAULT_HIGHLIGHT_COLOR;
	}

	const normalized = color.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(normalized)) {
		return normalized;
	}
	if (/^#[0-9a-f]{3}$/.test(normalized)) {
		return `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
	}
	return DEFAULT_HIGHLIGHT_COLOR;
}

function hexToRgba(hex: string, alpha: number): string {
	const sanitized = normalizeHexColor(hex).replace('#', '');
	const value = parseInt(sanitized, 16);
	const r = (value >> 16) & 255;
	const g = (value >> 8) & 255;
	const b = value & 255;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function createActionIcon(iconNode: IconNode): SVGElement {
	return createLucideElement(iconNode) as SVGElement;
}
