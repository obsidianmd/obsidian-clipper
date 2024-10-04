import { 
	isHighlighterMode, 
	handleTextSelection, 
	highlightElement, 
	AnyHighlightData, 
	highlights, 
	isApplyingHighlights,
	sortHighlights,
	applyHighlights,
	saveHighlights,
	updateHighlights
} from './highlighter';
import { throttle } from './throttle';
import { getElementByXPath } from './dom-utils';

let hoverOverlay: HTMLElement | null = null;

// Check if an element should be ignored for highlighting
function isIgnoredElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'html' || element.tagName.toLowerCase() === 'body';
}

// Handles mouse move events for hover effects
export function handleMouseMove(event: MouseEvent) {
	if (!isHighlighterMode) return;
	const target = event.target as Element;
	if (!isIgnoredElement(target)) {
		createHoverOverlay(target);
	} else {
		removeHoverOverlay();
	}
}

// Handle mouse up events for highlighting
export function handleMouseUp(event: MouseEvent) {
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

// Update event listeners for highlight overlays
export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(highlight => {
		highlight.removeEventListener('click', removeHighlightByEvent);
		if (isHighlighterMode) {
			highlight.addEventListener('click', removeHighlightByEvent);
		}
	});
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
export function createHighlightOverlayGroup(target: Element, index: number, highlight: AnyHighlightData) {
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
export function removeHoverOverlay() {
	if (hoverOverlay) {
		hoverOverlay.remove();
		hoverOverlay = null;
	}
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
		const newHighlights = highlights.filter((h: AnyHighlightData) => h.id !== highlightToRemove.id);
		// Update the highlights array in the highlighter module
		updateHighlights(newHighlights);
		container.remove();
		sortHighlights();
		applyHighlights();
		saveHighlights();
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