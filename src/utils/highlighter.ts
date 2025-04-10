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
	handleTouchMove,
	findTextInCleanContent,
	getTextNodesIn,
	getCleanTextContent,
	findTextNodeAtPosition,
	normalizeText,
	generateTextFragmentString
} from './highlighter-overlays';
import { detectBrowser, addBrowserClassToHtml } from './browser-detection';
import { generalSettings, loadSettings } from './storage-utils';

export type AnyHighlightData = TextHighlightData | ElementHighlightData | ComplexHighlightData | FragmentHighlightData;

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

export interface FragmentHighlightData extends HighlightData {
	type: 'fragment';
	textStart: string;
	textEnd?: string;
	prefix?: string;
	suffix?: string;
}

export interface StoredData {
	highlights: AnyHighlightData[];
	url: string;
}

type HighlightsStorage = Record<string, StoredData>;

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
	
	menu.innerHTML = `
		${highlightCount > 0 ? `<button id="obsidian-clip-button" class="mod-cta">Clip highlights</button>` : '<span class="no-highlights">Select elements to highlight</span>'}
		${highlightCount > 0 ? `<button id="obsidian-clear-highlights">${highlightText} <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button>` : ''}
		${highlightCount > 0 ? `<button id="obsidian-copy-all-links"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg></button>` : ''}
		<button id="obsidian-undo-highlights"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-undo-2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg></button>
		<button id="obsidian-redo-highlights"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-redo-2"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg></button>
		<button id="obsidian-exit-highlighter"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>	
	`;

	if (highlightCount > 0) {
		const clearButton = document.getElementById('obsidian-clear-highlights');
		const clipButton = document.getElementById('obsidian-clip-button');
		const copyAllButton = document.getElementById('obsidian-copy-all-links');

		if (clearButton) {
			clearButton.addEventListener('click', clearHighlights);
			clearButton.addEventListener('touchend', (e) => {
				e.preventDefault();
				clearHighlights();
			});
		}

		if (clipButton) {
			clipButton.addEventListener('click', handleClipButtonClick);
			clipButton.addEventListener('touchend', (e) => {
				e.preventDefault();
				handleClipButtonClick(e);
			});
		}

		if (copyAllButton) {
			copyAllButton.addEventListener('click', handleCopyAllHighlightsLink);
			copyAllButton.addEventListener('touchend', (e) => {
				e.preventDefault();
				handleCopyAllHighlightsLink();
			});
		}
	}

	const exitButton = document.getElementById('obsidian-exit-highlighter');
	const undoButton = document.getElementById('obsidian-undo-highlights');
	const redoButton = document.getElementById('obsidian-redo-highlights');

	if (exitButton) {
		exitButton.addEventListener('click', exitHighlighterMode);
		exitButton.addEventListener('touchend', (e) => {
			e.preventDefault();
			exitHighlighterMode();
		});
	}

	if (undoButton) {
		undoButton.addEventListener('click', undo);
		undoButton.addEventListener('touchend', (e) => {
			e.preventDefault();
			undo();
		});
	}

	if (redoButton) {
		redoButton.addEventListener('click', redo);
		redoButton.addEventListener('touchend', (e) => {
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

// Create a fragment highlight from a text selection
function createFragmentHighlight(range: Range): FragmentHighlightData | null {
	// If the range spans multiple paragraphs, split it
	const startParagraph = range.startContainer.parentElement?.closest('p, div, article, section');
	const endParagraph = range.endContainer.parentElement?.closest('p, div, article, section');
	
	if (startParagraph && endParagraph && startParagraph !== endParagraph) {
		console.log('Selection spans multiple paragraphs, splitting into separate highlights');
		
		const highlights: FragmentHighlightData[] = [];
		let currentParagraph = startParagraph;
		
		while (currentParagraph) {
			const paragraphRange = document.createRange();
			
			// Set range start
			if (currentParagraph === startParagraph) {
				paragraphRange.setStart(range.startContainer, range.startOffset);
			} else {
				const firstTextNode = getFirstTextNode(currentParagraph);
				if (!firstTextNode) continue;
				paragraphRange.setStart(firstTextNode, 0);
			}
			
			// Set range end
			if (currentParagraph === endParagraph) {
				paragraphRange.setEnd(range.endContainer, range.endOffset);
				const highlight = createSingleParagraphHighlight(paragraphRange);
				if (highlight) highlights.push(highlight);
				break;
			} else {
				const lastTextNode = getLastTextNode(currentParagraph);
				if (!lastTextNode) continue;
				paragraphRange.setEnd(lastTextNode, lastTextNode.textContent?.length || 0);
				const highlight = createSingleParagraphHighlight(paragraphRange);
				if (highlight) highlights.push(highlight);
			}
			
			// Move to next paragraph
			const nextParagraph = getNextParagraph(currentParagraph, endParagraph);
			if (!nextParagraph) break;
			currentParagraph = nextParagraph;
		}
		
		// Return the first highlight and queue the rest for addition
		if (highlights.length > 0) {
			highlights.slice(1).forEach(highlight => {
				setTimeout(() => addHighlight(highlight), 0);
			});
			return highlights[0];
		}
		return null;
	}
	
	return createSingleParagraphHighlight(range);
}

// Helper function to create a highlight within a single paragraph
function createSingleParagraphHighlight(range: Range): FragmentHighlightData | null {
	const fragment = range.cloneContents();
	const tempDiv = document.createElement('div');
	tempDiv.appendChild(fragment);
	
	// Get the text content
	const textContent = tempDiv.textContent || '';
	if (!textContent.trim()) return null;
	
	// Get prefix and suffix context (up to 20 chars)
	const prefixNode = range.startContainer.textContent?.slice(Math.max(0, range.startOffset - 20), range.startOffset);
	const suffixNode = range.endContainer.textContent?.slice(range.endOffset, range.endOffset + 20);
	
	// Get the common ancestor that's an Element
	let commonAncestor: Element | null = range.commonAncestorContainer as Element;
	if (commonAncestor.nodeType !== Node.ELEMENT_NODE) {
		commonAncestor = commonAncestor.parentElement;
	}
	if (!commonAncestor) return null;
	
	// Clean and encode the text fragments
	const textStart = encodeURIComponent(textContent);
	const prefix = prefixNode ? encodeURIComponent(prefixNode) : undefined;
	const suffix = suffixNode ? encodeURIComponent(suffixNode) : undefined;
	
	const highlight = {
		type: 'fragment' as const,
		xpath: getElementXPath(commonAncestor),
		content: textContent,
		id: Date.now().toString(),
		textStart,
		prefix,
		suffix
	};

	// Test if we can find this highlight
	const canFind = testHighlightFindability(highlight);
	if (!canFind) {
		console.warn('Created highlight cannot be found reliably:', {
			text: decodeURIComponent(textStart),
			prefix: prefix ? decodeURIComponent(prefix) : undefined,
			suffix: suffix ? decodeURIComponent(suffix) : undefined,
			xpath: highlight.xpath
		});
		return null;
	}

	console.log('Created fragment highlight:', {
		text: decodeURIComponent(textStart),
		prefix: prefix ? decodeURIComponent(prefix) : undefined,
		suffix: suffix ? decodeURIComponent(suffix) : undefined,
		xpath: highlight.xpath
	});
	
	return highlight;
}

// Helper function to get the first text node in an element
function getFirstTextNode(element: Element): Node | null {
	const walker = document.createTreeWalker(
		element,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node: Node) => {
				if (node.textContent?.trim()) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_SKIP;
			}
		}
	);
	return walker.nextNode();
}

// Helper function to get the last text node in an element
function getLastTextNode(element: Element): Node | null {
	const walker = document.createTreeWalker(
		element,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node: Node) => {
				if (node.textContent?.trim()) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_SKIP;
			}
		}
	);
	
	let lastNode: Node | null = null;
	let currentNode: Node | null;
	while (currentNode = walker.nextNode()) {
		lastNode = currentNode;
	}
	return lastNode;
}

// Helper function to get the next paragraph element
function getNextParagraph(current: Element, end: Element): Element | null {
	let next = current.nextElementSibling;
	while (next) {
		if (next.matches('p, div, article, section')) {
			return next;
		}
		next = next.nextElementSibling;
	}
	
	// If not found at same level, try parent's next sibling
	let parent = current.parentElement;
	while (parent && parent !== end.parentElement) {
		next = parent.nextElementSibling;
		while (next) {
			const paragraph = next.querySelector('p, div, article, section');
			if (paragraph) return paragraph;
			next = next.nextElementSibling;
		}
		parent = parent.parentElement;
	}
	
	return null;
}

// Test if a highlight can be found reliably
function testHighlightFindability(highlight: FragmentHighlightData): boolean {
	const result = findTextInCleanContent(
		document.body,
		decodeURIComponent(highlight.textStart),
		highlight.prefix,
		highlight.suffix
	);
	return result !== null;
}

// Helper function to create and add a highlight for a specific range (within a single block)
async function createAndAddHighlightForRange(range: Range, notes?: string[]): Promise<boolean> {
	console.log("[Helper] Attempting highlight for range:", range.toString().slice(0, 100) + '...');
	try {
		const isInReader = document.documentElement.classList.contains('obsidian-reader-active');
		const selectedText = range.toString();
		if (!selectedText.trim()) {
			console.log("[Helper] Skipping empty range.");
			return false;
		}

		let container = range.commonAncestorContainer;
		if (container.nodeType === Node.TEXT_NODE) {
			container = container.parentElement!;
		}
		if (!container || !(container instanceof Element)) {
			console.error('[Helper] Could not find a valid container element.');
			return false;
		}
		console.log(`[Helper] Container found: <${container.tagName.toLowerCase()}>`);

		// --- Calculate positions and context within this specific range's container ---
		const textNodes = getTextNodesIn(container);
		let fullText = '';
		const nodePositions: { node: Node, start: number, end: number }[] = [];
		for (const node of textNodes) {
			const nodeText = node.textContent || '';
			nodePositions.push({ node, start: fullText.length, end: fullText.length + nodeText.length });
			fullText += nodeText;
		}

		let absoluteStart = -1;
		let absoluteEnd = -1;

		// Find absolute start position (Add logging)
		for (const { node, start } of nodePositions) {
			if (node === range.startContainer) {
				absoluteStart = start + range.startOffset;
				console.log(`[Helper] Start pos found (direct): ${absoluteStart}`);
				break;
			}
			if (range.startContainer.contains(node) && range.startContainer !== node) {
				const walker = document.createTreeWalker(range.startContainer, NodeFilter.SHOW_TEXT);
				let offsetWithinContainer = 0; let foundNode: Node | null;
				while (foundNode = walker.nextNode()) {
					if (node === foundNode) { absoluteStart = start + range.startOffset - offsetWithinContainer; console.log(`[Helper] Start pos found (within element): ${absoluteStart}`); break; }
					offsetWithinContainer += foundNode.textContent?.length || 0;
				}
				if (absoluteStart !== -1) break;
			}
		}

		// Find absolute end position (Add logging)
		for (const { node, start } of nodePositions) {
			if (node === range.endContainer) {
				absoluteEnd = start + range.endOffset;
				console.log(`[Helper] End pos found (direct): ${absoluteEnd}`);
				break;
			}
			if (range.endContainer.contains(node) && range.endContainer !== node) {
				const walker = document.createTreeWalker(range.endContainer, NodeFilter.SHOW_TEXT);
				let offsetWithinContainer = 0; let foundNode: Node | null;
				while (foundNode = walker.nextNode()) {
					const nodeLength = foundNode.textContent?.length || 0;
					if (node === foundNode) {
						if (range.endOffset >= offsetWithinContainer && range.endOffset <= offsetWithinContainer + nodeLength) {
							absoluteEnd = start + range.endOffset - offsetWithinContainer; console.log(`[Helper] End pos found (within element): ${absoluteEnd}`); break;
						}
					}
					offsetWithinContainer += nodeLength;
				}
				if (absoluteEnd !== -1) break;
			}
		}

		// Fallback / sanity check (Add logging)
		if (absoluteStart === -1 || absoluteEnd === -1 || absoluteStart > absoluteEnd || fullText.slice(absoluteStart, absoluteEnd) !== selectedText) {
			console.warn("[Helper] Inaccurate positions. Using fallback.", { absoluteStart, absoluteEnd, selectedTextLen: selectedText.length, slice: fullText.slice(absoluteStart, absoluteEnd).slice(0,50) });
			const normalizedFullText = normalizeText(fullText);
			const normalizedSelectedText = normalizeText(selectedText);
			const foundIndex = normalizedFullText.indexOf(normalizedSelectedText);
			if (foundIndex !== -1) {
				absoluteStart = mapNormalizedPositionToOriginal(fullText, normalizedFullText, foundIndex);
				absoluteEnd = mapNormalizedPositionToOriginal(fullText, normalizedFullText, foundIndex + normalizedSelectedText.length);
				console.log("[Helper] Fallback positions calculated:", { absoluteStart, absoluteEnd });
			} else {
				console.error("[Helper] Fallback failed: Cannot find normalized text.");
				return false;
			}
		}

		if (absoluteStart === -1 || absoluteEnd === -1) {
			console.error("[Helper] Critical error: Could not determine positions.");
			return false;
		}

		const contextSize = 20;
		const prefix = fullText.substring(Math.max(0, absoluteStart - contextSize), absoluteStart);
		const suffix = fullText.substring(absoluteEnd, Math.min(fullText.length, absoluteEnd + contextSize));
		console.log("[Helper] Context extracted:", { prefix: prefix, suffix: suffix });
		// --- End context calculation ---

		const normalizedSelectedText = normalizeText(selectedText);

		const highlight: FragmentHighlightData = {
			id: Date.now().toString() + Math.random().toString(16).slice(2),
			type: 'fragment',
			xpath: getElementXPath(container),
			content: selectedText,
			textStart: encodeURIComponent(normalizedSelectedText),
			prefix: prefix ? encodeURIComponent(prefix) : undefined,
			suffix: suffix ? encodeURIComponent(suffix) : undefined,
			notes: notes
		};

		console.log('[Helper] Attempting pre-check...');
		// Pre-check using the specific container first for performance, then fallback to body
		let findResult = findTextInCleanContent(
			container,
			normalizedSelectedText,
			highlight.prefix,
			highlight.suffix
		);
		console.log(`[Helper] Pre-check in container result: ${findResult ? 'Found' : 'Not found'}`);

		if (!findResult) {
			console.warn("[Helper] Pre-check failed in container, retrying in document.body");
			findResult = findTextInCleanContent(
				document.body,
				normalizedSelectedText,
				highlight.prefix,
				highlight.suffix
			);
			console.log(`[Helper] Pre-check in body result: ${findResult ? 'Found' : 'Not found'}`);
		}

		if (findResult) {
			console.log("✅ [Helper] Highlight passed pre-check. Adding...");
			addHighlight(highlight);
			return true;
		} else {
			console.warn('❌ [Helper] Pre-check failed. Highlight not created.');
			return false;
		}

	} catch (error) {
		console.error('[Helper] Error in createAndAddHighlightForRange:', error);
		return false;
	}
}

// Handle text selection for highlighting
export async function handleTextSelection(selection: Selection, notes?: string[]) {
	console.log('🎯 handleTextSelection called with selection:', selection.toString().slice(0, 100) + '...');
	if (!selection || selection.rangeCount === 0) {
		console.log('No selection or range count is zero.');
		return;
	}

	const range = selection.getRangeAt(0);
	if (range.collapsed) {
		console.log('⚠️ Collapsed selection, no highlight created');
		return;
	}

	try {
		// --- Multi-paragraph splitting logic ---
		const startNode = range.startContainer;
		const endNode = range.endContainer;
		const commonAncestor = range.commonAncestorContainer;
		console.log("[Main] Selection details:", { startNode: startNode.nodeName, endNode: endNode.nodeName, commonAncestor: commonAncestor.nodeName });

		// Find the nearest block-level ancestors for start and end nodes
		const blockSelector = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6, div:not(.obsidian-highlighter-menu):not(#obsidian-highlight-hover-overlay)';
		const startBlock = (startNode.nodeType === Node.ELEMENT_NODE ? startNode as Element : startNode.parentElement)?.closest(blockSelector);
		const endBlock = (endNode.nodeType === Node.ELEMENT_NODE ? endNode as Element : endNode.parentElement)?.closest(blockSelector);
		console.log("[Main] Start block:", startBlock?.tagName, "End block:", endBlock?.tagName);

		// Check if the selection spans multiple block elements
		if (startBlock && endBlock && startBlock !== endBlock) {
			console.log("[Main] Selection spans multiple blocks. Starting split process...");

			const highlightsToAdd: Range[] = [];
			const walker = document.createTreeWalker(
				commonAncestor,
				NodeFilter.SHOW_ELEMENT,
				{ acceptNode: (node) => {
						if (!(node instanceof Element) || !node.matches(blockSelector)) {
							return NodeFilter.FILTER_SKIP;
						}
						const nodeRange = document.createRange();
						nodeRange.selectNodeContents(node);
						const intersects = range.compareBoundaryPoints(Range.END_TO_START, nodeRange) <= 0 &&
									  range.compareBoundaryPoints(Range.START_TO_END, nodeRange) >= 0;
						return intersects ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
					}
				}
			);

			// Set the TreeWalker's current node to the startBlock if possible
			if (startBlock && commonAncestor.contains(startBlock)) {
				walker.currentNode = startBlock;
				console.log("[Main] Walker starting at startBlock:", startBlock.tagName);
			} else {
				// If startBlock isn't valid or not under commonAncestor, we need to manually find the first intersecting block
				let firstNode = walker.firstChild();
				while(firstNode && !range.intersectsNode(firstNode)) {
					firstNode = walker.nextNode();
				}
				walker.currentNode = firstNode || commonAncestor; // Fallback to commonAncestor if no intersecting node found
				console.log("[Main] Walker starting node found via iteration:", walker.currentNode?.nodeName);
			}

			let currentNode: Node | null = walker.currentNode;
			let blockIndex = 0;

			while (currentNode) {
				if (!(currentNode instanceof Element)) { // Skip non-element nodes
					currentNode = walker.nextNode();
					continue;
				}
				const currentBlock = currentNode as Element;
				console.log(`[Main] Processing block ${blockIndex}: <${currentBlock.tagName.toLowerCase()}>`);

				// Calculate the intersection of the original range and the current block
				const intersectionRange = range.cloneRange();
				const blockBoundaryRange = document.createRange();
				blockBoundaryRange.selectNodeContents(currentBlock);

				// Adjust start: If selection starts before the block, move start to block start
				if (intersectionRange.compareBoundaryPoints(Range.START_TO_START, blockBoundaryRange) < 0) {
					console.log(`[Main] Block ${blockIndex}: Adjusting start boundary.`);
					intersectionRange.setStart(blockBoundaryRange.startContainer, blockBoundaryRange.startOffset);
				}

				// Adjust end: If selection ends after the block, move end to block end
				if (intersectionRange.compareBoundaryPoints(Range.END_TO_END, blockBoundaryRange) > 0) {
					console.log(`[Main] Block ${blockIndex}: Adjusting end boundary.`);
					intersectionRange.setEnd(blockBoundaryRange.endContainer, blockBoundaryRange.endOffset);
				}

				console.log(`[Main] Block ${blockIndex} intersection range:`, intersectionRange.toString().slice(0, 50) + '...');

				// Ensure the created range has content before adding
				if (!intersectionRange.collapsed && intersectionRange.toString().trim().length > 0) {
					highlightsToAdd.push(intersectionRange);
					console.log(`[Main] Block ${blockIndex} range added to list.`);
				} else {
					console.log(`[Main] Block ${blockIndex} range was collapsed or empty. Skipping.`);
				}

				// Stop processing if we've processed the block containing the end node
				if (currentBlock === endBlock || currentBlock.contains(endBlock)) {
					console.log(`[Main] Reached or passed endBlock. Stopping walker.`);
					break;
				}

				currentNode = walker.nextNode();
				blockIndex++;
			}

			// Add the collected highlights
			console.log(`[Main] Attempting to add ${highlightsToAdd.length} collected highlight ranges.`);
			if (highlightsToAdd.length > 0) {
				let successCount = 0;
				const results = await Promise.all(highlightsToAdd.map(hr => createAndAddHighlightForRange(hr, notes)));
				successCount = results.filter(Boolean).length;
				console.log(`[Main] Multi-block addition complete. Succeeded: ${successCount}/${highlightsToAdd.length}.`);
			} else {
				console.warn("[Main] Multi-block selection detected, but no valid highlight ranges were generated.");
			}

			// Clear selection after processing
			selection.removeAllRanges();

		} else {
			// --- Single block selection: Use the helper function ---
			console.log("[Main] Selection appears within a single block. Calling helper...");
			if (await createAndAddHighlightForRange(range, notes)) {
				selection.removeAllRanges(); // Clear selection on success
			} else {
				console.warn("[Main] Single block highlight creation failed.");
				selection.removeAllRanges(); // Clear selection even on failure
			}
		}
		// --- End multi-paragraph logic ---

	} catch (error) {
		console.error('[Main] Error handling text selection:', error);
		if (selection) selection.removeAllRanges(); // Ensure selection is cleared on error
	}
}

// Add a new highlight to the page
function addHighlight(highlight: AnyHighlightData) {
	console.log('➕ Adding new highlight:', {
		type: highlight.type,
		content: highlight.content.slice(0, 100) + (highlight.content.length > 100 ? '...' : ''),
		xpath: highlight.xpath,
		hasNotes: !!highlight.notes && highlight.notes.length > 0
	});

	const oldHighlights = [...highlights];
	// No need to create newHighlight object, notes are already included

	const mergedHighlights = mergeOverlappingHighlights(highlights, highlight);
	highlights = mergedHighlights;

	console.log('📊 Highlights after merge:', highlights.length, 'total highlights');

	addToHistory('add', oldHighlights, mergedHighlights);
	sortHighlights();
	applyHighlights(); // This will redraw based on the new `highlights` array
	saveHighlights();
	updateHighlighterMenu(); // Update UI based on the new state
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

// Merge overlapping highlights
function mergeOverlappingHighlights(existingHighlights: AnyHighlightData[], newHighlight: AnyHighlightData): AnyHighlightData[] {
	let mergedHighlights: AnyHighlightData[] = [];
	let consumedNew = false; // Track if the newHighlight has been merged into an existing one

	for (const existing of existingHighlights) {
		// Check if the new highlight overlaps/is adjacent to the current existing highlight
		let overlap = false;
		let mergedResult: AnyHighlightData | null = null;

		if (existing.type === 'fragment' && newHighlight.type === 'fragment' && existing.xpath === newHighlight.xpath) {
			const overlapAnalysis = analyzeHighlightOverlap(existing, newHighlight);
			if (overlapAnalysis.overlaps) {
				overlap = true;
				mergedResult = mergeHighlights(existing, newHighlight);
				// Preserve notes from both highlights
				const combinedNotes = Array.from(new Set([...(existing.notes || []), ...(newHighlight.notes || [])]));
				if (mergedResult) mergedResult.notes = combinedNotes.length > 0 ? combinedNotes : undefined;
			}
		} else if (existing.xpath === newHighlight.xpath && (existing.type !== 'fragment' || newHighlight.type !== 'fragment')) {
			// Simple overlap check for non-fragment or mixed types based on XPath
			overlap = true;
			mergedResult = mergeComplexHighlights(existing, newHighlight);
			const combinedNotes = Array.from(new Set([...(existing.notes || []), ...(newHighlight.notes || [])]));
			if (mergedResult) mergedResult.notes = combinedNotes.length > 0 ? combinedNotes : undefined;
		}

		if (overlap && mergedResult) {
			// If overlap occurred, check if we need to merge this result with the *last* item added to mergedHighlights
			if (mergedHighlights.length > 0) {
				const lastAdded = mergedHighlights[mergedHighlights.length - 1];
				let subsequentOverlap = false;
				let subsequentMergedResult: AnyHighlightData | null = null;

				if (lastAdded.type === 'fragment' && mergedResult.type === 'fragment' && lastAdded.xpath === mergedResult.xpath) {
					const subsequentOverlapAnalysis = analyzeHighlightOverlap(lastAdded, mergedResult);
					if (subsequentOverlapAnalysis.overlaps) {
						subsequentOverlap = true;
						subsequentMergedResult = mergeHighlights(lastAdded, mergedResult);
						const combinedNotes = Array.from(new Set([...(lastAdded.notes || []), ...(mergedResult.notes || [])]));
						if (subsequentMergedResult) subsequentMergedResult.notes = combinedNotes.length > 0 ? combinedNotes : undefined;
					}
				} else if (lastAdded.xpath === mergedResult.xpath && (lastAdded.type !== 'fragment' || mergedResult.type !== 'fragment')) {
					subsequentOverlap = true;
					subsequentMergedResult = mergeComplexHighlights(lastAdded, mergedResult);
					const combinedNotes = Array.from(new Set([...(lastAdded.notes || []), ...(mergedResult.notes || [])]));
					if (subsequentMergedResult) subsequentMergedResult.notes = combinedNotes.length > 0 ? combinedNotes : undefined;
				}

				if (subsequentOverlap && subsequentMergedResult) {
					mergedHighlights[mergedHighlights.length - 1] = subsequentMergedResult; // Replace last item
				} else {
					mergedHighlights.push(mergedResult); // Add the first merge result
				}
			} else {
				mergedHighlights.push(mergedResult); // Add the first merge result
			}
			consumedNew = true; // The new highlight was merged
		} else {
			mergedHighlights.push(existing); // No overlap with new highlight, keep existing
		}
	}

	// If the new highlight wasn't merged into any existing highlight, add it now.
	if (!consumedNew) {
		console.log('Adding new highlight without merging');
		mergedHighlights.push(newHighlight);
	}

	return mergedHighlights;
}

// In the analyzeHighlightOverlap function, update the position handling:
function analyzeHighlightOverlap(highlight1: FragmentHighlightData, highlight2: FragmentHighlightData): {
	overlaps: boolean;
	type?: 'encompasses' | 'extends-start' | 'extends-end' | 'adjacent';
	position: number; // Make position required
} {
	if (highlight1.xpath !== highlight2.xpath) {
		return { overlaps: false, position: 0 };
	}

	const element = getElementByXPath(highlight1.xpath);
	if (!element) return { overlaps: false, position: 0 };

	const text = element.textContent || '';
	const normalizedText = normalizeText(text);
	
	const text1 = decodeURIComponent(highlight1.textStart);
	const text2 = decodeURIComponent(highlight2.textStart);
	
	const start1 = normalizedText.indexOf(normalizeText(text1));
	const end1 = start1 + text1.length;
	const start2 = normalizedText.indexOf(normalizeText(text2));
	const end2 = start2 + text2.length;
	
	console.log('Analyzing overlap:', {
		text1, text2,
		start1, end1,
		start2, end2
	});
	
	// Check if highlights are adjacent (within 1 character)
	if (Math.abs(end1 - start2) <= 1 || Math.abs(end2 - start1) <= 1) {
		return {
			overlaps: true,
			type: 'adjacent',
			position: Math.min(start1, start2)
		};
	}
	
	// Check if highlight2 encompasses highlight1
	if (start2 <= start1 && end2 >= end1) {
		return {
			overlaps: true,
			type: 'encompasses',
			position: start2
		};
	}
	
	// Check if highlight2 extends highlight1 at the start
	if (start2 < start1 && end2 >= start1 && end2 <= end1) {
		return {
			overlaps: true,
			type: 'extends-start',
			position: start2
		};
	}
	
	// Check if highlight2 extends highlight1 at the end
	if (start2 <= end1 && end2 > end1 && start2 >= start1) {
		return {
			overlaps: true,
			type: 'extends-end',
			position: start1
		};
	}
	
	return { overlaps: false, position: 0 };
}

// Merge two highlights based on their overlap type
function mergeHighlights(highlight1: AnyHighlightData, highlight2: AnyHighlightData): AnyHighlightData | null { // Return null on failure
	// If either highlight is not a fragment type, use the existing complex merge logic
	if (highlight1.type !== 'fragment' || highlight2.type !== 'fragment') {
		// Ensure notes are preserved in complex merge
		const merged = mergeComplexHighlights(highlight1, highlight2);
		const combinedNotes = Array.from(new Set([...(highlight1.notes || []), ...(highlight2.notes || [])]));
		if (merged) merged.notes = combinedNotes.length > 0 ? combinedNotes : undefined;
		return merged;
	}

	const overlap = analyzeHighlightOverlap(highlight1, highlight2);
	console.log('Merge analysis:', overlap);

	if (!overlap.overlaps) {
		// This case shouldn't be reached if called from mergeOverlappingHighlights,
		// but return null defensively.
		return null;
	}

	const element = getElementByXPath(highlight1.xpath);
	if (!element) return null; // Cannot merge if element not found

	// Decode texts for range finding
	const text1 = decodeURIComponent(highlight1.textStart);
	const text2 = decodeURIComponent(highlight2.textStart);

	// Find the ranges for both highlights first
	const range1Result = findTextInCleanContent(element, text1, highlight1.prefix, highlight1.suffix);
	const range2Result = findTextInCleanContent(element, text2, highlight2.prefix, highlight2.suffix);

	if (!range1Result || !range2Result) {
		console.warn("Could not find original ranges for merging highlights. Aborting merge.");
		// Return the highlight that seems "larger" or the second one as default
		return highlight1.content.length > highlight2.content.length ? highlight1 : highlight2;
	}

	const range1 = range1Result.range;
	const range2 = range2Result.range;

	// Create a new range that encompasses both original ranges
	const mergedRange = document.createRange();

	// Determine the overall start and end points
	const startsBefore = range1.compareBoundaryPoints(Range.START_TO_START, range2) <= 0;
	const endsAfter = range1.compareBoundaryPoints(Range.END_TO_END, range2) >= 0;

	mergedRange.setStart(startsBefore ? range1.startContainer : range2.startContainer,
						startsBefore ? range1.startOffset : range2.startOffset);
	mergedRange.setEnd(endsAfter ? range1.endContainer : range2.endContainer,
					  endsAfter ? range1.endOffset : range2.endOffset);


	// Now create a new highlight from this merged range
	const mergedHighlightData = createSingleParagraphHighlight(mergedRange); // Use the helper

	if (mergedHighlightData) {
		console.log('Created merged highlight:', {
			type: overlap.type,
			content: mergedHighlightData.content
		});
		// Preserve notes from both original highlights
		const combinedNotes = Array.from(new Set([...(highlight1.notes || []), ...(highlight2.notes || [])]));
		mergedHighlightData.notes = combinedNotes.length > 0 ? combinedNotes : undefined;
		return mergedHighlightData;
	} else {
		console.warn("Failed to create merged highlight data from combined range.");
		// Fallback: return the highlight that encompasses the other, or the second highlight
		if (overlap.type === 'encompasses') {
			return highlight1.content.length > highlight2.content.length ? highlight1 : highlight2; // Return the container
		}
		return highlight2; // Default fallback
	}
}

// Merge complex or element highlights
function mergeComplexHighlights(highlight1: AnyHighlightData, highlight2: AnyHighlightData): AnyHighlightData | null { // Return null on failure
	const element1 = getElementByXPath(highlight1.xpath);
	const element2 = getElementByXPath(highlight2.xpath);

	if (!element1 || !element2) {
		console.error("Cannot merge highlights: elements not found");
		return null; // Indicate failure
	}

	// If merging with an element or complex highlight, prioritize that type
	// Return the one that contains the other, or the common ancestor
	let mergedElement: Element;
	if (element1.contains(element2)) {
		mergedElement = element1;
	} else if (element2.contains(element1)) {
		mergedElement = element2;
	} else {
		// Check if one is an ancestor of the other before finding common ancestor
		const parentCheck1 = getParents(element2).includes(element1);
		const parentCheck2 = getParents(element1).includes(element2);
		if (parentCheck1) {
			mergedElement = element1;
		} else if (parentCheck2) {
			mergedElement = element2;
		} else {
			mergedElement = findCommonAncestor(element1, element2);
		}
	}

	const mergedType = (highlight1.type === 'complex' || highlight2.type === 'complex' || mergedElement !== element1 || mergedElement !== element2) ? 'complex' : 'element';

	// Preserve notes from both original highlights
	const combinedNotes = Array.from(new Set([...(highlight1.notes || []), ...(highlight2.notes || [])]));

	return {
		xpath: getElementXPath(mergedElement),
		content: mergedElement.outerHTML,
		type: mergedType,
		id: Date.now().toString(), // Generate new ID for merged highlight
		notes: combinedNotes.length > 0 ? combinedNotes : undefined
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
	try {
		// Check if we're in reader mode
		const isInReader = document.documentElement.classList.contains('obsidian-reader-active');
		
		// Get the appropriate container based on mode
		let searchContainer: Element;
		if (isInReader) {
			searchContainer = document.querySelector('.obsidian-reader-content article') || document.body;
		} else {
			searchContainer = document.body;
		}

		if (!searchContainer) {
			console.warn('Could not find container for highlights');
			return;
		}

		isApplyingHighlights = true;
		removeExistingHighlights();

		highlights.forEach((highlight, index) => {
			try {
				// Determine the target element based on highlight type
				let targetElement: Element | null = null;
				if (highlight.type === 'fragment') {
					// For fragments, the 'target' for planning is the searchContainer itself,
					// as findTextInCleanContent will locate the specific range within it.
					targetElement = searchContainer;
				} else {
					// For legacy highlight types, try to find the specific element by xpath
					targetElement = getElementByXPath(highlight.xpath);
				}

				if (targetElement) {
					// Pass both the searchContainer and the specific targetElement (if applicable)
					planHighlightOverlayRects(searchContainer, targetElement, highlight, index);
				} else if (highlight.type !== 'fragment') {
					// Only warn if a specific element (non-fragment) wasn't found
					console.warn(`Element not found for XPath: ${highlight.xpath}`);
				}
			} catch (error) {
				console.error('Error applying highlight:', error, highlight);
			}
		});

		updateHighlightListeners();
		isApplyingHighlights = false;
	} catch (error) {
		console.error('Error in applyHighlights:', error);
		isApplyingHighlights = false;
	}
}

// Notify that highlights have been updated
function notifyHighlightsUpdated() {
	browser.runtime.sendMessage({ action: "highlightsUpdated" });
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
	const storedData = allHighlights[url];
	
	if (storedData && Array.isArray(storedData.highlights) && storedData.highlights.length > 0) {
		highlights = storedData.highlights;
		
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
	browser.storage.local.set({ isHighlighterMode: false });

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

export { getElementXPath } from './dom-utils';

// Highlight an entire element (creates a complex highlight)
export function highlightElement(element: Element, notes?: string[]) {
	const xpath = getElementXPath(element);
	const content = element.outerHTML;
	// Create the highlight object first
	const highlight: ComplexHighlightData = {
		xpath,
		content,
		type: 'complex',
		id: Date.now().toString()
	};
	// Add notes if provided
	if (notes && notes.length > 0) {
		highlight.notes = notes;
	}
	// Call addHighlight with the single highlight object
	addHighlight(highlight);
}

function mapNormalizedPositionToOriginal(originalText: string, normalizedText: string, normalizedPosition: number): number {
	let originalPos = 0;
	let normalizedPos = 0;
	let originalLen = originalText.length;
	let normalizedLen = normalizedText.length;

	if (normalizedPosition <= 0) return 0;
	if (normalizedPosition >= normalizedLen) return originalLen;

	while (normalizedPos < normalizedPosition && originalPos < originalLen) {
		let originalChar = originalText[originalPos];
		let normalizedChar = normalizedText[normalizedPos];

		// Simple case: characters match (case-insensitively for robustness)
		if (originalChar.toLowerCase() === normalizedChar.toLowerCase()) {
			originalPos++;
			normalizedPos++;
		}
		// Case: Whitespace handling (skip extra whitespace in original)
		else if (/\s/.test(originalChar)) {
			if (normalizedPos > 0 && /\s/.test(normalizedText[normalizedPos - 1])) {
				// Already accounted for one space in normalized, skip extra in original
				originalPos++;
			} else if (/\s/.test(normalizedChar)) {
				// Match single whitespace
				originalPos++;
				normalizedPos++;
			} else {
				// Skip whitespace in original that doesn't exist in normalized
				originalPos++;
			}
		}
		// Case: Character was removed during normalization (e.g., soft hyphen)
		else if (originalChar !== normalizedChar) {
			// Assume originalChar was removed/transformed. Skip it.
			originalPos++;
		} else {
			// Should not happen if normalization is consistent, but break defensively
			console.warn("Normalization mapping encountered unexpected state.");
			break;
		}
	}

	// If we stopped early, try to adjust originalPos
	while (originalPos < originalLen && /\s/.test(originalText[originalPos])) {
		originalPos++;
	}

	return originalPos;
}

// Function to handle copying the link for all highlights
async function handleCopyAllHighlightsLink() {
	const fragmentHighlights = highlights.filter((h): h is FragmentHighlightData => h.type === 'fragment');

	if (fragmentHighlights.length === 0) {
		console.log("No fragment highlights to copy.");
		return;
	}

	const baseUrl = window.location.href.split('#')[0];
	const fragmentStrings = fragmentHighlights.map(generateTextFragmentString);
	const fullUrl = `${baseUrl}#:~:${fragmentStrings.join('&')}`;

	try {
		await navigator.clipboard.writeText(fullUrl);
		
		// Provide feedback (similar to individual copy button)
		const copyButton = document.getElementById('obsidian-copy-all-links');
		if (copyButton) {
			const originalIcon = copyButton.innerHTML;
			copyButton.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
			`;
			copyButton.classList.add('copied');
			
			setTimeout(() => {
				copyButton.innerHTML = originalIcon;
				copyButton.classList.remove('copied');
			}, 2000);
		}
	} catch (error) {
		console.error('Error copying all highlight links:', error);
	}
}
