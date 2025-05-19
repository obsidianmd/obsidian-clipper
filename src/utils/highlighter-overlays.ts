import { 
	handleTextSelection, 
	highlightElement, 
	AnyHighlightData, 
	highlights, 
	isApplyingHighlights,
	sortHighlights,
	applyHighlights,
	saveHighlights,
	updateHighlights,
	updateHighlighterMenu
} from './highlighter';
import { throttle } from './throttle';
import { getElementByXPath, isDarkColor } from './dom-utils';

let hoverOverlay: HTMLElement | null = null;
let touchStartX: number = 0;
let touchStartY: number = 0;
let isTouchMoved: boolean = false;
let lastHoverTarget: Element | null = null;

// Check if an element should be ignored for highlighting
function isIgnoredElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'html' || 
		element.tagName.toLowerCase() === 'body' || 
		element.classList.contains('obsidian-highlighter-menu') ||
		element.closest('.obsidian-highlighter-menu') !== null;
}

// Handles mouse move events for hover effects
export function handleMouseMove(event: MouseEvent | TouchEvent) {
	let target: Element;
	if (event instanceof MouseEvent) {
		target = event.target as Element;
	} else {
		// Touch event
		const touch = event.changedTouches[0];
		target = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	if (!isIgnoredElement(target)) {
		createOrUpdateHoverOverlay(target);
	} else {
		removeHoverOverlay();
	}
}

// Handle mouse up events for highlighting
export function handleMouseUp(event: MouseEvent | TouchEvent) {
	let target: Element;
	if (event instanceof MouseEvent) {
		target = event.target as Element;
	} else {
		// Touch event
		if (isTouchMoved) {
			isTouchMoved = false;
			return; // Don't highlight if the touch moved (scrolling)
		}
		const touch = event.changedTouches[0];
		target = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		handleTextSelection(selection);
	} else {
		if (target.classList.contains('obsidian-highlight-overlay')) {
			handleHighlightClick(event);
		} else if (!isIgnoredElement(target)) {
			highlightElement(target);
		}
	}
}

// Add touch start handler
export function handleTouchStart(event: TouchEvent) {
	const touch = event.touches[0];
	touchStartX = touch.clientX;
	touchStartY = touch.clientY;
	isTouchMoved = false;
}

// Add touch move handler
export function handleTouchMove(event: TouchEvent) {
	const touch = event.touches[0];
	const moveThreshold = 10; // pixels

	if (Math.abs(touch.clientX - touchStartX) > moveThreshold ||
		Math.abs(touch.clientY - touchStartY) > moveThreshold) {
		isTouchMoved = true;
	}

	handleMouseMove(event);
}

// Update event listeners for highlight overlays
export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight-overlay').forEach(highlight => {
		highlight.removeEventListener('click', handleHighlightClick);
		highlight.removeEventListener('touchend', handleHighlightClick);
		highlight.addEventListener('click', handleHighlightClick);
		highlight.addEventListener('touchend', handleHighlightClick);
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
			// Ensure offset is within bounds of the node
			const adjustedOffset = Math.min(Math.max(0, offset - currentOffset), nodeLength);
			return { node, offset: adjustedOffset };
		}
		currentOffset += nodeLength;
		node = treeWalker.nextNode();
	}
	
	// If we couldn't find the exact offset, return the first text node with offset 0
	const firstNode = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).firstChild();
	if (firstNode) {
		return { node: firstNode, offset: 0 };
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
	const existingOverlays = Array.from(document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`));
	if (highlight.type === 'complex' || highlight.type === 'element') {
		const rect = target.getBoundingClientRect();
		mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
	} else if (highlight.type === 'text') {
		try {
			const range = document.createRange();
			const startNode = findTextNodeAtOffset(target, highlight.startOffset);
			const endNode = findTextNodeAtOffset(target, highlight.endOffset);
			
			if (startNode && endNode) {
				try {
					// Try to set start position
					try {
						range.setStart(startNode.node, startNode.offset);
					} catch {
						// Fallback to node start
						range.setStart(startNode.node, 0);
					}
					
					// Try to set end position
					try {
						range.setEnd(endNode.node, endNode.offset);
					} catch {
						// Fallback to node end
						range.setEnd(endNode.node, endNode.node.textContent?.length || 0);
					}
					
					const rects = range.getClientRects();
					
					if (rects.length === 0) {
						const rect = target.getBoundingClientRect();
						mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
						return;
					}
					
					const averageLineHeight = calculateAverageLineHeight(rects);
					const textRects = Array.from(rects).filter(rect => rect.height <= averageLineHeight * 1.5);
					const complexRects = Array.from(rects).filter(rect => rect.height > averageLineHeight * 1.5);
					
					if (textRects.length > 0) {
						mergeHighlightOverlayRects(textRects, highlight.content, existingOverlays, true, index, highlight.notes);
					}
					if (complexRects.length > 0) {
						mergeHighlightOverlayRects(complexRects, highlight.content, existingOverlays, false, index, highlight.notes);
					}
				} catch (error) {
					// Fallback to element highlight
					const rect = target.getBoundingClientRect();
					mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
				}
			} else {
				// Fallback to element highlight
				const rect = target.getBoundingClientRect();
				mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
			}
		} catch (error) {
			console.error('Error creating text highlight:', error);
			const rect = target.getBoundingClientRect();
			mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
		}
	}
}

// Merge a set of rectangles, to avoid adjacent and overlapping highlights where possible
function mergeHighlightOverlayRects(rects: DOMRect[], content: string, existingOverlays: Element[], isText: boolean = false, index: number, notes?: string[]) {
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
			createHighlightOverlayElement(rect, content, isText, index, notes);
		}
	}
}

// Create an overlay element
function createHighlightOverlayElement(rect: DOMRect, content: string, isText: boolean = false, index: number, notes?: string[]) {
	const overlay = document.createElement('div');
	overlay.className = 'obsidian-highlight-overlay';
	overlay.dataset.highlightIndex = index.toString();
	
	overlay.style.position = 'absolute';

	overlay.style.left = `${rect.left + window.scrollX - 2}px`;
	overlay.style.top = `${rect.top + window.scrollY - 2}px`;
	overlay.style.width = `${rect.width + 4}px`;
	overlay.style.height = `${rect.height + 4}px`;
	
	overlay.setAttribute('data-content', content);
	if (notes && notes.length > 0) {
		overlay.setAttribute('data-notes', JSON.stringify(notes));
	}
	
	// Get the background color of the element under the highlight
	const elementAtPoint = document.elementFromPoint(rect.left, rect.top);
	if (elementAtPoint) {
		const bgColor = getEffectiveBackgroundColor(elementAtPoint as HTMLElement);
		if (isDarkColor(bgColor)) {
			overlay.classList.add('obsidian-highlight-overlay-dark');
		}
	}
	
	overlay.addEventListener('click', handleHighlightClick);
	overlay.addEventListener('touchend', handleHighlightClick);
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
			const existingOverlays = document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`);
			if (existingOverlays.length > 0) {
				removeExistingHighlightOverlays(index);
			}
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
			(mutation.type === 'childList' && 
			 (mutation.target instanceof Element) && 
			 !mutation.target.id.startsWith('obsidian-highlight')) || 
			(mutation.type === 'attributes' && 
			 (mutation.attributeName === 'style' || mutation.attributeName === 'class') &&
			 (mutation.target instanceof Element) &&
			 !mutation.target.id.startsWith('obsidian-highlight'))
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
	// Only update if the target has changed
	if (target === lastHoverTarget) return;
	lastHoverTarget = target;

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

	// Remove 'is-hovering' class from all highlight overlays
	document.querySelectorAll('.obsidian-highlight-overlay.is-hovering').forEach(el => {
		el.classList.remove('is-hovering');
	});

	// Remove 'on-highlight' class from hover overlay
	hoverOverlay.classList.remove('on-highlight');

	// Check if the target is a highlight overlay
	if (target.classList.contains('obsidian-highlight-overlay')) {
		const index = target.getAttribute('data-highlight-index');
		if (index) {
			// Add 'is-hovering' class to all highlight overlays with the same index
			document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => {
				el.classList.add('is-hovering');
			});
			// Add 'on-highlight' class to hover overlay
			hoverOverlay.classList.add('on-highlight');
		}
	}
}

// Modify the removeHoverOverlay function to also remove the 'is-hovering' class
export function removeHoverOverlay() {
	if (hoverOverlay) {
		hoverOverlay.style.display = 'none';
	}
	lastHoverTarget = null;

	// Remove 'is-hovering' class from all highlight overlays
	document.querySelectorAll('.obsidian-highlight-overlay.is-hovering').forEach(el => {
		el.classList.remove('is-hovering');
	});
}

// Update the type of handleHighlightClick
async function handleHighlightClick(event: Event) {
	event.stopPropagation();
	event.preventDefault(); // Prevent default touch behavior
	const overlay = event.currentTarget as HTMLElement;
	
	try {
		if (!overlay || !overlay.dataset) {
			return;
		}

		const index = overlay.dataset.highlightIndex;
		if (index === undefined) {
			console.warn('No highlight index found on clicked element');
			return;
		}

		const highlightIndex = parseInt(index);
		if (isNaN(highlightIndex) || highlightIndex < 0 || highlightIndex >= highlights.length) {
			console.warn(`Invalid highlight index: ${index}`);
			return;
		}

		const highlightToRemove = highlights[highlightIndex];
		const newHighlights = highlights.filter((h: AnyHighlightData) => h.id !== highlightToRemove.id);
		updateHighlights(newHighlights);
		removeExistingHighlightOverlays(highlightIndex);
		sortHighlights();
		applyHighlights();
		saveHighlights();
		updateHighlighterMenu();
	} catch (error) {
		console.error('Error handling highlight click:', error);
	}
}

// Remove all existing highlight overlays from the page
export function removeExistingHighlights() {
	const existingHighlights = document.querySelectorAll('.obsidian-highlight-overlay');
	console.log('existingHighlights', existingHighlights.length);
	if (existingHighlights.length > 0) {
		existingHighlights.forEach(el => el.remove());
	}
}