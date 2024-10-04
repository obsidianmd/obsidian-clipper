import browser from './browser-polyfill';
import { throttle } from './throttle';
import { getElementXPath, getElementByXPath } from './dom-utils';

let isHighlighterMode = false;
let highlights: AnyHighlightData[] = [];
let hoverOverlay: HTMLElement | null = null;
let isApplyingHighlights = false;
let lastAppliedHighlights: string = '';
let originalLinkClickHandlers: WeakMap<HTMLElement, (event: MouseEvent) => void> = new WeakMap();

interface HighlightData {
	xpath: string;
	content: string;
	id: string;
}

interface TextHighlightData extends HighlightData {
	type: 'text';
	startOffset: number;
	endOffset: number;
}

interface ElementHighlightData extends HighlightData {
	type: 'element';
}

interface ComplexHighlightData extends HighlightData {
	type: 'complex';
}

type AnyHighlightData = TextHighlightData | ElementHighlightData | ComplexHighlightData;

interface StoredData {
	highlights: AnyHighlightData[];
	url: string;
}

// Toggle highlighter mode on or off
export function toggleHighlighter(isActive: boolean) {
	isHighlighterMode = isActive;
	document.body.classList.toggle('obsidian-highlighter-active', isHighlighterMode);
	if (isHighlighterMode) {
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousemove', handleMouseMove);
		disableLinkClicks();
	} else {
		document.removeEventListener('mouseup', handleMouseUp);
		document.removeEventListener('mousemove', handleMouseMove);
		removeHoverOverlay();
		enableLinkClicks();
	}
	updateHighlightListeners();
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

// Handle mouse up events for highlighting
function handleMouseUp(event: MouseEvent) {
	if (!isHighlighterMode) return;
	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		handleTextSelection(selection);
	} else {
		const target = event.target as Element;
		if (target.classList.contains('obsidian-highlight-overlay')) {
			removeHighlightByElement(target);
		} else if (!isIgnoredElement(target)) {
			highlightElement(target);
		}
	}
}

// Handles mouse move events for hover effects
function handleMouseMove(event: MouseEvent) {
	if (!isHighlighterMode) return;
	const target = event.target as Element;
	if (!isIgnoredElement(target)) {
		createHoverOverlay(target);
	} else {
		removeHoverOverlay();
	}
}

// Check if an element should be ignored for highlighting
function isIgnoredElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'html' || element.tagName.toLowerCase() === 'body';
}

// Highlight an entire element
function highlightElement(element: Element) {
	const xpath = getElementXPath(element);
	const content = element.outerHTML;
	const isBlockElement = window.getComputedStyle(element).display === 'block';
	addHighlight({ 
		xpath, 
		content, 
		type: isBlockElement ? 'element' : 'text', 
		id: Date.now().toString(),
		startOffset: 0,
		endOffset: element.textContent?.length || 0
	});
}

// Handle text selection for highlighting
function handleTextSelection(selection: Selection) {
	const range = selection.getRangeAt(0);
	const highlightRanges = getHighlightRanges(range);
	highlightRanges.forEach(hr => addHighlight(hr));
	selection.removeAllRanges();
}

// Get highlight ranges for a given text selection
function getHighlightRanges(range: Range): TextHighlightData[] {
	const highlights: TextHighlightData[] = [];
	const fragment = range.cloneContents();
	const tempDiv = document.createElement('div');
	tempDiv.appendChild(fragment);

	const parentElement = getHighlightableParent(range.commonAncestorContainer);
	const xpath = getElementXPath(parentElement);

	highlights.push({
		xpath,
		content: sanitizeAndPreserveFormatting(tempDiv.innerHTML),
		type: 'text',
		id: Date.now().toString(),
		startOffset: getTextOffset(parentElement, range.startContainer, range.startOffset),
		endOffset: getTextOffset(parentElement, range.endContainer, range.endOffset)
	});

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
function addHighlight(highlight: AnyHighlightData) {
	highlights = mergeOverlappingHighlights(highlights, highlight);
	sortHighlights();
	applyHighlights();
	saveHighlights();
}

// Sort highlights based on their vertical position
function sortHighlights() {
	highlights.sort((a, b) => {
		const elementA = getElementByXPath(a.xpath);
		const elementB = getElementByXPath(b.xpath);
		if (elementA && elementB) {
			return getElementVerticalPosition(elementA) - getElementVerticalPosition(elementB);
		}
		return 0;
	});
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

// Getsall parent elements of a given element
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

// Update event listeners for highlight overlays
export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(highlight => {
		highlight.removeEventListener('click', removeHighlightByEvent);
		if (isHighlighterMode) {
			highlight.addEventListener('click', removeHighlightByEvent);
		}
	});
}

// Save highlights to browser storage
export function saveHighlights() {
	const url = window.location.href;
	const data: StoredData = { highlights, url };
	browser.storage.local.set({ [url]: data });
}

// Apply all highlights to the page
export function applyHighlights() {
	if (isApplyingHighlights) return;
	
	const currentHighlightsState = JSON.stringify(highlights);
	if (currentHighlightsState === lastAppliedHighlights) return;
	
	isApplyingHighlights = true;

	removeExistingHighlights();
	
	// First, create group for element highlights and complex highlights
	highlights.forEach((highlight, index) => {
		if (highlight.type === 'element' || highlight.type === 'complex') {
			const container = getElementByXPath(highlight.xpath);
			if (container) {
				createHighlightOverlayGroup(container, index, highlight);
			}
		}
	});

	// Then, create group for text highlights
	highlights.forEach((highlight, index) => {
		if (highlight.type === 'text') {
			const container = getElementByXPath(highlight.xpath);
			if (container) {
				createHighlightOverlayGroup(container, index, highlight);
			}
		}
	});

	lastAppliedHighlights = currentHighlightsState;
	isApplyingHighlights = false;
	notifyHighlightsUpdated();
}

// Find a text node at a given offset within an element
function findTextNodeAtOffset(element: Element, offset: number): { node: Node, offset: number } | null {
	let currentOffset = 0;
	const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	
	let node: Node | null = treeWalker.currentNode;
	while (node) {
		const nodeLength = node.textContent?.length || 0;
		if (currentOffset + nodeLength >= offset) {
			return { node, offset: offset - currentOffset };
		}
		currentOffset += nodeLength;
		node = treeWalker.nextNode();
	}
	
	// If we couldn't find the exact offset, return the last text node and its length
	const lastNode = treeWalker.lastChild();
	if (lastNode) {
		return { node: lastNode, offset: lastNode.textContent?.length || 0 };
	}
	
	return null;
}

// Calculate the average line height of a set of rectangles
function calculateAverageLineHeight(rects: DOMRectList): number {
	const heights = Array.from(rects).map(rect => rect.height);
	const sum = heights.reduce((a, b) => a + b, 0);
	return sum / heights.length;
}

// Create a group for elements that are part of the same highlight
function createHighlightOverlayGroup(target: Element, index: number, highlight: AnyHighlightData) {
	let container = document.querySelector(`.obsidian-highlight-container[data-highlight-index="${index}"]`) as HTMLElement;
	
	if (!container) {
		container = document.createElement('div');
		container.className = 'obsidian-highlight-container';
		container.dataset.highlightIndex = index.toString();
		container.addEventListener('click', handleHighlightClick);
		document.body.appendChild(container);
	}
	
	planHighlightOverlayRects(target, container, highlight);
}

// Plan out the overlay rectangles depending on the type of highlight, i.e. individual lines of text or entire elements
function planHighlightOverlayRects(target: Element, container: HTMLElement, highlight: AnyHighlightData) {
	const existingOverlays = Array.from(document.querySelectorAll('.obsidian-highlight-overlay'));
	if (highlight.type === 'complex' || highlight.type === 'element') {
		const rect = target.getBoundingClientRect();
		mergeHighlightOverlayRects([rect], container, highlight.content, existingOverlays, false);
	} else if (highlight.type === 'text') {
		try {
			const range = document.createRange();
			const startNode = findTextNodeAtOffset(target, highlight.startOffset);
			const endNode = findTextNodeAtOffset(target, highlight.endOffset);
			
			if (startNode && endNode) {
				range.setStart(startNode.node, startNode.offset);
				range.setEnd(endNode.node, endNode.offset);
				
				const rects = range.getClientRects();
				
				const averageLineHeight = calculateAverageLineHeight(rects);
				const textRects = Array.from(rects).filter(rect => rect.height <= averageLineHeight * 1.5);
				const complexRects = Array.from(rects).filter(rect => rect.height > averageLineHeight * 1.5);
				
				// Only create overlays for complex rects if there are no text rects
				if (textRects.length > 0) {
					mergeHighlightOverlayRects(textRects, container, highlight.content, existingOverlays, true);
				} else {
					mergeHighlightOverlayRects(complexRects, container, highlight.content, existingOverlays, false);
				}
			} else {
				console.warn('Could not find start or end node for text highlight, falling back to element highlight');
				const rect = target.getBoundingClientRect();
				mergeHighlightOverlayRects([rect], container, highlight.content, existingOverlays, false);
			}
		} catch (error) {
			console.error('Error creating text highlight, falling back to element highlight:', error);
			const rect = target.getBoundingClientRect();
			mergeHighlightOverlayRects([rect], container, highlight.content, existingOverlays, false);
		}
	}
}

// Merge a set of rectangles, to avoid adjacent and overlapping highlights where possible
function mergeHighlightOverlayRects(rects: DOMRect[], container: HTMLElement, content: string, existingOverlays: Element[], isText: boolean = false) {
	let overlaysCreated = 0;

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

	for (const rect of mergedRects) {
		const isDuplicate = existingOverlays.some(overlay => {
			const overlayRect = overlay.getBoundingClientRect();
			const duplicate = (
				Math.abs(rect.left - overlayRect.left) < 1 &&
				Math.abs(rect.top - overlayRect.top) < 1 &&
				Math.abs(rect.width - overlayRect.width) < 1 &&
				Math.abs(rect.height - overlayRect.height) < 1
			);
			return duplicate;
		});

		if (!isDuplicate) {
			createHighlightOverlayElement(rect, container, content, isText);
			overlaysCreated++;
		}
	}
}

// Create an overlay element
function createHighlightOverlayElement(rect: DOMRect, container: HTMLElement, content: string, isText: boolean = false) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	
	overlay.style.position = 'absolute';
	overlay.style.left = `${rect.left + window.scrollX}px`;
	overlay.style.top = `${rect.top + window.scrollY}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
	
	overlay.setAttribute('title', content);
	
	container.appendChild(overlay);
}

// Handle click events on highlight overlays
function handleHighlightClick(event: MouseEvent) {
	event.stopPropagation();
	const container = event.currentTarget as HTMLElement;
	removeHighlightByElement(container);
}

// Remove a highlight based on its container element
function removeHighlightByElement(container: Element) {
	const index = container.getAttribute('data-highlight-index');
	if (index !== null) {
		const highlightToRemove = highlights[parseInt(index)];
		highlights = highlights.filter(h => h.id !== highlightToRemove.id);
		container.remove();
		sortHighlights();
		applyHighlights();
		saveHighlights();
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
export function loadHighlights() {
	const url = window.location.href;
	browser.storage.local.get(url).then((result) => {
		const storedData = result[url] as StoredData | undefined;
		if (storedData && Array.isArray(storedData.highlights)) {
			highlights = storedData.highlights;
			applyHighlights();
		}
	});
}

// Update positions of all highlight overlays
function updateHighlightOverlayPositions() {
	document.querySelectorAll('.obsidian-highlight-container').forEach((container: Element) => {
		const index = container.getAttribute('data-highlight-index');
		if (index !== null) {
			const highlight = highlights[parseInt(index)];
			const target = getElementByXPath(highlight.xpath);
			if (target) {
				updateHighlightOverlay(target, container as HTMLElement, highlight);
			}
		}
	});
}

// Update a highlight overlay
function updateHighlightOverlay(target: Element, container: HTMLElement, highlight: AnyHighlightData) {
	container.innerHTML = ''; // Clear existing overlay elements
	
	planHighlightOverlayRects(target, container, highlight);
}

const throttledUpdateHighlights = throttle(() => {
	if (!isApplyingHighlights) {
		updateHighlightOverlayPositions();
	}
}, 100);

window.addEventListener('resize', throttledUpdateHighlights);
window.addEventListener('scroll', throttledUpdateHighlights);

const observer = new MutationObserver((mutations) => {
	if (!isApplyingHighlights) {
		const shouldUpdate = mutations.some(mutation => 
			mutation.type === 'childList' || 
			(mutation.type === 'attributes' && 
			 (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
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

// Create the hover overlay used to indicate which element will be highlighted
function createHoverOverlay(target: Element) {
	removeHoverOverlay();
	
	hoverOverlay = document.createElement('div');
	hoverOverlay.className = 'obsidian-highlight-hover-overlay';
	
	const rect = target.getBoundingClientRect();
	
	hoverOverlay.style.position = 'absolute';
	hoverOverlay.style.left = `${rect.left + window.scrollX - 2}px`;
	hoverOverlay.style.top = `${rect.top + window.scrollY - 2}px`;
	hoverOverlay.style.width = `${rect.width + 4}px`;
	hoverOverlay.style.height = `${rect.height + 4}px`;
	
	document.body.appendChild(hoverOverlay);
}

// Removes the hover overlay
function removeHoverOverlay() {
	if (hoverOverlay) {
		hoverOverlay.remove();
		hoverOverlay = null;
	}
}

// Remove a highlight in response to an event
function removeHighlightByEvent(event: Event) {
	const overlay = event.currentTarget as HTMLElement;
	removeHighlightByElement(overlay);
}

// Remove all existing highlight overlays from the page
export function removeExistingHighlights() {
	document.querySelectorAll('.obsidian-highlight-container').forEach(el => el.remove());
}

// Clear all highlights from the page and storage
export function clearHighlights() {
	const url = window.location.href;
	browser.storage.local.remove(url).then(() => {
		highlights = [];
		removeExistingHighlights();
		console.log('Highlights cleared for:', url);
	});
}

// Get the vertical position of an element
function getElementVerticalPosition(element: Element): number {
	return element.getBoundingClientRect().top + window.scrollY;
}