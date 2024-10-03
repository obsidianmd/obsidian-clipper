import browser from './browser-polyfill';
import { debounce } from './debounce';

let isHighlighterMode = false;
let highlights: string[] = [];

export function toggleHighlighter(isActive: boolean) {
	isHighlighterMode = isActive;
	document.body.classList.toggle('obsidian-highlighter-active', isHighlighterMode);
	if (isHighlighterMode) {
		document.addEventListener('mouseup', debouncedHandleHighlight);
	} else {
		document.removeEventListener('mouseup', debouncedHandleHighlight);
	}
	updateHighlightListeners();
}

export function updateHighlightListeners() {
	document.querySelectorAll('.obsidian-highlight').forEach(highlight => {
		highlight.removeEventListener('click', showRemoveTooltip);
		if (isHighlighterMode) {
			highlight.addEventListener('click', showRemoveTooltip);
		}
	});
}

export function handleHighlight() {
	const selection = window.getSelection();
	if (selection && !selection.isCollapsed) {
		const range = selection.getRangeAt(0);
		const newHighlight = document.createElement('span');
		newHighlight.className = 'obsidian-highlight';
		newHighlight.dataset.highlightId = Date.now().toString();

		try {
			range.surroundContents(newHighlight);
			if (isHighlighterMode) {
				newHighlight.addEventListener('click', showRemoveTooltip);
			}

			// Insert the new highlight in the correct position
			insertHighlightInOrder(newHighlight);

			saveHighlights();
		} catch (error) {
			console.error('Error creating highlight:', error);
		}

		selection.removeAllRanges();
	}
}

function insertHighlightInOrder(newHighlight: HTMLElement) {
	const highlightElements = Array.from(document.querySelectorAll('.obsidian-highlight'));
	let insertIndex = highlightElements.findIndex(el => {
		return (el.compareDocumentPosition(newHighlight) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
	});

	if (insertIndex === -1) {
		insertIndex = highlightElements.length;
	}

	highlights.splice(insertIndex, 0, newHighlight.outerHTML);
}

export function saveHighlights() {
	const url = window.location.href;
	const data = { highlights: getHighlights(), url };
	browser.storage.local.set({ [url]: data });
}

export function applyHighlights() {
	const container = document.createElement('div');
	container.innerHTML = highlights.join('');
	document.body.appendChild(container);
	updateHighlightListeners();
}

export function clearHighlights() {
	const url = window.location.href;
	browser.storage.local.remove(url).then(() => {
		highlights = [];
		document.querySelectorAll('.obsidian-highlight').forEach(el => {
			el.outerHTML = el.innerHTML;
		});
		console.log('Highlights cleared for:', url);
	});
}

function showRemoveTooltip(event: Event) {
	event.stopPropagation();
	const highlight = event.currentTarget as HTMLElement;

	document.querySelectorAll('.obsidian-highlight-tooltip').forEach(el => el.remove());

	const tooltip = document.createElement('div');
	tooltip.className = 'obsidian-highlight-tooltip';
	tooltip.textContent = 'Remove highlight';
	tooltip.addEventListener('click', () => removeHighlight(highlight));

	const rect = highlight.getBoundingClientRect();
	tooltip.style.top = `${rect.bottom + window.scrollY}px`;
	tooltip.style.left = `${rect.left + window.scrollX}px`;

	document.body.appendChild(tooltip);
	document.addEventListener('click', closeTooltip);
}

function closeTooltip() {
	document.querySelectorAll('.obsidian-highlight-tooltip').forEach(el => el.remove());
	document.removeEventListener('click', closeTooltip);
}

function removeHighlight(highlight: HTMLElement) {
	highlight.outerHTML = highlight.innerHTML;
	highlights = highlights.filter(h => !h.includes(highlight.dataset.highlightId!));
	saveHighlights();
	closeTooltip();
}

export function getHighlights(): string[] {
	return highlights;
}

const debouncedHandleHighlight = debounce(handleHighlight, 100);