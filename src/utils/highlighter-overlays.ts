import { 
	handleTextSelection, 
	AnyHighlightData, 
	highlights, 
	isApplyingHighlights,
	sortHighlights,
	applyHighlights,
	saveHighlights,
	updateHighlights,
	updateHighlighterMenu,
	FragmentHighlightData,
	notifyHighlightsUpdated
} from './highlighter';
import { throttle } from './throttle';
import { getElementByXPath, isDarkColor } from './dom-utils';

let hoverOverlay: HTMLElement | null = null;
let touchStartX: number = 0;
let touchStartY: number = 0;
let isTouchMoved: boolean = false;
let lastHoverTarget: Element | null = null;

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

// Update planHighlightOverlayRects to use findTextNodeAtPosition
export function planHighlightOverlayRects(searchContainer: Element, target: Element, highlight: AnyHighlightData, index: number) {
	const existingOverlays = Array.from(document.querySelectorAll(`.obsidian-highlight-overlay[data-highlight-index="${index}"]`));
	
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
		// Need to determine the target element based on highlight type
		let targetElement: Element | null = null;
		if (highlight.type === 'fragment') {
			targetElement = searchContainer; // Use the main container as the 'target' for fragments
		} else {
			targetElement = getElementByXPath(highlight.xpath); // Find specific element for legacy types
		}

		if (targetElement) {
			removeExistingHighlightOverlays(index); // Remove old overlays for this index first
			planHighlightOverlayRects(searchContainer, targetElement, highlight, index); // Replan with correct container and target
		} else if (highlight.type !== 'fragment') {
			// Only warn if a specific element (non-fragment) wasn't found
			console.warn(`Element not found for XPath during update: ${highlight.xpath}`);
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
		notifyHighlightsUpdated();
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

		// Find potential matches using the normalized search text
		let startIndex = -1;
		let currentIndex = 0;

		while ((currentIndex = normalizedFullText.indexOf(normalizedSearchText, currentIndex)) !== -1) {
			// Check context if provided
			let contextMatches = true;

			if (prefix || suffix) {
				// Decode the original prefix/suffix provided for comparison
				const decodedPrefix = prefix ? normalizeText(decodeURIComponent(prefix)) : '';
				const decodedSuffix = suffix ? normalizeText(decodeURIComponent(suffix)) : '';

				// Get context from the *normalized* full text around the current match
				const beforeContext = normalizedFullText.slice(
					Math.max(0, currentIndex - contextSize),
					currentIndex
				);
				const afterContext = normalizedFullText.slice(
					currentIndex + normalizedSearchText.length,
					currentIndex + normalizedSearchText.length + contextSize
				);

				// Check prefix match: The end of the `beforeContext` must match the end of the `decodedPrefix`
				if (prefix) {
					const prefixEndMatches = beforeContext.endsWith(decodedPrefix);
					// Fallback: Fuzzy match if exact end doesn't match
					const prefixFuzzyMatches = !prefixEndMatches && fuzzyMatch(beforeContext, decodedPrefix, similarityThreshold);

					if (!prefixEndMatches && !prefixFuzzyMatches) {
						contextMatches = false;
					}
				}

				// Check suffix match: The start of the `afterContext` must match the start of the `decodedSuffix`
				if (suffix && contextMatches) {
					const suffixStartMatches = afterContext.startsWith(decodedSuffix);
					// Fallback: Fuzzy match if exact start doesn't match
					const suffixFuzzyMatches = !suffixStartMatches && fuzzyMatch(afterContext, decodedSuffix, similarityThreshold);

					if (!suffixStartMatches && !suffixFuzzyMatches) {
						contextMatches = false;
					}
				}
			}

			if (contextMatches) {
				startIndex = currentIndex;
				break; // Found the first valid match in this paragraph
			}

			// Move to the next potential starting position
			currentIndex += 1;
		}

		if (startIndex === -1) {
			continue; // Try next paragraph
		}

		// Map normalized positions back to original text
		const originalStartIndex = mapNormalizedPositionToOriginal(fullText, normalizedFullText, startIndex);
		const originalEndIndex = mapNormalizedPositionToOriginal(fullText, normalizedFullText,
			startIndex + normalizedSearchText.length);

		// Find nodes containing start and end positions based on *original* indices
		let startNodeResult: { node: Node, offset: number } | null = null;
		let endNodeResult: { node: Node, offset: number } | null = null;

		for (const { node, start, end } of nodePositions) {
			// Find start node: originalStartIndex must be within [start, end)
			if (!startNodeResult && originalStartIndex >= start && originalStartIndex < end) {
				startNodeResult = {
					node,
					offset: originalStartIndex - start
				};
			}
			// Find end node: originalEndIndex must be within (start, end]
			if (originalEndIndex > start && originalEndIndex <= end) {
				endNodeResult = {
					node,
					offset: originalEndIndex - start
				};
				// If start was also in this node, we found both. If start was earlier, we still need to check subsequent nodes for the end.
				// Optimization: If startNode is found, we only need to look for endNode from that point forward.
				if (startNodeResult) {
					break; // Found end node after or within start node's paragraph segment
				}
			}
		}

		// If end offset is 0 and it's not the start node, it likely means the selection ended exactly at the boundary.
		// Try to place the end position at the end of the previous node.
		if (endNodeResult && endNodeResult.offset === 0 && (!startNodeResult || startNodeResult.node !== endNodeResult.node)) {
			const endIndex = nodePositions.findIndex(p => p.node === endNodeResult!.node);
			if (endIndex > 0) {
				const prevNodePos = nodePositions[endIndex - 1];
				endNodeResult = {
					node: prevNodePos.node,
					offset: prevNodePos.node.textContent?.length || 0
				};
			}
		}

		if (startNodeResult && endNodeResult) {
			try {
				const range = document.createRange();
				range.setStart(startNodeResult.node, startNodeResult.offset);
				range.setEnd(endNodeResult.node, endNodeResult.offset);

				// Verify the range content against the original expected text (more reliable than normalized)
				const rangeText = range.toString();
				const normalizedRangeText = normalizeText(rangeText);

				if (fuzzyMatch(normalizedRangeText, normalizedSearchText, similarityThreshold)) {
					return { range, cleanText: fullText }; // Return the successful match
				} else {
					// Log mismatch details
					console.warn('Range content mismatch after mapping:', {
						expectedNormalized: normalizedSearchText,
						actualNormalized: normalizedRangeText,
						actualOriginal: rangeText,
						similarity: fuzzyMatch(normalizedRangeText, normalizedSearchText, 0)
					});
					// Don't return yet, allow the loop to continue searching in case of multiple occurrences
				}
			} catch (error) {
				console.error("Error creating range:", error, {
					startNode: startNodeResult?.node,
					startOffset: startNodeResult?.offset,
					endNode: endNodeResult?.node,
					endOffset: endNodeResult?.offset
				});
				// Continue searching in other paragraphs
			}
		}
	} // End paragraph loop

	// If no match found and we haven't exceeded max retries, try again with different parameters
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