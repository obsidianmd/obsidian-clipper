import browser from './browser-polyfill';
import { debounce } from './debounce';
import { getElementXPath, getElementByXPath } from './dom-utils';

let isHighlighterMode = false;
let highlights: HighlightData[] = [];
let hoverOverlay: HTMLElement | null = null;

interface HighlightData {
	xpath: string;
	content: string;
	type: 'text' | 'element';
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
		const xpath = getElementXPath(startContainer.parentNode!);
		const content = range.toString();
		addHighlight({ 
			xpath, 
			content, 
			type: 'text', 
			id: Date.now().toString(),
			startOffset: range.startOffset,
			endOffset: range.endOffset
		});
	} else {
		// For more complex selections, fall back to highlighting the common ancestor
		const commonAncestor = range.commonAncestorContainer;
		const xpath = getElementXPath(commonAncestor);
		const content = range.cloneContents().textContent || '';
		addHighlight({ 
			xpath, 
			content, 
			type: 'text', 
			id: Date.now().toString() 
		});
	}
	
	selection.removeAllRanges();
}

function addHighlight(highlight: HighlightData) {
	// Remove any existing text highlights that are contained within this new highlight
	if (highlight.type === 'element') {
		highlights = highlights.filter(h => {
			if (h.type === 'text') {
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
	
	// Sort highlights based on their position in the DOM
	highlights.sort((a, b) => {
		const elA = getElementByXPath(a.xpath);
		const elB = getElementByXPath(b.xpath);
		if (elA && elB) {
			return elA.compareDocumentPosition(elB) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
		}
		return 0;
	});

	highlights.forEach((highlight, index) => {
		const container = getElementByXPath(highlight.xpath);
		if (container) {
			createHighlightOverlay(container, index, highlight);
		}
	});
}

function createHighlightOverlay(target: Element, index: number, highlight: HighlightData) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightIndex = index.toString();
	
	if (highlight.type === 'text' && highlight.startOffset !== undefined && highlight.endOffset !== undefined) {
		const range = document.createRange();
		range.setStart(target.firstChild!, highlight.startOffset);
		range.setEnd(target.firstChild!, highlight.endOffset);
		const rect = range.getBoundingClientRect();
		
		overlay.style.position = 'absolute';
		overlay.style.left = `${rect.left + window.scrollX}px`;
		overlay.style.top = `${rect.top + window.scrollY}px`;
		overlay.style.width = `${rect.width}px`;
		overlay.style.height = `${rect.height}px`;
	} else {
		const rect = target.getBoundingClientRect();
		
		overlay.style.position = 'absolute';
		overlay.style.left = `${rect.left + window.scrollX}px`;
		overlay.style.top = `${rect.top + window.scrollY}px`;
		overlay.style.width = `${rect.width}px`;
		overlay.style.height = `${rect.height}px`;
	}
	
	overlay.setAttribute('title', highlight.content);
	
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
	const index = parseInt(overlay.getAttribute('data-highlight-index') || '-1', 10);
	if (index >= 0) {
		highlights.splice(index, 1);
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