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
	normalizeText
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
	createdInReader?: boolean;
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
		<button id="obsidian-undo-highlights"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-undo-2"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg></button>
		<button id="obsidian-redo-highlights"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-redo-2"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13"/></svg></button>
		<button id="obsidian-exit-highlighter"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>	
	`;

	if (highlightCount > 0) {
		const clearButton = document.getElementById('obsidian-clear-highlights');
		const clipButton = document.getElementById('obsidian-clip-button');

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

// Type guard to check if a highlight is valid
function isValidHighlight(highlight: FragmentHighlightData | null): highlight is FragmentHighlightData {
	return highlight !== null;
}

// Handle text selection for highlighting
export function handleTextSelection(selection: Selection, notes?: string[]) {
	console.log('🎯 handleTextSelection called with selection:', selection.toString());
	const range = selection.getRangeAt(0);
	if (range.toString().length === 0) {
		console.log('⚠️ Empty selection, no highlight created');
		return;
	}
	try {
		const range = selection.getRangeAt(0);
		const isInReader = document.documentElement.classList.contains('obsidian-reader-active');
		
		// Get the text content and context
		const selectedText = range.toString();
		const container = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
			? range.commonAncestorContainer.parentElement
			: range.commonAncestorContainer as Element;
		
		if (!container) return;
		
		// Get context before and after the selection
		const contextSize = 100;
		const fullText = getCleanTextContent(container);
		const selectionStart = range.startOffset;
		const selectionEnd = range.endOffset;
		
		const prefix = fullText.substring(Math.max(0, selectionStart - contextSize), selectionStart);
		const suffix = fullText.substring(selectionEnd, Math.min(fullText.length, selectionEnd + contextSize));
		
		// Create a fragment highlight
		const highlight: FragmentHighlightData = {
			id: Date.now().toString(),
			type: 'fragment',
			xpath: getElementXPath(container),
			content: selectedText,
			textStart: encodeURIComponent(selectedText),
			prefix: encodeURIComponent(prefix),
			suffix: encodeURIComponent(suffix),
			notes: notes,
			createdInReader: isInReader
		};
		
		// Test if we can find the highlight reliably
		if (testHighlightFindability(highlight)) {
			highlights.push(highlight);
			sortHighlights();
			applyHighlights();
			saveHighlights();
			updateHighlighterMenu();
		} else {
			console.warn('Could not reliably find the selected text for highlighting');
		}
		
		selection.removeAllRanges();
	} catch (error) {
		console.error('Error handling text selection:', error);
	}
}

// Get highlight ranges for a given text selection
function getHighlightRanges(range: Range): TextHighlightData[] {
	const highlights: TextHighlightData[] = [];
	const fragment = range.cloneContents();
	const tempDiv = document.createElement('div');
	tempDiv.appendChild(fragment);

	const parentElement = getHighlightableParent(range.commonAncestorContainer);
	const xpath = getElementXPath(parentElement);
	
	// Get the text content and find the positions
	const cleanText = getCleanTextContent(parentElement);
	const startPos = findTextNodeAtPosition(parentElement, range.startOffset);
	const endPos = findTextNodeAtPosition(parentElement, range.endOffset);
	
	if (startPos && endPos) {
		highlights.push({
			xpath,
			content: sanitizeAndPreserveFormatting(tempDiv.innerHTML),
			type: 'text',
			id: Date.now().toString(),
			startOffset: startPos.offset,
			endOffset: endPos.offset
		});
	}

	return highlights;
}

// Sanitize HTML content while preserving formatting
function sanitizeAndPreserveFormatting(html: string): string {
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = html;

	// Remove any script tags
	tempDiv.querySelectorAll('script').forEach(el => el.remove());

	// Close any unclosed tags
	return balanceTags(tempDiv.innerHTML);
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
	console.log('➕ Adding new highlight:', {
		type: highlight.type,
		content: highlight.content.slice(0, 100) + (highlight.content.length > 100 ? '...' : ''),
		xpath: highlight.xpath
	});
	
	const oldHighlights = [...highlights];
	const newHighlight = { ...highlight, notes: notes || [] };
	const mergedHighlights = mergeOverlappingHighlights(highlights, newHighlight);
	highlights = mergedHighlights;
	
	console.log('📊 Highlights after merge:', highlights.length, 'total highlights');
	
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

// Merge overlapping highlights
function mergeOverlappingHighlights(existingHighlights: AnyHighlightData[], newHighlight: AnyHighlightData): AnyHighlightData[] {
	let mergedHighlights: AnyHighlightData[] = [];
	let merged = false;

	// First try to merge with any overlapping highlights
	for (const existing of existingHighlights) {
		if (existing.type === 'fragment' && newHighlight.type === 'fragment') {
			const overlap = analyzeHighlightOverlap(existing, newHighlight);
			if (overlap.overlaps) {
				if (!merged) {
					console.log('Merging highlights due to overlap/adjacency');
					mergedHighlights.push(mergeHighlights(existing, newHighlight));
					merged = true;
				} else {
					mergedHighlights[mergedHighlights.length - 1] = mergeHighlights(mergedHighlights[mergedHighlights.length - 1], existing);
				}
			} else {
				mergedHighlights.push(existing);
			}
		} else {
			// For non-fragment highlights, use simpler overlap check
			if (existing.xpath === newHighlight.xpath) {
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
	}

	if (!merged) {
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
function mergeHighlights(highlight1: AnyHighlightData, highlight2: AnyHighlightData): AnyHighlightData {
	// If either highlight is not a fragment type, use the existing complex merge logic
	if (highlight1.type !== 'fragment' || highlight2.type !== 'fragment') {
		return mergeComplexHighlights(highlight1, highlight2);
	}
	
	const overlap = analyzeHighlightOverlap(highlight1, highlight2);
	console.log('Merge analysis:', overlap);
	
	if (!overlap.overlaps) {
		return highlight2; // No overlap, return the new highlight
	}
	
	const element = getElementByXPath(highlight1.xpath);
	if (!element) return highlight2;
	
	// Create a range that encompasses both highlights
	const range = document.createRange();
	let startNode: Node | null = null;
	let startOffset = 0;
	let endNode: Node | null = null;
	let endOffset = 0;
	
	// Get the text nodes and their positions
	const textNodes = getTextNodesIn(element);
	let currentPos = 0;
	
	// Find the appropriate nodes and offsets based on overlap type
	switch (overlap.type) {
		case 'encompasses':
			// Use the new highlight entirely
			return highlight2;
			
		case 'extends-start':
			// Use the new start but keep the old end
			for (const node of textNodes) {
				const nodeText = node.textContent || '';
				if (!startNode && currentPos + nodeText.length > overlap.position) {
					startNode = node;
					startOffset = overlap.position - currentPos;
				}
				if (!endNode && currentPos + nodeText.length > highlight1.content.length) {
					endNode = node;
					endOffset = highlight1.content.length - currentPos;
					break;
				}
				currentPos += nodeText.length;
			}
			break;
			
		case 'extends-end':
			// Keep the old start but use the new end
			for (const node of textNodes) {
				const nodeText = node.textContent || '';
				if (!startNode && currentPos + nodeText.length > overlap.position) {
					startNode = node;
					startOffset = overlap.position - currentPos;
				}
				if (!endNode && currentPos + nodeText.length > highlight2.content.length) {
					endNode = node;
					endOffset = highlight2.content.length - currentPos;
					break;
				}
				currentPos += nodeText.length;
			}
			break;
			
		case 'adjacent':
			// Create a new range that includes both highlights plus the space between
			const text1 = decodeURIComponent(highlight1.textStart);
			const text2 = decodeURIComponent(highlight2.textStart);
			const combinedText = text1 + ' ' + text2;
			
			for (const node of textNodes) {
				const nodeText = node.textContent || '';
				if (!startNode && currentPos + nodeText.length > overlap.position) {
					startNode = node;
					startOffset = overlap.position - currentPos;
				}
				if (!endNode && currentPos + nodeText.length > overlap.position + combinedText.length) {
					endNode = node;
					endOffset = overlap.position + combinedText.length - currentPos;
					break;
				}
				currentPos += nodeText.length;
			}
			break;
	}
	
	if (startNode && endNode) {
		range.setStart(startNode, startOffset);
		range.setEnd(endNode, endOffset);
		const mergedHighlight = createSingleParagraphHighlight(range);
		if (mergedHighlight) {
			console.log('Created merged highlight:', {
				type: overlap.type,
				content: mergedHighlight.content
			});
			return mergedHighlight;
		}
	}
	
	return highlight2;
}

// Merge complex or element highlights
function mergeComplexHighlights(highlight1: AnyHighlightData, highlight2: AnyHighlightData): AnyHighlightData {
	const element1 = getElementByXPath(highlight1.xpath);
	const element2 = getElementByXPath(highlight2.xpath);

	if (!element1 || !element2) {
		throw new Error("Cannot merge highlights: elements not found");
	}

	// If merging with an element or complex highlight, prioritize that type
	if (highlight1.type === 'element' || highlight1.type === 'complex') {
		return highlight1;
	} else if (highlight2.type === 'element' || highlight2.type === 'complex') {
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
	try {
		// Check if we're in reader mode
		const isInReader = document.documentElement.classList.contains('obsidian-reader-active');
		
		// Get the appropriate container based on mode
		let container: Element;
		if (isInReader) {
			container = document.querySelector('.obsidian-reader-content article') || document.body;
		} else {
			container = document.body;
		}

		if (!container) {
			console.warn('Could not find container for highlights');
			return;
		}

		isApplyingHighlights = true;
		removeExistingHighlights();

		highlights.forEach((highlight, index) => {
			try {
				if (highlight.type === 'fragment') {
					// For fragment highlights, use the container directly
					planHighlightOverlayRects(container, highlight, index);
				} else {
					// For legacy highlight types, try to find the element by xpath
					const target = getElementByXPath(highlight.xpath);
					if (target) {
						planHighlightOverlayRects(target, highlight, index);
					}
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
	addHighlight({ 
		xpath, 
		content, 
		type: 'complex',
		id: Date.now().toString()
	}, notes);
}

function isFragmentHighlight(highlight: FragmentHighlightData | null): highlight is FragmentHighlightData {
	return highlight !== null && 
		highlight.type === 'fragment' &&
		typeof highlight.textStart === 'string' &&
		typeof highlight.content === 'string' &&
		typeof highlight.xpath === 'string' &&
		typeof highlight.id === 'string';
}