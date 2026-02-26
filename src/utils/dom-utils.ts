export function createElementWithClass(tagName: string, className: string): HTMLElement {
	const element = document.createElement(tagName);
	element.className = className;
	return element;
}

export function createElementWithHTML(tagName: string, htmlContent: string, attributes: Record<string, string> = {}): HTMLElement {
	const element = document.createElement(tagName);

	const parser = new DOMParser();
	const doc = parser.parseFromString(htmlContent, 'text/html');
	
	// Move all child nodes from parsed content to the element
	Array.from(doc.body.childNodes).forEach(node => {
		element.appendChild(node.cloneNode(true));
	});
	
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

/**
 * Converts a tag/index XPath into a namespace-agnostic version.
 * Why: some sites (for example embedded XHTML islands) expose namespaced element nodes,
 * and plain tag steps like `/html[1]/body[1]` will not match in XPath without prefixes.
 */
function buildNamespaceAgnosticXPath(xpath: string): string {
	if (!xpath) {
		return xpath;
	}

	return xpath
		.split('/')
		.map((segment) => {
			if (!segment || segment === '.' || segment === '..') {
				return segment;
			}

			const stepMatch = segment.match(/^([a-zA-Z_][\w:.-]*)(\[(\d+)\])?$/);
			if (!stepMatch) {
				return segment;
			}

			const tagName = stepMatch[1].toLowerCase();
			const index = stepMatch[3];
			return index
				? `*[local-name()="${tagName}"][${index}]`
				: `*[local-name()="${tagName}"]`;
		})
		.join('/');
}

export function getElementByXPath(xpath: string): Element | null {
	const directMatch = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
	if (directMatch instanceof Element) {
		return directMatch;
	}

	const namespaceAgnosticXPath = buildNamespaceAgnosticXPath(xpath);
	if (!namespaceAgnosticXPath || namespaceAgnosticXPath === xpath) {
		return null;
	}

	const fallbackMatch = document.evaluate(
		namespaceAgnosticXPath,
		document,
		null,
		XPathResult.FIRST_ORDERED_NODE_TYPE,
		null
	).singleNodeValue;

	return fallbackMatch instanceof Element ? fallbackMatch : null;
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

	while (element.firstChild) {
		mark.appendChild(element.firstChild);
	}
	
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
		const range = document.createRange();
		range.setStart(startNode, startOffset);
		range.setEnd(endNode, endOffset);
		
		const mark = document.createElement('mark');
		range.surroundContents(mark);
	}
}
