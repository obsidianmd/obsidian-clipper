import { 
	handleTextSelection, 
	AnyHighlightData, 
	ElementHighlightData,
	highlights, 
	isApplyingHighlights,
	sortHighlights,
	applyHighlights,
	saveHighlights,
	updateHighlights,
	updateHighlighterMenu,
	FragmentHighlightData,
	notifyHighlightsUpdated,
	handleElementHighlight,
	handleBlockElementAsFragmentHighlight,
	simpleHash
} from './highlighter';
import { throttle } from './throttle';
import { getElementByXPath, isDarkColor } from './dom-utils';

let hoverOverlay: HTMLElement | null = null;
let touchStartX: number = 0;
let touchStartY: number = 0;
let isTouchMoved: boolean = false;
let lastHoverTarget: Element | null = null;

// Define highlightable block element tag names (Adding OL, UL)
const HIGHLIGHTABLE_BLOCK_TAGS = new Set(['P', 'TABLE', 'PRE', 'OL', 'UL']);

// Define disallowed structural container tags
const NON_HIGHLIGHTABLE_CONTAINER_TAGS = new Set(['ARTICLE', 'SECTION', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE']);

// Create a selector string from the highlightable tags for closest()
const HIGHLIGHTABLE_BLOCK_SELECTOR = Array.from(HIGHLIGHTABLE_BLOCK_TAGS).map(tag => tag.toLowerCase()).join(', ');

// Check if an element should be ignored for highlighting
function isIgnoredElement(element: Element): boolean {
	return element.tagName.toLowerCase() === 'html' || 
		element.tagName.toLowerCase() === 'body' || 
		element.classList.contains('obsidian-highlighter-menu') ||
		element.closest('.obsidian-highlighter-menu') !== null ||
		element.id === 'obsidian-highlight-hover-overlay'; // Ignore the hover overlay itself
}

// Check if an element is a highlightable block element
function isHighlightableBlockElement(element: Element): boolean {
	if (isIgnoredElement(element)) return false;

	// Explicitly disallow large structural containers
	if (NON_HIGHLIGHTABLE_CONTAINER_TAGS.has(element.tagName)) {
		return false;
	}

	// Check if it's one of the allowed content block tags
	return HIGHLIGHTABLE_BLOCK_TAGS.has(element.tagName);
}

// Handles mouse move events for hover effects
export function handleMouseMove(event: MouseEvent | TouchEvent) {
	// Don't show hover effects if not in highlighter mode
	if (!document.body.classList.contains('obsidian-highlighter-active')) {
		removeHoverOverlay();
		return;
	}

	let initialTarget: Element;
	if (event instanceof MouseEvent) {
		initialTarget = event.target as Element;
	} else {
		// Touch event
		const touch = event.changedTouches[0];
		initialTarget = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	let hoverTarget: Element | null = null;

	if (initialTarget) {
		// Case 1: Target is an existing highlight overlay
		if (initialTarget.classList.contains('obsidian-highlight-overlay')) {
			hoverTarget = initialTarget;
		} 
		// Case 2: Target is directly a highlightable block
		else if (isHighlightableBlockElement(initialTarget)) {
			hoverTarget = initialTarget;
		} 
		// Case 3: Target is INSIDE a highlightable block
		else {
			hoverTarget = initialTarget.closest(HIGHLIGHTABLE_BLOCK_SELECTOR);
			// Ensure the found parent isn't ignored (e.g., body)
			if (hoverTarget && isIgnoredElement(hoverTarget)) {
				hoverTarget = null;
			}
		}
	}

	// Apply or remove hover overlay based on the final hoverTarget
	if (hoverTarget) {
		createOrUpdateHoverOverlay(hoverTarget);
	} else {
		removeHoverOverlay();
	}
}

// Handle mouse up events for highlighting
export function handleMouseUp(event: MouseEvent | TouchEvent) {
	let initialTarget: Element;
	if (event instanceof MouseEvent) {
		initialTarget = event.target as Element;
	} else {
		// Touch event
		if (isTouchMoved) {
			isTouchMoved = false;
			return; // Don't highlight if the touch moved (scrolling)
		}
		const touch = event.changedTouches[0];
		initialTarget = document.elementFromPoint(touch.clientX, touch.clientY) as Element;
	}

	if (!initialTarget) return; // Exit if no target found

	// Determine the actual element to potentially highlight (direct target or closest highlightable parent)
	let highlightTarget: Element | null = null;
	if (isHighlightableBlockElement(initialTarget)) {
		highlightTarget = initialTarget;
	} else if (!initialTarget.classList.contains('obsidian-highlight-overlay')) {
		// If not directly highlightable and not an overlay, check closest highlightable ancestor
		highlightTarget = initialTarget.closest(HIGHLIGHTABLE_BLOCK_SELECTOR);
		// Ensure the found parent isn't ignored
		if (highlightTarget && isIgnoredElement(highlightTarget)) {
			highlightTarget = null;
		}
	}

	console.log(`[Highlighter] MouseUp: initialTarget=<${initialTarget?.tagName}>, highlightTarget=<${highlightTarget?.tagName}>`);

	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		console.log(`[Highlighter] Handling text selection.`);
		handleTextSelection(selection);
	} else if (initialTarget.classList.contains('obsidian-highlight-overlay')) {
		console.log(`[Highlighter] Handling click on existing overlay.`);
		handleHighlightClick(event); // Use initialTarget here as it IS the overlay
	} else if (highlightTarget) { // Check the determined highlightTarget
		// Differentiate based on tag type of the highlightTarget
		const tagName = highlightTarget.tagName;
		console.log(`[Highlighter] Handling click on highlightable block: <${tagName}>`, highlightTarget);
		if (tagName === 'P') { 
			console.log(`[Highlighter] Calling handleBlockElementAsFragmentHighlight for <P>`);
			handleBlockElementAsFragmentHighlight(highlightTarget);
		} else if (tagName === 'TABLE' || tagName === 'PRE' || tagName === 'OL' || tagName === 'UL') {
			console.log(`[Highlighter] Calling handleElementHighlight for <${tagName}>`);
			handleElementHighlight(highlightTarget);
		} else {
			// Optional: Handle other unexpected highlightable block types if necessary
			console.warn(`[Highlighter] Unhandled highlightable block type clicked: <${tagName}>. Defaulting to Element Highlight.`);
			handleElementHighlight(highlightTarget);
		}
	} else {
		console.log(`[Highlighter] Click did not target a highlightable element, overlay, or text selection.`);
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

// Enhanced text normalization function with more comprehensive handling
export function normalizeText(text: string, preserveSpaces: boolean = false): string {
	// First normalize quotes and special characters
	let normalized = text
		.replace(/[\u2018\u2019\u201B]/g, "'") // Smart single quotes and reversed
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"') // Smart double quotes and reversed
		.replace(/[\u2026]/g, '...') // Ellipsis
		.replace(/[\u2013\u2014\u2015]/g, '-') // Em dash, en dash, horizontal bar
		.replace(/[\u2017\u2500-\u2587]/g, '-') // Various dashes and lines
		.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // Various space characters
		.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, ''); // Zero-width spaces and directional marks

	// Normalize punctuation while preserving spaces
	normalized = normalized
		.replace(/\s*([.,;:!?])\s*/g, '$1 ')
		.replace(/\s+/g, ' ');

	// For non-space-preserving mode, collapse all whitespace
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

// Helper function to find an element in Reader Mode using context
function findElementInReaderByContext(searchContainer: Element, highlight: ElementHighlightData): Element | null {
	if (!highlight.readerContextText) return null;

	// 1. Find the context text within the reader container
	const contextRangeResult = findTextInCleanContent(searchContainer, highlight.readerContextText);
	if (!contextRangeResult) {
		// console.warn(`Reader context not found for ${highlight.tagName}:`, highlight.readerContextText);
		return null;
	}

	// 2. Search near the found context range for the target element type
	const contextRange = contextRangeResult.range;
	let searchStartNode = contextRange.startContainer;
	let searchEndNode = contextRange.endContainer;

	// Expand search area slightly (e.g., to parent elements)
	const commonAncestor = contextRange.commonAncestorContainer;
	const searchRoot = commonAncestor.parentElement || searchContainer; // Search within parent or container

	// Look forwards from context end
	let currentNode: Node | null = searchEndNode;
	while (currentNode && searchRoot.contains(currentNode)) {
		if (currentNode.nodeType === Node.ELEMENT_NODE && (currentNode as Element).tagName === highlight.tagName) {
			// Basic check: Does it match the tag name?
			// More specific checks could be added here (e.g., matching src for IMG)
			return currentNode as Element;
		}
		// Traverse sibling/parent up
		currentNode = currentNode.nextSibling ? currentNode.nextSibling : currentNode.parentElement?.nextSibling || null;
	}

	// Look backwards from context start
	currentNode = searchStartNode;
	while (currentNode && searchRoot.contains(currentNode)) {
		if (currentNode.nodeType === Node.ELEMENT_NODE && (currentNode as Element).tagName === highlight.tagName) {
			return currentNode as Element;
		}
		// Traverse previous sibling/parent up
		currentNode = currentNode.previousSibling ? currentNode.previousSibling : currentNode.parentElement?.previousSibling || null;
	}

	// Final check: Search direct children of the common ancestor's parent
	const candidates = Array.from(searchRoot.querySelectorAll(highlight.tagName));
	for (const candidate of candidates) {
		// Crude proximity check: Is it visually close to the context range?
		const candRect = candidate.getBoundingClientRect();
		const contextRect = contextRange.getBoundingClientRect();
		if (Math.abs(candRect.top - contextRect.top) < window.innerHeight / 2) { // Within half viewport height
			return candidate;
		}
	}

	// console.warn(`Element ${highlight.tagName} not found near reader context:`, highlight.readerContextText);
	return null;
}

// Helper function to find a table by content hash
function findTableByHash(container: Element, highlight: ElementHighlightData): HTMLTableElement | null {
	if (!highlight.contentHash || highlight.tagName !== 'TABLE') return null;

	const tables = Array.from(container.querySelectorAll<HTMLTableElement>('table'));
	for (const table of tables) {
		const normalizedTableText = normalizeText(table.textContent || '');
		const currentHash = simpleHash(normalizedTableText);
		if (currentHash === highlight.contentHash) {
			return table; // Found match
		}
	}
	return null; // Not found
}

// Helper function to find an element by content hash (generalizes findTableByHash)
function findElementByHash(container: Element, highlight: ElementHighlightData): Element | null {
	if (!highlight.contentHash || !highlight.tagName) return null;

	const elements = Array.from(container.querySelectorAll<Element>(highlight.tagName.toLowerCase()));
	for (const element of elements) {
		// Ensure the found element has the correct tag name (case-insensitive check)
		if (element.tagName === highlight.tagName) { 
			const normalizedElementText = normalizeText(element.textContent || '');
			const currentHash = simpleHash(normalizedElementText);
			if (currentHash === highlight.contentHash) {
				return element; // Found match
			}
		}
	}
	return null; // Not found
}

// Helper function to find an element between prefix/suffix context
function findElementByContext(container: Element, highlight: ElementHighlightData): Element | null {
	if (!highlight.contextPrefix && !highlight.contextSuffix) return null;

	// Find prefix range
	const prefixResult = highlight.contextPrefix ? findTextInCleanContent(container, highlight.contextPrefix) : null;
	// Find suffix range
	const suffixResult = highlight.contextSuffix ? findTextInCleanContent(container, highlight.contextSuffix, highlight.contextPrefix) : null; // Use prefix as context for suffix

	let searchStartNode: Node | null = prefixResult ? prefixResult.range.endContainer : null;
	let searchEndNode: Node | null = suffixResult ? suffixResult.range.startContainer : null;

	// If only one context found, use that as the anchor
	if (!searchStartNode && suffixResult) searchStartNode = suffixResult.range.startContainer;
	if (!searchEndNode && prefixResult) searchEndNode = prefixResult.range.endContainer;
	if (!searchStartNode || !searchEndNode) return null; // Need at least one anchor

	// Define the search boundary (common ancestor or container)
	const range = document.createRange();
	try {
		range.setStart(searchStartNode, 0); // Offset doesn't matter here
		range.setEnd(searchEndNode, 0);   // Offset doesn't matter here
	} catch (e) {
		console.warn("Error setting range for context search", e);
		return null; // Cannot establish search range
	}
	const searchRoot = range.commonAncestorContainer;

	if (!(searchRoot instanceof Element)) return null; // Should be an element

	// Look for the element with the correct tag name within the search root
	const candidates = Array.from(searchRoot.querySelectorAll(highlight.tagName));
	for (const candidate of candidates) {
		// Check if candidate is between prefix and suffix (if both exist)
		const candidateRange = document.createRange();
		candidateRange.selectNode(candidate);

		const isAfterPrefix = !prefixResult || prefixResult.range.compareBoundaryPoints(Range.END_TO_START, candidateRange) <= 0;
		const isBeforeSuffix = !suffixResult || suffixResult.range.compareBoundaryPoints(Range.START_TO_END, candidateRange) >= 0;

		if (isAfterPrefix && isBeforeSuffix) {
			// More specific checks?
			if (highlight.tagName === 'TABLE') {
				if (findTableByHash(candidate.parentElement || container, highlight) === candidate) return candidate;
			} else {
				// For other element types, position might be enough
				return candidate;
			}
		}
	}

	return null; // Not found between context markers
}

// Update planHighlightOverlayRects to handle new element finding logic
export function planHighlightOverlayRects(searchContainer: Element, target: Element, highlight: AnyHighlightData, index: number) {
	const existingOverlays = Array.from(document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`));
	const isInReader = document.documentElement.classList.contains('obsidian-reader-active');

	if (highlight.type === 'fragment') {
		try {
			const result = findTextInCleanContent(
				searchContainer,
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
	} else if (highlight.type === 'element' || highlight.type === 'complex') {
		// Handle Element and Complex highlights
		try {
			let finalTargetElement: Element | null = null;
			const isElementHighlight = highlight.type === 'element'; // Type guard check

			if (!isInReader) {
				// --- Standard View --- 
				// Priority: XPath -> Content Match
				finalTargetElement = getElementByXPath(highlight.xpath);

				if (!finalTargetElement && isElementHighlight) {
					// Use generic hash finder for standard view fallback
					finalTargetElement = findElementByHash(document.body, highlight);
				}

			} else {
				// --- Reader View ---
				// Priority: Content Match -> Context Match -> XPath -> Old Context
				if (isElementHighlight) {
					// 1. Content-specific match (Hash for TABLE, OL, UL, PRE)
					finalTargetElement = findElementByHash(searchContainer, highlight);

					// 2. Prefix/Suffix Context Match (Fallback if hash fails or isn't present)
					if (!finalTargetElement && (highlight.contextPrefix || highlight.contextSuffix)) {
						finalTargetElement = findElementByContext(searchContainer, highlight);
					}
				}

				// 3. XPath Match (within reader container)
				if (!finalTargetElement) {
					const elementByXpath = getElementByXPath(highlight.xpath);
					if (elementByXpath && searchContainer.contains(elementByXpath)) {
						finalTargetElement = elementByXpath;
					}
				}

				// 4. Old readerContextText Fallback (if it exists and others failed)
				if (!finalTargetElement && isElementHighlight && highlight.readerContextText) {
					console.log("Attempting old context fallback for:", highlight.tagName, highlight.xpath);
					finalTargetElement = findElementInReaderByContext(searchContainer, highlight);
				}
			}

			// Draw overlay if found
			if (finalTargetElement) {
				const rect = finalTargetElement.getBoundingClientRect();
				// Use highlight.content (src for IMG, outerHTML for TABLE) for the overlay data
				mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
			} else {
				// Add type check for accessing tagName in warning
				const tagName = highlight.type === 'element' ? highlight.tagName : 'N/A';
				console.warn(`Element highlight ${highlight.type} (XPath: ${highlight.xpath}, Tag: ${tagName}) could not be located in ${isInReader ? 'Reader' : 'Standard'} Mode.`);
			}
		} catch (error) {
			console.error(`Error creating ${highlight.type} highlight overlay:`, error);
		}
	} else if (highlight.type === 'text') {
		// Handle legacy text highlight type (should ideally be migrated)
		try {
			const finalTargetElement = getElementByXPath(highlight.xpath); // Search globally
			if (finalTargetElement) {
				const rect = finalTargetElement.getBoundingClientRect();
				mergeHighlightOverlayRects([rect], highlight.content, existingOverlays, false, index, highlight.notes);
			} else {
				console.warn(`Legacy text highlight element not found for XPath: ${highlight.xpath}`);
			}
		} catch (error) {
			console.error('Error creating legacy text highlight overlay:', error);
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

// Custom encode function for text fragments
const encodeForTextFragment = (str: string) => {
	return encodeURIComponent(str)
		.replace(/-/g, '%2D') // Ensure hyphens are always encoded
		.replace(/'/g, '%27') // Ensure single quotes are encoded
		.replace(/"/g, '%22') // Ensure double quotes are encoded
		.replace(/\(/g, '%28') // Ensure parentheses are encoded
		.replace(/\)/g, '%29')
		.replace(/\!/g, '%21')
		.replace(/~/g, '%7E')
		.replace(/\*/g, '%2A')
		.replace(/\./g, '%2E')
		.replace(/'/g, '%E2%80%99') // Smart single quote
		.replace(/'/g, '%E2%80%99') // Another smart single quote variant
		.replace(/"/g, '%E2%80%9C') // Smart double quote opening
		.replace(/"/g, '%E2%80%9D'); // Smart double quote closing
};

// Helper function to generate the text fragment string part for a highlight
export function generateTextFragmentString(highlight: FragmentHighlightData): string {
	const cleanText = decodeURIComponent(highlight.textStart).trim().replace(/\s+/g, ' ');
	const encodedText = encodeForTextFragment(cleanText);
	const prefix = highlight.prefix ? decodeURIComponent(highlight.prefix) : undefined;
	const suffix = highlight.suffix ? decodeURIComponent(highlight.suffix) : undefined;
	const encodedPrefix = prefix ? encodeForTextFragment(prefix.trim()) : '';
	const encodedSuffix = suffix ? encodeForTextFragment(suffix.trim()) : '';

	// Build the text fragment part (without #:~:)
	let fragmentPart = `text=${encodedText}`;
	if (encodedPrefix) fragmentPart = `text=${encodedPrefix}-,${encodedText}`;
	if (encodedSuffix) fragmentPart += `,${encodedSuffix}`;

	return fragmentPart;
}

function createTextFragmentURL(textStart: string, prefix?: string, suffix?: string): string {
	// Generate fragment string using the helper
	const fragmentPart = generateTextFragmentString({
		type: 'fragment',
		textStart: textStart,
		prefix: prefix ? encodeURIComponent(prefix) : undefined,
		suffix: suffix ? encodeURIComponent(suffix) : undefined,
		// Dummy values for other required fields
		id: '',
		xpath: '',
		content: '' 
	});
	const fragment = `:~:${fragmentPart}`;

	// Create the full URL
	const baseUrl = window.location.href.split('#')[0];
	return `${baseUrl}#${fragment}`;
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

	const copyButton = document.createElement('button');
	copyButton.className = 'copy-url-button';
	copyButton.innerHTML = `
		<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
			<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
		</svg>
		Copy link
	`;
	
	copyButton.addEventListener('click', async (e) => {
		e.stopPropagation();
		e.preventDefault();
		
		try {
			const highlight = highlights[index];
			if (highlight && highlight.type === 'fragment') {
				const url = createTextFragmentURL(
					decodeURIComponent(highlight.textStart),
					highlight.prefix ? decodeURIComponent(highlight.prefix) : undefined,
					highlight.suffix ? decodeURIComponent(highlight.suffix) : undefined
				);
				
				await navigator.clipboard.writeText(url);
				
				// Show success state
				copyButton.classList.add('copied');
				copyButton.innerHTML = `
					<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 6L9 17l-5-5"/>
					</svg>
					Copied!
				`;
				
				// Reset after 2 seconds
				setTimeout(() => {
					copyButton.classList.remove('copied');
					copyButton.innerHTML = `
						<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
							<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
						</svg>
						Copy link
					`;
				}, 2000);
			}
		} catch (error) {
			console.error('Error copying URL:', error);
		}
	});
	
	overlay.appendChild(copyButton);
	
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
	// Determine the current container (reader or body)
	const isInReader = document.documentElement.classList.contains('obsidian-reader-active');
	let searchContainer: Element;
	if (isInReader) {
		searchContainer = document.querySelector('.obsidian-reader-content article') || document.body;
	} else {
		searchContainer = document.body;
	}

	if (!searchContainer) {
		console.warn('Could not find container for updating highlight positions');
		return;
	}

	highlights.forEach((highlight, index) => {
		// Remove old overlays for this index first
		removeExistingHighlightOverlays(index); 
		
		// Let planHighlightOverlayRects handle finding the actual element
		// For fragments and elements/complex, we pass the appropriate container
		// planHighlightOverlayRects will use XPath or fallbacks as needed.
		let initialTargetForPlanning: Element = searchContainer;

		// In standard mode, for element highlights, we can sometimes optimize by passing the 
		// directly found element IF it exists, but primarily rely on planHighlightOverlayRects
		if (!isInReader && (highlight.type === 'element' || highlight.type === 'complex')) {
			const element = getElementByXPath(highlight.xpath);
			if (element) {
				initialTargetForPlanning = element;
			} else {
				// If XPath fails even in standard view, still let planHighlightOverlayRects try fallbacks
				initialTargetForPlanning = searchContainer; 
			}
		}
		// In Reader mode, or for fragments, initial target is always searchContainer

		try {
			planHighlightOverlayRects(searchContainer, initialTargetForPlanning, highlight, index); 
		} catch (error) {
			console.error("[updateHighlightOverlayPositions] Error planning overlay:", error, highlight);
		}
	});
}

// Remove existing highlight overlays for a specific index
function removeExistingHighlightOverlays(index: number) {
	document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => el.remove());
}

export const throttledUpdateHighlights = throttle(() => {
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

	// Conditionally add/remove .on-highlight class
	if (target.classList.contains('obsidian-highlight-overlay')) {
		hoverOverlay.classList.add('on-highlight'); // Hide dashed border when over existing highlight

		// Add 'is-hovering' class to all highlight overlays with the same index
		const index = target.getAttribute('data-highlight-index');
		if (index) {
			document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`).forEach(el => {
				el.classList.add('is-hovering');
			});
		}
	} else {
		hoverOverlay.classList.remove('on-highlight'); // Show dashed border for potential targets
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
		notifyHighlightsUpdated();
	} catch (error) {
		console.error('Error handling highlight click:', error);
	}
}

// Remove all existing highlight overlays from the page
export function removeExistingHighlights() {
	const existingHighlights = document.querySelectorAll('.obsidian-highlight-overlay');
	// console.log('existingHighlights', existingHighlights.length);
	if (existingHighlights.length > 0) {
		existingHighlights.forEach(el => el.remove());
	}
}

function fuzzyMatch(text1: string, text2: string, threshold: number = 0.8): boolean {
	if (text1 === text2) return true;
	
	// Convert to lowercase for case-insensitive comparison
	text1 = text1.toLowerCase();
	text2 = text2.toLowerCase();
	
	// Calculate Levenshtein distance
	const m = text1.length;
	const n = text2.length;
	const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
	
	for (let i = 0; i <= m; i++) dp[i][0] = i;
	for (let j = 0; j <= n; j++) dp[0][j] = j;
	
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] = Math.min(
				dp[i-1][j] + 1,
				dp[i][j-1] + 1,
				dp[i-1][j-1] + (text1[i-1] === text2[j-1] ? 0 : 1)
			);
		}
	}
	
	const maxLength = Math.max(text1.length, text2.length);
	const similarity = 1 - (dp[m][n] / maxLength);
	
	return similarity >= threshold;
}

// Enhanced findTextInCleanContent function with improved context matching
export function findTextInCleanContent(
	container: Element,
	searchText: string, // Expects NORMALIZED text for searching
	prefix?: string,    // Expects ENCODED ORIGINAL prefix
	suffix?: string,    // Expects ENCODED ORIGINAL suffix
	retryCount: number = 0
): { range: Range, cleanText: string } | null {
	const MAX_RETRIES = 2;
	const CONTEXT_SIZES = [20, 40, 60]; // Try different context sizes
	const SIMILARITY_THRESHOLDS = [0.9, 0.8, 0.7]; // Decrease threshold on retries

	// Get text nodes and their content
	const textNodes = getTextNodesIn(container);
	const nodesByParagraph = new Map<Element, Node[]>();

	// Group text nodes by their paragraph
	for (const node of textNodes) {
		// Use closest block-level element as paragraph boundary
		const paragraph = node.parentElement?.closest('p, div, li, blockquote, pre, h1, h2, h3, h4, h5, h6, article, section') || container;
		if (!nodesByParagraph.has(paragraph)) {
			nodesByParagraph.set(paragraph, []);
		}
		nodesByParagraph.get(paragraph)?.push(node);
	}

	const contextSize = CONTEXT_SIZES[Math.min(retryCount, CONTEXT_SIZES.length - 1)];
	const similarityThreshold = SIMILARITY_THRESHOLDS[Math.min(retryCount, SIMILARITY_THRESHOLDS.length - 1)];

	// Try to find the text in each paragraph
	let bestMatch: { range: Range, cleanText: string } | null = null;
	let matchFoundWithoutContext = false;

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
		// searchText is already normalized by the caller (handleTextSelection)
		const normalizedSearchText = searchText;

		let currentIndex = 0;

		while ((currentIndex = normalizedFullText.indexOf(normalizedSearchText, currentIndex)) !== -1) {
			let currentMatchIsPotential = true;

			// --- Map positions for this potential match --- 
			const startIndex = currentIndex;
			const matchedNormalizedText = normalizedFullText.substring(startIndex, startIndex + normalizedSearchText.length);
			const originalStartIndex = mapNormalizedPositionToOriginal(fullText, normalizedFullText, startIndex);
			const originalEndIndex = mapNormalizedPositionToOriginal(fullText, normalizedFullText, startIndex + normalizedSearchText.length);

			// --- Find corresponding nodes --- 
			let startNodeResult: { node: Node, offset: number } | null = null;
			let endNodeResult: { node: Node, offset: number } | null = null;

			for (const { node, start, end } of nodePositions) {
				if (!startNodeResult && originalStartIndex >= start && originalStartIndex < end) {
					startNodeResult = { node, offset: originalStartIndex - start };
				}
				if (originalEndIndex > start && originalEndIndex <= end) {
					endNodeResult = { node, offset: originalEndIndex - start };
					if (startNodeResult) break; 
				}
			}

			if (endNodeResult && endNodeResult.offset === 0 && (!startNodeResult || startNodeResult.node !== endNodeResult.node)) {
				const endIndex = nodePositions.findIndex(p => p.node === endNodeResult!.node);
				if (endIndex > 0) {
					const prevNodePos = nodePositions[endIndex - 1];
					endNodeResult = { node: prevNodePos.node, offset: prevNodePos.node.textContent?.length || 0 };
				}
			}

			// --- Verify Content of the Range --- 
			if (startNodeResult && endNodeResult) {
				try {
					const range = document.createRange();
					range.setStart(startNodeResult.node, startNodeResult.offset);
					range.setEnd(endNodeResult.node, endNodeResult.offset);

					const rangeText = range.toString();
					const normalizedRangeText = normalizeText(rangeText);

					const contentMatches = fuzzyMatch(normalizedRangeText, normalizedSearchText, similarityThreshold);
					const foundTextMatches = fuzzyMatch(normalizedRangeText, matchedNormalizedText, similarityThreshold);
					const verificationPassed = contentMatches || foundTextMatches;

					if (verificationPassed) {
						// Content matches! Now, optionally check context for disambiguation.
						let contextCheckPassed = !prefix && !suffix; // Pass if no context provided
						if (prefix || suffix) {
							const decodedPrefix = prefix ? normalizeText(decodeURIComponent(prefix)) : '';
							const decodedSuffix = suffix ? normalizeText(decodeURIComponent(suffix)) : '';
							const beforeContext = normalizedFullText.slice(Math.max(0, startIndex - contextSize), startIndex);
							const afterContext = normalizedFullText.slice(startIndex + normalizedSearchText.length, startIndex + normalizedSearchText.length + contextSize);
							
							const prefixEndMatches = !prefix || beforeContext.endsWith(decodedPrefix);
							const prefixFuzzyMatches = !prefix || fuzzyMatch(beforeContext, decodedPrefix, similarityThreshold * 0.8); // Lower threshold for context
							const suffixStartMatches = !suffix || afterContext.startsWith(decodedSuffix);
							const suffixFuzzyMatches = !suffix || fuzzyMatch(afterContext, decodedSuffix, similarityThreshold * 0.8); // Lower threshold for context

							if ((prefixEndMatches || prefixFuzzyMatches) && (suffixStartMatches || suffixFuzzyMatches)) {
								contextCheckPassed = true;
							}
						}

						if (contextCheckPassed) {
							// Both content and (relevant) context match - this is the best possible match.
							return { range, cleanText: fullText }; 
						} else {
							// Content matched, but context didn't strongly match. Store as potential best match.
							if (!bestMatch) { // Only store the first content match if context fails
								bestMatch = { range, cleanText: fullText };
								matchFoundWithoutContext = true;
							}
						}
					} else {
						// Content verification failed for this occurrence
						// console.warn('Skipping occurrence due to content mismatch');
					}
				} catch (error) {
					console.error("Error creating/verifying range:", error, { startNode: startNodeResult?.node, startOffset: startNodeResult?.offset, endNode: endNodeResult?.node, endOffset: endNodeResult?.offset });
				}
			}
			// Move to the next potential starting position in this paragraph
			currentIndex += 1;
		} // End while loop for occurrences within paragraph

		// If a perfect match (content + context) was found in this paragraph, we would have returned already.
		// If we found a content-only match, bestMatch would be set. We keep iterating paragraphs
		// in case a later paragraph yields a perfect content+context match.
		
	} // End paragraph loop

	// After checking all paragraphs:
	// If we found a match where content verified but context didn't strongly match, return it now.
	if (bestMatch && matchFoundWithoutContext) {
		// console.log('✅ Returning best match based on content verification (context mismatch ignored).');
		return bestMatch;
	}

	// Retry logic or final failure
	if (retryCount < MAX_RETRIES) {
		// console.log(`Retry ${retryCount + 1} with larger context and lower threshold`);
		return findTextInCleanContent(container, searchText, prefix, suffix, retryCount + 1);
	}

	// console.log('❌ Exhausted retries. Could not find text matching criteria.');
	return null; // No match found after all retries
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