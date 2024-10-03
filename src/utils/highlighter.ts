import browser from './browser-polyfill';
import { debounce } from './debounce';
import { getElementXPath, getElementByXPath } from './dom-utils';

let isHighlighterMode = false;
let highlights: HighlightData[] = [];
let hoverOverlay: HTMLElement | null = null;

interface HighlightData {
	xpath: string;
	content: string;
	type: 'text' | 'element' | 'complex';
	id: string;
	startOffset?: number;
	endOffset?: number;
}

interface StoredData {
	highlights: HighlightData[];
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
	const startContainer = range.startContainer;
	const endContainer = range.endContainer;
	
	if (startContainer === endContainer && startContainer.nodeType === Node.TEXT_NODE) {
		// Single node selection
		handleSingleNodeSelection(range);
	} else {
		// Multi-node selection
		handleMultiNodeSelection(range);
	}
	
	selection.removeAllRanges();
}

function handleSingleNodeSelection(range: Range) {
	const xpath = getElementXPath(range.startContainer.parentNode!);
	const content = range.toString();
	addHighlight({ 
		xpath, 
		content, 
		type: 'text', 
		id: Date.now().toString(),
		startOffset: range.startOffset,
		endOffset: range.endOffset
	});
}

function handleMultiNodeSelection(range: Range) {
	const fragment = range.cloneContents();
	const tempDiv = document.createElement('div');
	tempDiv.appendChild(fragment);
	
	const xpath = getElementXPath(range.commonAncestorContainer);
	const content = tempDiv.innerHTML;
	
	addHighlight({ 
		xpath, 
		content, 
		type: 'complex', 
		id: Date.now().toString()
		// Remove startOffset and endOffset for complex selections
	});
}

function addHighlight(highlight: HighlightData) {
	// Merge overlapping or adjacent text highlights
	if (highlight.type === 'text' || highlight.type === 'complex') {
		highlights = mergeOverlappingHighlights(highlights, highlight);
	} else {
		// Remove any existing text highlights that are contained within this new element highlight
		highlights = highlights.filter(h => {
			if (h.type === 'text' || h.type === 'complex') {
				const newElement = getElementByXPath(highlight.xpath);
				const existingElement = getElementByXPath(h.xpath);
				return !(newElement && existingElement && newElement.contains(existingElement));
			}
			return true;
		});
	}

	// Check if this highlight is contained within an existing element highlight
	const isContainedInElement = highlights.some(h => {
		if (h.type === 'element') {
			const existingElement = getElementByXPath(h.xpath);
			const newElement = getElementByXPath(highlight.xpath);
			return existingElement && newElement && existingElement.contains(newElement);
		}
		return false;
	});

	if (!isContainedInElement) {
		highlights.push(highlight);
	}

	applyHighlights();
	saveHighlights();
}

function mergeOverlappingHighlights(existingHighlights: HighlightData[], newHighlight: HighlightData): HighlightData[] {
	const mergedHighlights: HighlightData[] = [];
	let merged = false;

	for (const existing of existingHighlights) {
		if (existing.xpath === newHighlight.xpath && 
			(existing.type === 'text' || existing.type === 'complex') && 
			newHighlight.startOffset !== undefined && 
			newHighlight.endOffset !== undefined) {
			
			if (existing.startOffset! <= newHighlight.endOffset && existing.endOffset! >= newHighlight.startOffset) {
				// Merge overlapping highlights
				const mergedHighlight: HighlightData = {
					...existing,
					startOffset: Math.min(existing.startOffset!, newHighlight.startOffset),
					endOffset: Math.max(existing.endOffset!, newHighlight.endOffset),
					content: mergeContent(existing, newHighlight)
				};
				mergedHighlights.push(mergedHighlight);
				merged = true;
			} else {
				mergedHighlights.push(existing);
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

function mergeContent(highlight1: HighlightData, highlight2: HighlightData): string {
	const element = getElementByXPath(highlight1.xpath);
	if (element && element.textContent) {
		const start = Math.min(highlight1.startOffset!, highlight2.startOffset!);
		const end = Math.max(highlight1.endOffset!, highlight2.endOffset!);
		return element.textContent.slice(start, end);
	}
	return highlight1.content + highlight2.content;
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
	removeExistingHighlights();
	
	highlights.forEach((highlight, index) => {
		const container = getElementByXPath(highlight.xpath);
		if (container) {
			createHighlightOverlay(container, index, highlight);
		}
	});
}

function createHighlightOverlay(target: Element, index: number, highlight: HighlightData) {
	if (highlight.type === 'text' || highlight.type === 'complex') {
		createTextHighlightOverlay(target, index, highlight);
	} else {
		createElementHighlightOverlay(target, index, highlight);
	}
}

function createTextHighlightOverlay(target: Element, index: number, highlight: HighlightData) {
	const range = document.createRange();
	if (highlight.startOffset !== undefined && highlight.endOffset !== undefined) {
		range.setStart(target.firstChild!, highlight.startOffset);
		range.setEnd(target.firstChild!, highlight.endOffset);
	} else {
		range.selectNodeContents(target);
	}
	
	const rects = range.getClientRects();
	for (let i = 0; i < rects.length; i++) {
		const rect = rects[i];
		createOverlayElement(rect, index, i, highlight.content);
	}
}

function createElementHighlightOverlay(target: Element, index: number, highlight: HighlightData) {
	const rect = target.getBoundingClientRect();
	createOverlayElement(rect, index, 0, highlight.content);
}

function createOverlayElement(rect: DOMRect, index: number, rectIndex: number, content: string) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightIndex = index.toString();
	overlay.dataset.rectIndex = rectIndex.toString();
	
	overlay.style.position = 'absolute';
	overlay.style.left = `${rect.left + window.scrollX}px`;
	overlay.style.top = `${rect.top + window.scrollY}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
	
	overlay.setAttribute('title', content);
	
	document.body.appendChild(overlay);
}

function removeExistingHighlights() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(el => el.remove());
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

function removeHighlightByElement(overlay: Element) {
	const index = overlay.getAttribute('data-highlight-index');
	if (index !== null) {
		highlights = highlights.filter(h => h.id !== index);
		document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => el.remove());
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

const debouncedApplyHighlights = debounce(applyHighlights, 100);

// Reapply highlights on window resize and scroll
window.addEventListener('resize', debouncedApplyHighlights);
window.addEventListener('scroll', debouncedApplyHighlights);

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