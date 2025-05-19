import { debugLog } from './debug';

export function createElementWithClass(tagName: string, className: string): HTMLElement {
	const element = document.createElement(tagName);
	element.className = className;
	return element;
}

export function createElementWithHTML(tagName: string, innerHTML: string, attributes: Record<string, string> = {}): HTMLElement {
	const element = document.createElement(tagName);
	element.innerHTML = innerHTML;
	Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
	return element;
}

export function createOption(value: string, text: string): HTMLOptionElement {
	const option = document.createElement('option');
	option.value = value;
	option.textContent = text;
	return option;
}

export function getElementXPath(element: Node): string {
	if (element.nodeType === Node.DOCUMENT_NODE) return '';
	if (element.nodeType !== Node.ELEMENT_NODE) {
		return getElementXPath(element.parentNode!);
	}

	let ix = 0;
	const siblings = element.parentNode?.childNodes || [];
	for (let i = 0; i < siblings.length; i++) {
		const sibling = siblings[i];
		if (sibling === element) {
			return getElementXPath(element.parentNode!) + '/' + (element as Element).tagName.toLowerCase() + '[' + (ix + 1) + ']';
		}
		if (sibling.nodeType === Node.ELEMENT_NODE && (sibling as Element).tagName === (element as Element).tagName) {
			ix++;
		}
	}
	return '';
}

export function getElementByXPath(xpath: string): Element | null {
	return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null;
}

export function isDarkColor(color: string): boolean {
	// Convert the color to RGB
	const rgb = color.match(/\d+/g);
	if (!rgb || rgb.length < 3) return false;

	// Calculate the perceived brightness
	const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;

	// Return true if the brightness is below 128 (assuming 0-255 range)
	return brightness < 128;
}

export function wrapElementWithMark(element: Element): void {
	const mark = document.createElement('mark');
	mark.innerHTML = element.innerHTML;
	element.innerHTML = '';
	element.appendChild(mark);
}

export function wrapTextWithMark(element: Element, highlight: { startOffset: number; endOffset: number }): void {
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	let currentOffset = 0;
	let startNode = null;
	let endNode = null;
	let startOffset = 0;
	let endOffset = 0;
	
	let node;
	while (node = walker.nextNode() as Text) {
		const length = node.length;
		
		if (!startNode && currentOffset + length > highlight.startOffset) {
			startNode = node;
			startOffset = highlight.startOffset - currentOffset;
		}
		
		if (!endNode && currentOffset + length >= highlight.endOffset) {
			endNode = node;
			endOffset = highlight.endOffset - currentOffset;
			break;
		}
		
		currentOffset += length;
	}
	
	if (startNode && endNode) {
		try {
			const range = document.createRange();
			range.setStart(startNode, startOffset);
			range.setEnd(endNode, endOffset);
			
			const mark = document.createElement('mark');
			try {
				// First try the simple case
				range.surroundContents(mark);
			} catch (e) {
				// If surroundContents fails, the range likely crosses element boundaries
				// Extract the contents and preserve the structure
				const fragment = range.extractContents();
				mark.appendChild(fragment);
				range.insertNode(mark);
			}
		} catch (error) {
			console.error('Error wrapping text with mark:', error);
		}
	}
}

// Get XPath relative to a specific root element
export function getElementRelativeXPath(element: Element, root: Element): string | null {
	try {
		if (element === root) {
			return '.'; // XPath for the root itself relative to itself
		}

		const parts: string[] = [];
		let currentElement: Element | null = element;

		while (currentElement && currentElement !== root) {
			let part = currentElement.tagName.toLowerCase();
			const parent: Element | null = currentElement.parentElement; // Explicitly type parent

			if (!parent) {
				// Reached document root before hitting the specified root
				console.error("Element is not a descendant of the specified root.");
				return null;
			}

			// Get siblings of the same tag name
			const siblings = Array.from(parent.children)
				.filter((sibling): sibling is Element => sibling instanceof Element && sibling.tagName === currentElement?.tagName); // Type guard for Element

			if (siblings.length > 1) {
				const index = siblings.indexOf(currentElement) + 1; // XPath indices are 1-based
				part += `[${index}]`;
			}

			parts.unshift(part);
			currentElement = parent;

			// Safety break if we somehow miss the root
			if (currentElement === document.body && root !== document.body) {
				console.error("Element path does not lead to the specified root element.");
				return null;
			}
		}

		if (currentElement !== root) {
			// This should theoretically not happen if the initial checks pass,
			// but serves as a final validation.
			console.error("Failed to construct relative XPath: Element not within root.");
			return null;
		}

		// The path starts from the root, so we prepend './' to indicate relative path
		return './' + parts.join('/');

	} catch (error) {
		console.error('Error generating relative XPath:', error);
		return null;
	}
}

// Evaluate an XPath expression relative to a root node
export function evaluateXPath(xpath: string, root: Node): Element | null {
	try {
		const result = document.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
		return result.singleNodeValue as Element | null;
	} catch (error) {
		console.error('Error evaluating XPath:', { xpath, root, error });
		return null;
	}
}