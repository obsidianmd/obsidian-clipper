import browser from './browser-polyfill';
import { throttle } from './throttle';
import { getElementXPath, getElementByXPath } from './dom-utils';

let isHighlighterMode = false;
let highlights: AnyHighlightData[] = [];
let hoverOverlay: HTMLElement | null = null;
let isApplyingHighlights = false;
let lastAppliedHighlights: string = '';

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

export function toggleHighlighter(isActive: boolean) {
	isHighlighterMode = isActive;
	document.body.classList.toggle('obsidian-highlighter-active', isHighlighterMode);
	if (isHighlighterMode) {
		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousemove', handleMouseMove);
	} else {
		document.removeEventListener('mouseup', handleMouseUp);
		document.removeEventListener('mousemove', handleMouseMove);
		removeHoverOverlay();
	}
	updateHighlightListeners();
}

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

function handleMouseMove(event: MouseEvent) {
	if (!isHighlighterMode) return;
	const target = event.target as Element;
	if (!isIgnoredElement(target)) {
		createHoverOverlay(target);
	} else {
		removeHoverOverlay();
	}
}

function isIgnoredElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'html' || element.tagName.toLowerCase() === 'body';
}

function highlightElement(element: Element) {
	const xpath = getElementXPath(element);
	const content = element.outerHTML;
	addHighlight({ xpath, content, type: 'element', id: Date.now().toString() });
}

function handleTextSelection(selection: Selection) {
	const range = selection.getRangeAt(0);
	const highlightRanges = getHighlightRanges(range);
	highlightRanges.forEach(hr => addHighlight(hr));
	selection.removeAllRanges();
}

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

function sanitizeAndPreserveFormatting(html: string): string {
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = html;

	// Remove any script tags
	tempDiv.querySelectorAll('script').forEach(el => el.remove());

	// Close any unclosed tags
	return balanceTags(tempDiv.innerHTML);
}

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

function getHighlightableParent(node: Node): Element {
	let current: Node | null = node;
	while (current && current.nodeType !== Node.ELEMENT_NODE) {
		current = current.parentNode;
	}
	return current as Element;
}

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

function getIntersectionRange(range1: Range, range2: Range): Range | null {
	const start = range1.compareBoundaryPoints(Range.START_TO_START, range2) < 0 ? range2.startContainer : range1.startContainer;
	const end = range1.compareBoundaryPoints(Range.END_TO_END, range2) > 0 ? range2.endContainer : range1.endContainer;
	
	if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING) {
		const range = document.createRange();
		range.setStart(start, start === range2.startContainer ? range2.startOffset : range1.startOffset);
		range.setEnd(end, end === range2.endContainer ? range2.endOffset : range1.endOffset);
		return range;
	}
	
	return null;
}

function addHighlight(highlight: AnyHighlightData) {
	highlights = mergeOverlappingHighlights(highlights, highlight);
	applyHighlights();
	saveHighlights();
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

function areHighlightsAdjacent(highlight1: AnyHighlightData, highlight2: AnyHighlightData): boolean {
	if (highlight1.type === 'text' && highlight2.type === 'text' && highlight1.xpath === highlight2.xpath) {
		return highlight1.endOffset === highlight2.startOffset || highlight2.endOffset === highlight1.startOffset;
	}
	return false;
}

function mergeHighlights(highlight1: AnyHighlightData, highlight2: AnyHighlightData): AnyHighlightData {
	const element1 = getElementByXPath(highlight1.xpath);
	const element2 = getElementByXPath(highlight2.xpath);

	if (!element1 || !element2) {
		throw new Error("Cannot merge highlights: elements not found");
	}

	let mergedElement: Element;
	if (element1.contains(element2)) {
		mergedElement = element1;
	} else if (element2.contains(element1)) {
		mergedElement = element2;
	} else {
		mergedElement = findCommonAncestor(element1, element2);
	}

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

	return {
		xpath: getElementXPath(mergedElement),
		content: mergedElement.outerHTML,
		type: 'complex',
		id: Date.now().toString()
	};
}

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

export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(highlight => {
		highlight.removeEventListener('click', removeHighlightByEvent);
		if (isHighlighterMode) {
			highlight.addEventListener('click', removeHighlightByEvent);
		}
	});
}

export function saveHighlights() {
	const url = window.location.href;
	const data: StoredData = { highlights, url };
	browser.storage.local.set({ [url]: data });
}

export function applyHighlights() {
	if (isApplyingHighlights) return;
	
	const currentHighlightsState = JSON.stringify(highlights);
	if (currentHighlightsState === lastAppliedHighlights) return;
	
	isApplyingHighlights = true;

	removeExistingHighlights();
	
	highlights.forEach((highlight, index) => {
		const container = getElementByXPath(highlight.xpath);
		if (container) {
			createHighlightOverlay(container, index, highlight as AnyHighlightData);
		}
	});

	lastAppliedHighlights = currentHighlightsState;
	isApplyingHighlights = false;
}

function createHighlightOverlay(target: Element, index: number, highlight: AnyHighlightData) {
	const container = document.createElement('div');
	container.className = 'obsidian-highlight-container';
	container.dataset.highlightIndex = index.toString();
	container.addEventListener('click', handleHighlightClick);
	
	if (highlight.type === 'text') {
		createTextHighlightOverlay(target, container, highlight);
	} else if (highlight.type === 'element') {
		createElementHighlightOverlay(target, container, highlight);
	} else {
		createComplexHighlightOverlay(target, container, highlight);
	}
	
	document.body.appendChild(container);
}

function createTextHighlightOverlay(target: Element, container: HTMLElement, highlight: TextHighlightData) {
	const range = document.createRange();
	const startNode = findTextNodeAtOffset(target, highlight.startOffset);
	const endNode = findTextNodeAtOffset(target, highlight.endOffset);
	
	if (startNode && endNode) {
		range.setStart(startNode.node, startNode.offset);
		range.setEnd(endNode.node, endNode.offset);
		
		const rects = range.getClientRects();
		for (let i = 0; i < rects.length; i++) {
			const rect = rects[i];
			createOverlayElement(rect, container, highlight.content);
		}
	}
}

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
	
	return null;
}

function createElementHighlightOverlay(target: Element, container: HTMLElement, highlight: ElementHighlightData) {
	const rect = target.getBoundingClientRect();
	createOverlayElement(rect, container, highlight.content);
}

function createComplexHighlightOverlay(target: Element, container: HTMLElement, highlight: ComplexHighlightData) {
	const rect = target.getBoundingClientRect();
	createOverlayElement(rect, container, highlight.content);
}

function createOverlayElement(rect: DOMRect, container: HTMLElement, content: string) {
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

function handleHighlightClick(event: MouseEvent) {
	event.stopPropagation();
	const container = event.currentTarget as HTMLElement;
	removeHighlightByElement(container);
}

function removeHighlightByElement(container: Element) {
	const index = container.getAttribute('data-highlight-index');
	if (index !== null) {
		highlights = highlights.filter((_, i) => i.toString() !== index);
		container.remove();
		applyHighlights();
		saveHighlights();
	}
}

export function getHighlights(): string[] {
	return highlights.map(h => h.content);
}

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

const throttledApplyHighlights = throttle(() => {
	if (!isApplyingHighlights) {
		applyHighlights();
	}
}, 500);

// Reapply highlights on window resize and scroll
window.addEventListener('resize', throttledApplyHighlights);
window.addEventListener('scroll', throttledApplyHighlights);

// Modify the mutation observer to use the throttled function
const observer = new MutationObserver((mutations) => {
	if (!isApplyingHighlights) {
		// Only trigger update if mutations affect highlight positions
		const shouldUpdate = mutations.some(mutation => 
			mutation.type === 'childList' || 
			(mutation.type === 'attributes' && 
			 (mutation.attributeName === 'style' || mutation.attributeName === 'class'))
		);
		if (shouldUpdate) {
			throttledApplyHighlights();
		}
	}
});
observer.observe(document.body, { 
	childList: true, 
	subtree: true, 
	attributes: true,
	attributeFilter: ['style', 'class'], // Only observe style and class changes
	characterData: false // We don't need to observe text changes
});

function createHoverOverlay(target: Element) {
	removeHoverOverlay();
	
	hoverOverlay = document.createElement('div');
	hoverOverlay.className = 'obsidian-highlight-hover-overlay';
	
	const rect = target.getBoundingClientRect();
	
	hoverOverlay.style.position = 'absolute';
	hoverOverlay.style.left = `${rect.left + window.scrollX}px`;
	hoverOverlay.style.top = `${rect.top + window.scrollY}px`;
	hoverOverlay.style.width = `${rect.width}px`;
	hoverOverlay.style.height = `${rect.height}px`;
	
	document.body.appendChild(hoverOverlay);
}

function removeHoverOverlay() {
	if (hoverOverlay) {
		hoverOverlay.remove();
		hoverOverlay = null;
	}
}

export function clearHighlights() {
	const url = window.location.href;
	browser.storage.local.remove(url).then(() => {
		highlights = [];
		removeExistingHighlights();
		console.log('Highlights cleared for:', url);
	});
}

function removeHighlightByEvent(event: Event) {
	const overlay = event.currentTarget as HTMLElement;
	removeHighlightByElement(overlay);
}

export function removeExistingHighlights() {
	document.querySelectorAll('.obsidian-highlight-container').forEach(el => el.remove());
}