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
import { getElementByXPath, isDarkColor } from './dom-utils';

let hoverOverlay: HTMLElement | null = null;

// Check if an element should be ignored for highlighting
function isIgnoredElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'html' || 
		element.tagName.toLowerCase() === 'body' || 
		element.classList.contains('obsidian-highlighter-menu') ||
		element.closest('.obsidian-highlighter-menu') !== null;
}

// Handles mouse move events for hover effects
export function handleMouseMove(event: MouseEvent) {
	if (!isHighlighterMode) return;
	const target = event.target as Element;
	if (!isIgnoredElement(target)) {
		createOrUpdateHoverOverlay(target);
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
			handleHighlightClick(event);
		} else if (!isIgnoredElement(target)) {
			highlightElement(target);
		}
	}
}

// Update event listeners for highlight overlays
export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(highlight => {
		highlight.removeEventListener('click', handleHighlightClick);
		if (isHighlighterMode) {
			highlight.addEventListener('click', handleHighlightClick);
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

// Plan out the overlay rectangles depending on the type of highlight
export function planHighlightOverlayRects(target: Element, highlight: AnyHighlightData, index: number) {
	const existingOverlays = Array.from(document.querySelectorAll('.obsidian-highlight-overlay'));
	if (highlight.type === 'complex' || highlight.type === 'element') {
		const rect = target.getBoundingClientRect();
		mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index);
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
					mergeHighlightOverlayRects(textRects, highlight.content, existingOverlays, true, index);
				} else {
					mergeHighlightOverlayRects(complexRects, highlight.content, existingOverlays, false, index);
				}
			} else {
				console.warn('Could not find start or end node for text highlight, falling back to element highlight');
				const rect = target.getBoundingClientRect();
				mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index);
			}
		} catch (error) {
			console.error('Error creating text highlight, falling back to element highlight:', error);
			const rect = target.getBoundingClientRect();
			mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index);
		}
	}
}

// Merge a set of rectangles, to avoid adjacent and overlapping highlights where possible
function mergeHighlightOverlayRects(rects: DOMRect[], content: string, existingOverlays: Element[], isText: boolean = false, index: number) {
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
			return (
				Math.abs(rect.left - overlayRect.left) < 1 &&
				Math.abs(rect.top - overlayRect.top) < 1 &&
				Math.abs(rect.width - overlayRect.width) < 1 &&
				Math.abs(rect.height - overlayRect.height) < 1
			);
		});

		if (!isDuplicate) {
			createHighlightOverlayElement(rect, content, isText, index);
		}
	}
}

// Create an overlay element
function createHighlightOverlayElement(rect: DOMRect, content: string, isText: boolean = false, index: number) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightIndex = index.toString();
	
	overlay.style.position = 'absolute';
	overlay.style.left = `${rect.left + window.scrollX}px`;
	overlay.style.top = `${rect.top + window.scrollY}px`;
	overlay.style.width = `${rect.width}px`;
	overlay.style.height = `${rect.height}px`;
	
	overlay.setAttribute('title', content);
	
	// Get the background color of the element under the highlight
	const elementAtPoint = document.elementFromPoint(rect.left, rect.top);
	if (elementAtPoint) {
		const bgColor = getEffectiveBackgroundColor(elementAtPoint as HTMLElement);
		console.log('Effective background color:', bgColor);
		if (isDarkColor(bgColor)) {
			overlay.classList.add('obsidian-highlight-overlay-dark');
		}
	}
	
	overlay.addEventListener('click', handleHighlightClick);
	document.body.appendChild(overlay);
}

// Helper function to get the effective background color
function getEffectiveBackgroundColor(element: HTMLElement): string {
	let currentElement: HTMLElement | null = element;
	while (currentElement) {
		const backgroundColor = window.getComputedStyle(currentElement).backgroundColor;
		if (backgroundColor !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'transparent') {
			return backgroundColor;
		}
		currentElement = currentElement.parentElement;
	}
	// If we've reached here, we haven't found a non-transparent background.
	// Return white as a default.
	return 'rgb(255, 255, 255)';
}

// Update positions of all highlight overlays
function updateHighlightOverlayPositions() {
	highlights.forEach((highlight, index) => {
		const target = getElementByXPath(highlight.xpath);
		if (target) {
			removeExistingHighlightOverlays(index);
			planHighlightOverlayRects(target, highlight, index);
		}
	});
}

// Remove existing highlight overlays for a specific index
function removeExistingHighlightOverlays(index: number) {
	document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => el.remove());
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

// Create or update the hover overlay used to indicate which element will be highlighted
function createOrUpdateHoverOverlay(target: Element) {
	if (!hoverOverlay) {
		hoverOverlay = document.createElement('div');
		hoverOverlay.id = 'obsidian-highlight-hover-overlay';
		document.body.appendChild(hoverOverlay);
	}
	
	const rect = target.getBoundingClientRect();
	
	hoverOverlay.style.position = 'absolute';
	hoverOverlay.style.left = `${rect.left + window.scrollX - 2}px`;
	hoverOverlay.style.top = `${rect.top + window.scrollY - 2}px`;
	hoverOverlay.style.width = `${rect.width + 4}px`;
	hoverOverlay.style.height = `${rect.height + 4}px`;
	hoverOverlay.style.display = 'block';
}

// Removes the hover overlay
export function removeHoverOverlay() {
	if (hoverOverlay) {
		hoverOverlay.style.display = 'none';
	}
}

// Update the type of handleHighlightClick
function handleHighlightClick(event: Event) {
	event.stopPropagation();
	const overlay = event.currentTarget as HTMLElement;
	const index = overlay.dataset.highlightIndex;
	if (index !== undefined) {
		const highlightToRemove = highlights[parseInt(index)];
		const newHighlights = highlights.filter((h: AnyHighlightData) => h.id !== highlightToRemove.id);
		updateHighlights(newHighlights);
		removeExistingHighlightOverlays(parseInt(index));
		sortHighlights();
		applyHighlights();
		saveHighlights();
	}
}

// Remove all existing highlight overlays from the page
export function removeExistingHighlights() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(el => el.remove());
}