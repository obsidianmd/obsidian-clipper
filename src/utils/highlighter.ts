import browser from './browser-polyfill';
import { getElementXPath, getElementByXPath } from './dom-utils';
import {
	handleMouseUp,
	handleMouseMove,
	removeHoverOverlay,
	updateHighlightListeners,
	planHighlightOverlayRects,
	removeExistingHighlights,
	handleTouchStart,
	handleTouchMove
} from './highlighter-overlays';
import { detectBrowser, addBrowserClassToHtml } from './browser-detection';
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

export type AnyHighlightData = TextHighlightData | ElementHighlightData | ComplexHighlightData;

export let highlights: AnyHighlightData[] = [];
export let isApplyingHighlights = false;
let lastAppliedHighlights: string = '';
let originalLinkClickHandlers: WeakMap<HTMLElement, (event: MouseEvent) => void> = new WeakMap();

interface HistoryAction {
	type: 'add' | 'remove';
	oldHighlights: AnyHighlightData[];
	newHighlights: AnyHighlightData[];
}

let highlightHistory: HistoryAction[] = [];
let redoHistory: HistoryAction[] = [];
const MAX_HISTORY_LENGTH = 30;

const ALLOWED_HIGHLIGHT_TAGS = [
	'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
	'MATH', 'FIGURE', 'UL', 'OL', 'TABLE', 'LI', 'CODE', 'PRE', 'BLOCKQUOTE', 'EM', 'STRONG', 'A'
];

const BLOCK_LEVEL_TAGS_FOR_SPLIT = [
	'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'PRE', 'BLOCKQUOTE', 'FIGURE', 'TABLE'
];

export interface HighlightData {
	id: string;
	xpath: string;
	content: string;
	notes?: string[]; // Annotations
}

export interface TextHighlightData extends HighlightData {
	type: 'text';
	startOffset: number;
	endOffset: number;
}

export interface ElementHighlightData extends HighlightData {
	type: 'element';
}

export interface ComplexHighlightData extends HighlightData {
	type: 'complex';
}

export interface StoredData {
	highlights: AnyHighlightData[];
	url: string;
}

type HighlightsStorage = Record<string, StoredData>;

/**
 * Finds all storage keys that map to the current logical page URL.
 * Intended use: read-path only fallback for query/hash URL decorations.
 */
function getMatchingHighlightStorageKeys(allHighlights: HighlightsStorage, currentUrl: string): string[] {
	// Keep URL canonicalization local to read-time matching so persisted href values remain untouched.
	const toMatchKey = (url: string): string => {
		try {
			const parsedUrl = new URL(url);
			parsedUrl.search = '';
			parsedUrl.hash = '';
			return parsedUrl.href;
		} catch (_error) {
			return url;
		}
	};

	const currentUrlKey = toMatchKey(currentUrl);
	return Object.keys(allHighlights).filter((storedUrl) => toMatchKey(storedUrl) === currentUrlKey);
}

/**
 * Reads and merges highlights for every matching URL key.
 * Intended use: preserve compatibility with legacy datasets split across base/hash/query keys.
 */
function collectHighlightsForCurrentPage(allHighlights: HighlightsStorage, currentUrl: string): AnyHighlightData[] {
	const matchingKeys = getMatchingHighlightStorageKeys(allHighlights, currentUrl);

	return matchingKeys
		// Resolve matching URL keys to storage records.
		.map((storageKey) => allHighlights[storageKey])
		// Merge every record's highlight array into one read dataset.
		.flatMap((storedData) => (Array.isArray(storedData?.highlights) ? storedData.highlights : []))
		// Ignore malformed entries that are not highlight objects.
		.filter((highlight): highlight is AnyHighlightData => Boolean(highlight && typeof highlight === 'object'));
}

export function updateHighlights(newHighlights: AnyHighlightData[]) {
	const oldHighlights = [...highlights];
	highlights = newHighlights;
	addToHistory('add', oldHighlights, newHighlights);
}

// Toggle highlighter mode on or off
export function toggleHighlighterMenu(isActive: boolean) {
	document.body.classList.toggle('obsidian-highlighter-active', isActive);
	if (isActive) {
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('touchstart', handleTouchStart);
		document.addEventListener('touchmove', handleTouchMove);
		document.addEventListener('touchend', handleMouseUp);
		document.addEventListener('keydown', handleKeyDown);
		disableLinkClicks();
		createHighlighterMenu();
		addBrowserClassToHtml();
		browser.runtime.sendMessage({ action: "highlighterModeChanged", isActive: true });
		applyHighlights();
	} else {
		document.removeEventListener('mouseup', handleMouseUp);
		document.removeEventListener('mousemove', handleMouseMove);
		document.removeEventListener('touchstart', handleTouchStart);
		document.removeEventListener('touchmove', handleTouchMove);
		document.removeEventListener('touchend', handleMouseUp);
		document.removeEventListener('keydown', handleKeyDown);
		removeHoverOverlay();
		enableLinkClicks();
		removeHighlighterMenu();
		browser.runtime.sendMessage({ action: "highlighterModeChanged", isActive: false });
		if (!generalSettings.alwaysShowHighlights) {
			removeExistingHighlights();
		}
	}
	updateHighlightListeners();
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
			applyHighlights();
			saveHighlights();
			updateHighlighterMenu();
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
			applyHighlights();
			saveHighlights();
			updateHighlighterMenu();
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

// Disable clicking on links when highlighter is active
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

// Restore original link click functionality
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

// Highlight an entire element
export function highlightElement(element: Element, notes?: string[]) {
	let targetElement = element;
	const originalTagName = element.tagName.toUpperCase();

	// If a table cell or row is targeted, try to highlight the parent table instead
	if (['TD', 'TH', 'TR'].includes(originalTagName)) {
		const parentTable = element.closest('table');
		if (parentTable) {
			targetElement = parentTable;
		} else {
			// If a cell/row is not within a table, do not highlight.
			console.log('Table cell/row targeted, but no parent table found. Not highlighting:', originalTagName);
			return;
		}
	}

	// Now, check if the determined targetElement (which could be the original element or a table) is allowed.
	const finalTagName = targetElement.tagName.toUpperCase();
	if (!ALLOWED_HIGHLIGHT_TAGS.includes(finalTagName)) {
		// If the targetElement itself is not allowed, try its parent.
		// This primarily applies to cases where the original element was not a table cell/row.
		if (targetElement.parentElement && ALLOWED_HIGHLIGHT_TAGS.includes(targetElement.parentElement.tagName.toUpperCase())) {
			targetElement = targetElement.parentElement;
		} else {
			console.log('Element type not allowed for highlighting:', finalTagName);
			return;
		}
	}

	const xpath = getElementXPath(targetElement);
	const content = targetElement.outerHTML;
	const isBlockElement = window.getComputedStyle(targetElement).display === 'block';
	addHighlight({ 
		xpath, 
		content, 
		type: isBlockElement ? 'element' : 'text', 
		id: Date.now().toString(),
		startOffset: 0,
		endOffset: targetElement.textContent?.length || 0
	}, notes);
}

// Handle text selection for highlighting
export function handleTextSelection(selection: Selection, notes?: string[]) {
	if (selection.isCollapsed) return;
	const range = selection.getRangeAt(0);
	const newHighlightDatas = getHighlightRanges(range);

	if (newHighlightDatas.length > 0) {
		const oldGlobalHighlights = [...highlights]; // Save global state BEFORE this operation
		let currentBatchHighlights = [...highlights]; // Start with global state for merging

		for (const highlightData of newHighlightDatas) {
			const newHighlightWithNotes = { ...highlightData, notes: notes || [] };
			// Merge current new highlight with the accumulating batch from this selection + pre-existing ones
			currentBatchHighlights = mergeOverlappingHighlights(currentBatchHighlights, newHighlightWithNotes);
		}
		
		highlights = currentBatchHighlights; // Update global highlights with the final merged result
		
		// Only add to history if something actually changed from the initial global state
		if (JSON.stringify(oldGlobalHighlights) !== JSON.stringify(highlights)) {
			addToHistory('add', oldGlobalHighlights, highlights); 
		}
		
		sortHighlights(); // Sort once after all additions
		applyHighlights(); // Apply once
		saveHighlights();  // Save once
		updateHighlighterMenu(); // Update menu once
	}
	selection.removeAllRanges();
}

// Get highlight ranges for a given text selection
function getHighlightRanges(range: Range): TextHighlightData[] {
	const newHighlights: TextHighlightData[] = [];
	if (range.collapsed) return newHighlights;

	const uniqueParentBlocks = new Set<Element>();
	const textNodeIterator = document.createNodeIterator(
		range.commonAncestorContainer,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node) => {
				return range.intersectsNode(node) && node.nodeValue && node.nodeValue.trim().length > 0
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT;
			}
		}
	);

	let currentTextNode;
	while ((currentTextNode = textNodeIterator.nextNode())) {
		const block = getClosestAllowedBlock(currentTextNode);
		if (block) {
			uniqueParentBlocks.add(block);
		}
	}

	// Sort the blocks in document order to process them correctly
	const sortedBlocks = Array.from(uniqueParentBlocks).sort((a, b) => {
		const pos = a.compareDocumentPosition(b);
		if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
		if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
		return 0;
	});

	for (let i = 0; i < sortedBlocks.length; i++) {
		const blockElement = sortedBlocks[i];
		const currentBlockSelectionRange = document.createRange();

		// Determine the portion of the selection that is within this blockElement
		let startContainer = range.startContainer;
		let startOffset = range.startOffset;
		let endContainer = range.endContainer;
		let endOffset = range.endOffset;

		// Clip start to the current block if selection starts before it
		if (!blockElement.contains(startContainer) && !(blockElement === startContainer)) {
			const firstText = findFirstTextNode(blockElement);
			if (firstText) {
				startContainer = firstText;
				startOffset = 0;
			} else continue; // No text in this block to highlight
		}

		// Clip end to the current block if selection ends after it
		if (!blockElement.contains(endContainer) && !(blockElement === endContainer)) {
			const lastText = findLastTextNode(blockElement);
			if (lastText) {
				endContainer = lastText;
				endOffset = lastText.textContent?.length || 0;
			} else continue; // No text in this block
		}

		try {
			currentBlockSelectionRange.setStart(startContainer, startOffset);
			currentBlockSelectionRange.setEnd(endContainer, endOffset);

			// Final check: ensure the created range is actually within the current blockElement
			// and not collapsed.
			if (!currentBlockSelectionRange.collapsed && 
				(blockElement.contains(currentBlockSelectionRange.commonAncestorContainer) || blockElement === currentBlockSelectionRange.commonAncestorContainer)) {
				
				const contentFragment = currentBlockSelectionRange.cloneContents();
				const tempDivForBlock = document.createElement('div');
				tempDivForBlock.appendChild(contentFragment);

				const serializer = new XMLSerializer();
				let htmlContent = '';
				Array.from(tempDivForBlock.childNodes).forEach(node => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						htmlContent += serializer.serializeToString(node);
					} else if (node.nodeType === Node.TEXT_NODE) {
						htmlContent += node.textContent;
					}
				});
				const selectedTextContent = sanitizeAndPreserveFormatting(htmlContent);

				if (selectedTextContent.trim() === "") continue; // Skip empty highlights

				newHighlights.push({
					xpath: getElementXPath(blockElement),
					content: selectedTextContent,
					type: 'text',
					id: Date.now().toString() + "_" + i, // Unique ID for the batch
					startOffset: getTextOffset(blockElement, currentBlockSelectionRange.startContainer, currentBlockSelectionRange.startOffset),
					endOffset: getTextOffset(blockElement, currentBlockSelectionRange.endContainer, currentBlockSelectionRange.endOffset)
				});
			}
		} catch (e) {
			console.warn("Error creating range for block element:", blockElement, e);
		}
	}

	// Fallback: If no block-level highlights were created but there was a selection,
	// try to create a single highlight based on the closest highlightable parent.
	if (newHighlights.length === 0 && !range.collapsed) {
		console.warn("Splitting selection by block failed or no suitable blocks found, falling back to single highlight for selection.");
		const parentElement = getHighlightableParent(range.commonAncestorContainer);
		if (ALLOWED_HIGHLIGHT_TAGS.includes(parentElement.tagName.toUpperCase())) {
			const tempDivSingle = document.createElement('div');
			tempDivSingle.appendChild(range.cloneContents());

			const serializer = new XMLSerializer();
			let htmlContent = '';
			Array.from(tempDivSingle.childNodes).forEach(node => {
				if (node.nodeType === Node.ELEMENT_NODE) {
					htmlContent += serializer.serializeToString(node);
				} else if (node.nodeType === Node.TEXT_NODE) {
					htmlContent += node.textContent;
				}
			});
			const content = sanitizeAndPreserveFormatting(htmlContent);
			if (content.trim() !== "") {
				newHighlights.push({
					xpath: getElementXPath(parentElement),
					content: content,
					type: 'text',
					id: Date.now().toString(),
					startOffset: getTextOffset(parentElement, range.startContainer, range.startOffset),
					endOffset: getTextOffset(parentElement, range.endContainer, range.endOffset)
				});
			}
		} else {
			console.log("Fallback highlight's parent is not in ALLOWED_HIGHLIGHT_TAGS, skipping highlight:", parentElement.tagName);
		}
	}

	return newHighlights;
}

// Sanitize HTML content while preserving formatting
function sanitizeAndPreserveFormatting(html: string): string {
	// Use DOMParser for safer HTML parsing
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	
	// Remove any script tags
	doc.querySelectorAll('script').forEach(el => el.remove());

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

// Find the nearest highlightable parent element
function getHighlightableParent(node: Node): Element {
	let current: Node | null = node;
	while (current && current.nodeType !== Node.ELEMENT_NODE) {
		current = current.parentNode;
	}
	return current as Element;
}

// Calculate the text offset within a container element
function getTextOffset(container: Element, targetNode: Node, targetOffset: number): number {
	let offset = 0;
	const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
	
	let node: Node | null = treeWalker.currentNode;
	while (node) {
		if (node === targetNode) {
			return offset + targetOffset;
		}
		offset += (node.textContent?.length || 0);
		node = treeWalker.nextNode();
	}
	
	return offset;
}

// Add a new highlight to the page
function addHighlight(highlight: AnyHighlightData, notes?: string[]) {
	const oldHighlights = [...highlights];
	const newHighlight = { ...highlight, notes: notes || [] };
	const mergedHighlights = mergeOverlappingHighlights(highlights, newHighlight);
	highlights = mergedHighlights;
	addToHistory('add', oldHighlights, mergedHighlights);
	sortHighlights();
	applyHighlights();
	saveHighlights();
	updateHighlighterMenu();
}

// Sort highlights based on their vertical position
export function sortHighlights() {
	highlights.sort((a, b) => {
		const elementA = getElementByXPath(a.xpath);
		const elementB = getElementByXPath(b.xpath);
		if (elementA && elementB) {
			const verticalDiff = getElementVerticalPosition(elementA) - getElementVerticalPosition(elementB);
			
			// If elements are at the same vertical position (same paragraph)
			if (verticalDiff === 0) {
				// If both are text highlights in the same element, sort by offset
				if (a.type === 'text' && b.type === 'text' && a.xpath === b.xpath) {
					return a.startOffset - b.startOffset;
				}
				// Otherwise, sort by horizontal position
				return elementA.getBoundingClientRect().left - elementB.getBoundingClientRect().left;
			}
			
			return verticalDiff;
		}
		return 0;
	});
}

// Get the vertical position of an element
function getElementVerticalPosition(element: Element): number {
	return element.getBoundingClientRect().top + window.scrollY;
}

// Check if two highlights overlap
function doHighlightsOverlap(highlight1: AnyHighlightData, highlight2: AnyHighlightData): boolean {
	const element1 = getElementByXPath(highlight1.xpath);
	const element2 = getElementByXPath(highlight2.xpath);

	if (!element1 || !element2) return false;

	if (element1 === element2) {
		// For text highlights in the same element, check for overlap
		if (highlight1.type === 'text' && highlight2.type === 'text') {
			return (highlight1.startOffset < highlight2.endOffset && highlight2.startOffset < highlight1.endOffset);
		}
		// For other types, consider them overlapping if they're in the same element
		return true;
	}

	// Check if one element contains the other
	return element1.contains(element2) || element2.contains(element1);
}

// Check if two highlights are adjacent
function areHighlightsAdjacent(highlight1: AnyHighlightData, highlight2: AnyHighlightData): boolean {
	if (highlight1.type === 'text' && highlight2.type === 'text' && highlight1.xpath === highlight2.xpath) {
		return highlight1.endOffset === highlight2.startOffset || highlight2.endOffset === highlight1.startOffset;
	}
	return false;
}

// Merge overlapping highlights
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

// Merge two highlights into one
function mergeHighlights(highlight1: AnyHighlightData, highlight2: AnyHighlightData): AnyHighlightData {
	const element1 = getElementByXPath(highlight1.xpath);
	const element2 = getElementByXPath(highlight2.xpath);

	if (!element1 || !element2) {
		throw new Error("Cannot merge highlights: elements not found");
	}

	// If one highlight is an element and the other is text, prioritize the element highlight
	if (highlight1.type === 'element' && highlight2.type === 'text') {
		return highlight1;
	} else if (highlight2.type === 'element' && highlight1.type === 'text') {
		return highlight2;
	}

	let mergedElement: Element;
	if (element1.contains(element2)) {
		mergedElement = element1;
	} else if (element2.contains(element1)) {
		mergedElement = element2;
	} else {
		mergedElement = findCommonAncestor(element1, element2);
	}

	// If the merged element is different from both original elements, or if either highlight is complex, create a complex highlight
	if (mergedElement !== element1 || mergedElement !== element2 || highlight1.type === 'complex' || highlight2.type === 'complex') {
		return {
			xpath: getElementXPath(mergedElement),
			content: mergedElement.outerHTML,
			type: 'complex',
			id: Date.now().toString()
		};
	}

	// If both highlights are text and in the same element, merge them as text
	if (highlight1.type === 'text' && highlight2.type === 'text' && highlight1.xpath === highlight2.xpath) {
		return {
			xpath: highlight1.xpath,
			content: mergedElement.textContent?.slice(Math.min(highlight1.startOffset, highlight2.startOffset), 
													  Math.max(highlight1.endOffset, highlight2.endOffset)) || '',
			type: 'text',
			id: Date.now().toString(),
			startOffset: Math.min(highlight1.startOffset, highlight2.startOffset),
			endOffset: Math.max(highlight1.endOffset, highlight2.endOffset)
		};
	}

	// If we get here, treat it as a complex highlight
	return {
		xpath: getElementXPath(mergedElement),
		content: mergedElement.outerHTML,
		type: 'complex',
		id: Date.now().toString()
	};
}

// Find the common ancestor of two elements
function findCommonAncestor(element1: Element, element2: Element): Element {
	const parents1 = getParents(element1);
	const parents2 = getParents(element2);

	for (const parent of parents1) {
		if (parents2.includes(parent)) {
			return parent;
		}
	}

	return document.body; // Fallback to body if no common ancestor found
}

// Get all parent elements of a given element
function getParents(element: Element): Element[] {
	const parents: Element[] = [];
	let currentElement: Element | null = element;

	while (currentElement && currentElement !== document.body) {
		parents.unshift(currentElement);
		currentElement = currentElement.parentElement;
	}

	parents.unshift(document.body);
	return parents;
}

// Save highlights to browser storage
export function saveHighlights() {
	const url = window.location.href;
	if (highlights.length > 0) {
		const data: StoredData = { highlights, url };
		browser.storage.local.get('highlights').then((result: { highlights?: HighlightsStorage }) => {
			const allHighlights: HighlightsStorage = result.highlights || {};
			allHighlights[url] = data;
			browser.storage.local.set({ highlights: allHighlights });
		});
	} else {
		// Remove the entry if there are no highlights
		browser.storage.local.get('highlights').then((result: { highlights?: HighlightsStorage }) => {
			const allHighlights: HighlightsStorage = result.highlights || {};
			delete allHighlights[url];
			browser.storage.local.set({ highlights: allHighlights });
		});
	}
}

// Apply all highlights to the page
export function applyHighlights() {
	if (highlights.length === 0) {
		return; // Don't do anything if there are no highlights
	}

	if (isApplyingHighlights) return;
	
	const currentHighlightsState = JSON.stringify(highlights);
	if (currentHighlightsState === lastAppliedHighlights) return;
	
	isApplyingHighlights = true;

	removeExistingHighlights();
	
	highlights.forEach((highlight, index) => {
		const container = getElementByXPath(highlight.xpath);
		if (container) {
			planHighlightOverlayRects(container, highlight, index);
		}
	});

	lastAppliedHighlights = currentHighlightsState;
	isApplyingHighlights = false;
	notifyHighlightsUpdated();
}

// Notify that highlights have been updated
async function notifyHighlightsUpdated() {
	const response = await browser.runtime.sendMessage({ action: "getActiveTab" }) as { tabId?: number; error?: string };
	if (response.tabId) {
		browser.runtime.sendMessage({ action: "highlightsUpdated", tabId: response.tabId });
	}
}

// Get all highlight contents
export function getHighlights(): string[] {
	return highlights.map(h => h.content);
}

// Load highlights from browser storage
export async function loadHighlights() {
	const url = window.location.href;
	const result = await browser.storage.local.get('highlights');
	const allHighlights = (result.highlights || {}) as HighlightsStorage;
	const mergedHighlights = collectHighlightsForCurrentPage(allHighlights, url);
	
	if (mergedHighlights.length > 0) {
		highlights = mergedHighlights;
		
		// Load settings to check if "Always show highlights" is enabled
		await loadSettings();
		
		if (generalSettings.alwaysShowHighlights) {
			applyHighlights();
			document.body.classList.add('obsidian-highlighter-always-show');
		}
	} else {
		highlights = [];
	}
	lastAppliedHighlights = JSON.stringify(highlights);
}

// Clear all highlights from the page and storage
export function clearHighlights() {
	const url = window.location.href;
	const oldHighlights = [...highlights];
	browser.storage.local.get('highlights').then((result: { highlights?: HighlightsStorage }) => {
		const allHighlights: HighlightsStorage = result.highlights || {};
		delete allHighlights[url];
		browser.storage.local.set({ highlights: allHighlights }).then(() => {
			highlights = [];
			removeExistingHighlights();
			console.log('Highlights cleared for:', url);
			browser.runtime.sendMessage({ action: "highlightsCleared" });
			notifyHighlightsUpdated();
			updateHighlighterMenu();
			addToHistory('remove', oldHighlights, []);
		});
	});
}

export function updateHighlighterMenu() {
	removeHighlighterMenu();
	createHighlighterMenu();
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

function isConsideredBlockElement(element: Element): boolean {
	if (!element || typeof element.tagName !== 'string') return false;
	const tagName = element.tagName.toUpperCase();
	// Element must be an allowed highlight target AND a block tag we split by.
	return ALLOWED_HIGHLIGHT_TAGS.includes(tagName) && BLOCK_LEVEL_TAGS_FOR_SPLIT.includes(tagName);
}

// Helper to find the closest ancestor that is an allowed highlightable block
function getClosestAllowedBlock(node: Node | null): Element | null {
	let current: Node | null = node;
	while (current) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const el = current as Element;
			// Check if it's an allowed tag overall and if it's a block element we use for splitting text selections.
			if (ALLOWED_HIGHLIGHT_TAGS.includes(el.tagName.toUpperCase()) && isConsideredBlockElement(el)) {
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

export { getElementXPath } from './dom-utils';
