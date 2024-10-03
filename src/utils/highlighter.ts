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
	const content = range.cloneContents();
	const tempDiv = document.createElement('div');
	tempDiv.appendChild(content);
	
	const xpath = getElementXPath(range.commonAncestorContainer);
	addHighlight({ 
		xpath, 
		content: tempDiv.innerHTML, 
		type: 'text', 
		id: Date.now().toString() 
	});
	
	selection.removeAllRanges();
}

function addHighlight(highlight: HighlightData) {
	highlights.push(highlight);
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
			createHighlightOverlay(container, index, highlight.type === 'text' ? highlight.content : null);
		}
	});
}

function createHighlightOverlay(target: Element, index: number, textContent: string | null = null) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightIndex = index.toString();
	
	const rect = target.getBoundingClientRect();
	
	overlay.style.position = 'absolute';
	overlay.style.left = `${rect.left + window.scrollX}px`;
	overlay.style.top = `${rect.top + window.scrollY}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
	
	if (textContent) {
		overlay.setAttribute('title', textContent);
	}
	
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