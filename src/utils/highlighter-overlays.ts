import { 
	handleTextSelection, 
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

	if (target.classList.contains('obsidian-highlight-overlay')) {
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
	} else if (target.classList.contains('obsidian-highlight-overlay')) {
		handleHighlightClick(event);
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

// Get clean text content from an element, preserving only relevant content
export function getCleanTextContent(element: Element): string {
	// Clone the element to avoid modifying the original
	const clone = element.cloneNode(true) as Element;
	
	// Remove script, style, and other non-content elements
	clone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
	
	// Get text content, preserving spaces and line breaks as needed
	return clone.textContent || '';
}

// Helper function to get all visible text nodes in an element
export function getTextNodesIn(node: Node): Node[] {
	const textNodes: Node[] = [];
	const walker = document.createTreeWalker(
		node,
		NodeFilter.SHOW_TEXT,
		{
			acceptNode: (node: Node) => {
				// Skip hidden elements and empty text nodes
				if (node.parentElement) {
					const style = window.getComputedStyle(node.parentElement);
					if (style.display === 'none' || 
						style.visibility === 'hidden' || 
						style.opacity === '0' ||
						!node.textContent?.trim()) {
						return NodeFilter.FILTER_REJECT;
					}
				}
				return NodeFilter.FILTER_ACCEPT;
			}
		}
	);
	
	let currentNode: Node | null;
	while (currentNode = walker.nextNode()) {
		textNodes.push(currentNode);
	}
	
	return textNodes;
}

// Helper function to map position in normalized text back to original text
function mapNormalizedPositionToOriginal(originalText: string, normalizedText: string, normalizedPosition: number): number {
	let originalPos = 0;
	let normalizedPos = 0;
	
	console.log('Mapping position:', {
		normalizedPosition,
		originalTextSample: originalText.slice(Math.max(0, normalizedPosition - 20), 
			Math.min(originalText.length, normalizedPosition + 20)),
		normalizedTextSample: normalizedText.slice(Math.max(0, normalizedPosition - 20), 
			Math.min(normalizedText.length, normalizedPosition + 20))
	});
	
	while (normalizedPos < normalizedPosition && originalPos < originalText.length) {
		// Skip newlines and extra whitespace in original text
		while (originalPos < originalText.length && 
			(/[\n\r\t]/.test(originalText[originalPos]) || 
			(/\s/.test(originalText[originalPos]) && 
			originalPos > 0 && /\s/.test(originalText[originalPos - 1])))) {
			originalPos++;
		}
		
		// Move both positions forward for non-whitespace or single whitespace
		if (originalPos < originalText.length) {
			if (!/\s/.test(originalText[originalPos]) || 
				(originalPos === 0 || !/\s/.test(originalText[originalPos - 1]))) {
				normalizedPos++;
			}
			originalPos++;
		}
	}
	
	// Adjust for trailing position
	while (originalPos < originalText.length && /[\s\n\r\t]/.test(originalText[originalPos])) {
		originalPos++;
	}
	
	return originalPos;
}

// Helper function to normalize text consistently
function normalizeText(text: string, preserveSpaces: boolean = false): string {
	// First normalize quotes and special characters
	let normalized = text
		.replace(/[\u2018\u2019]/g, "'")
		.replace(/[\u201C\u201D]/g, '"')
		.replace(/\u2026/g, '...')
		.replace(/\u2013|\u2014/g, '-')
		// Normalize punctuation while preserving spaces
		.replace(/\s*([.,;:!?])\s*/g, '$1 ')
		// Remove extra spaces around quotes
		.replace(/"\s+/g, '"')
		.replace(/\s+"/g, '"')
		.replace(/'\s+/g, "'")
		.replace(/\s+'/g, "'");
	
	// For non-space-preserving mode, collapse all whitespace to single spaces
	if (!preserveSpaces) {
		normalized = normalized
			.replace(/[\n\r\t]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
	
	return normalized;
}

// Helper function to check if a character is a word boundary
function isWordBoundary(char: string): boolean {
	// Consider whitespace and punctuation as word boundaries
	return /[\s.,!?;:'")\]}\u2018\u2019\u201C\u201D]/g.test(char);
}

// Helper function to check if a character is a sentence boundary
function isSentenceBoundary(char: string): boolean {
	return /[.!?]/g.test(char);
}

// Helper function to find word boundaries
function findWordBoundaries(text: string, startPos: number, endPos: number): { start: number, end: number } {
	let start = startPos;
	let end = endPos;
	
	// If we're starting after a sentence boundary, don't expand backwards
	if (start > 0 && isSentenceBoundary(text[start - 1])) {
		// Keep the start position as is
	} else {
		// Go backwards to find start of word
		while (start > 0 && !isWordBoundary(text[start - 1])) {
			start--;
		}
	}
	
	// If we end with a sentence boundary, don't expand forward
	if (end > 0 && isSentenceBoundary(text[end - 1])) {
		end = end; // Keep the end position as is
	} else {
		// Go forwards to find end of word
		while (end < text.length && !isWordBoundary(text[end])) {
			end++;
		}
	}
	
	return { start, end };
}

// Update planHighlightOverlayRects to use findTextNodeAtPosition
export function planHighlightOverlayRects(target: Element, highlight: AnyHighlightData, index: number) {
	const existingOverlays = Array.from(document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`));
	
	if (highlight.type === 'fragment') {
		try {
			const result = findTextInCleanContent(
				document.body,
				decodeURIComponent(highlight.textStart),
				highlight.prefix,
				highlight.suffix
			);
			
			if (result) {
				const rects = result.range.getClientRects();
				if (rects.length > 0) {
					const averageLineHeight = calculateAverageLineHeight(rects);
					const textRects = Array.from(rects).filter(rect => rect.height <= averageLineHeight * 1.5);
					
					if (textRects.length > 0) {
						mergeHighlightOverlayRects(textRects, highlight.content, existingOverlays, true, index, highlight.notes);
						return;
					}
				}
			}
			
			console.warn('Could not find text match for fragment highlight:', {
				text: decodeURIComponent(highlight.textStart),
				prefix: highlight.prefix ? decodeURIComponent(highlight.prefix) : undefined,
				suffix: highlight.suffix ? decodeURIComponent(highlight.suffix) : undefined
			});
		} catch (error) {
			console.error('Error creating fragment highlight overlay:', error);
		}
	} else if (highlight.type === 'text' || highlight.type === 'complex' || highlight.type === 'element') {
		// Handle legacy highlight types
		try {
			const rect = target.getBoundingClientRect();
			mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
		} catch (error) {
			console.error('Error creating legacy highlight overlay:', error);
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
	hoverOverlay.classList.add('on-highlight');

	// Add 'is-hovering' class to all highlight overlays with the same index
	const index = target.getAttribute('data-highlight-index');
	if (index) {
		document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => {
			el.classList.add('is-hovering');
		});
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

// Find position of text in clean content and map back to DOM
export function findTextInCleanContent(
	container: Element,
	searchText: string,
	prefix?: string,
	suffix?: string
): { range: Range, cleanText: string } | null {
	// Get text nodes and their content
	const textNodes = getTextNodesIn(container);
	const nodesByParagraph = new Map<Element, Node[]>();
	
	// Group text nodes by their paragraph
	for (const node of textNodes) {
		const paragraph = node.parentElement?.closest('p, div, article, section') || container;
		if (!nodesByParagraph.has(paragraph)) {
			nodesByParagraph.set(paragraph, []);
		}
		nodesByParagraph.get(paragraph)?.push(node);
	}
	
	// Try to find the text in each paragraph
	for (const [paragraph, nodes] of nodesByParagraph) {
		let fullText = '';
		const nodePositions: { node: Node, start: number, end: number }[] = [];
		
		// Build text content for this paragraph
		for (const node of nodes) {
			const nodeText = node.textContent || '';
			nodePositions.push({
				node,
				start: fullText.length,
				end: fullText.length + nodeText.length
			});
			fullText += nodeText;
		}
		
		// Skip empty paragraphs
		if (!fullText.trim()) continue;
		
		// Normalize texts
		const normalizedFullText = normalizeText(fullText);
		const normalizedSearchText = normalizeText(searchText);
		
		console.log('Looking for text in paragraph:', {
			paragraphTag: paragraph.tagName,
			searchText: normalizedSearchText,
			prefix: prefix ? normalizeText(decodeURIComponent(prefix)) : undefined,
			suffix: suffix ? normalizeText(decodeURIComponent(suffix)) : undefined,
			textLength: normalizedSearchText.length,
			nodeCount: nodes.length,
			paragraphText: normalizedFullText.slice(0, 100) + '...'
		});
		
		// Find the text position in normalized content
		let startIndex = normalizedFullText.indexOf(normalizedSearchText);
		if (startIndex === -1) continue;
		
		// Verify prefix/suffix if provided
		if (prefix || suffix) {
			const prefixText = prefix ? normalizeText(decodeURIComponent(prefix)) : '';
			const suffixText = suffix ? normalizeText(decodeURIComponent(suffix)) : '';
			const contextSize = Math.max(prefixText.length, suffixText.length) + 20;
			
			const beforeContext = normalizedFullText.slice(Math.max(0, startIndex - contextSize), startIndex);
			const afterContext = normalizedFullText.slice(startIndex + normalizedSearchText.length, 
				startIndex + normalizedSearchText.length + contextSize);
			
			console.log('Checking context:', {
				beforeContext,
				afterContext,
				prefixText,
				suffixText,
				matchStart: startIndex,
				matchEnd: startIndex + normalizedSearchText.length
			});
			
			if (prefix && !beforeContext.includes(prefixText)) {
				console.log('Prefix not found in context, trying next occurrence');
				startIndex = normalizedFullText.indexOf(normalizedSearchText, startIndex + 1);
				if (startIndex === -1) continue;
			}
			if (suffix && !afterContext.includes(suffixText)) {
				console.log('Suffix not found in context, trying next occurrence');
				startIndex = normalizedFullText.indexOf(normalizedSearchText, startIndex + 1);
				if (startIndex === -1) continue;
			}
		}
		
		// Map normalized positions back to original text
		const originalStartIndex = mapNormalizedPositionToOriginal(fullText, normalizedFullText, startIndex);
		const originalEndIndex = mapNormalizedPositionToOriginal(fullText, normalizedFullText, 
			startIndex + normalizedSearchText.length);
		
		console.log('Position mapping:', {
			normalizedStart: startIndex,
			normalizedEnd: startIndex + normalizedSearchText.length,
			originalStart: originalStartIndex,
			originalEnd: originalEndIndex,
			matchedText: fullText.slice(originalStartIndex, originalEndIndex)
		});
		
		// Find nodes containing start and end positions
		let startNode: { node: Node, offset: number } | null = null;
		let endNode: { node: Node, offset: number } | null = null;
		
		for (const { node, start, end } of nodePositions) {
			if (!startNode && start <= originalStartIndex && originalStartIndex <= end) {
				startNode = {
					node,
					offset: originalStartIndex - start
				};
			}
			if (!endNode && start <= originalEndIndex && originalEndIndex <= end) {
				endNode = {
					node,
					offset: originalEndIndex - start
				};
				break;
			}
		}
		
		// Create range if we found both positions in the same paragraph
		if (startNode && endNode) {
			console.log('Creating range:', {
				startNodeText: startNode.node.textContent,
				startOffset: startNode.offset,
				endNodeText: endNode.node.textContent,
				endOffset: endNode.offset,
				paragraph: paragraph.tagName
			});
			
			const range = document.createRange();
			range.setStart(startNode.node, startNode.offset);
			range.setEnd(endNode.node, endNode.offset);
			
			// Verify the range content matches what we expect
			const rangeText = range.toString();
			const normalizedRangeText = normalizeText(rangeText);
			if (normalizedRangeText === normalizedSearchText) {
				console.log('Range content matches expected text');
				return { range, cleanText: fullText };
			} else {
				console.log('Range content mismatch:', {
					expected: normalizedSearchText,
					actual: normalizedRangeText
				});
			}
		}
	}
	
	return null;
}

// Helper function to find a text node and offset from a character position
export function findTextNodeAtPosition(container: Element, position: number): { node: Node, offset: number } | null {
	const textNodes = getTextNodesIn(container);
	let currentPos = 0;
	
	for (const node of textNodes) {
		const nodeText = node.textContent || '';
		const nodeLength = nodeText.length;
		
		if (currentPos + nodeLength > position) {
			return {
				node,
				offset: position - currentPos
			};
		}
		
		currentPos += nodeLength;
	}
	
	return null;
}

// Calculate the average line height of a set of rectangles
function calculateAverageLineHeight(rects: DOMRectList): number {
	const heights = Array.from(rects).map(rect => rect.height);
	const sum = heights.reduce((a, b) => a + b, 0);
	return sum / heights.length;
}