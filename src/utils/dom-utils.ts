export function createElementWithClass(tagName: string, className: string): HTMLElement {
	const element = document.createElement(tagName);
	element.className = className;
	return element;
}

export function createElementWithHTML(tagName: string, htmlContent: string, attributes: Record<string, string> = {}): HTMLElement {
	const element = document.createElement(tagName);
	if (htmlContent) {
		setElementHTML(element, htmlContent);
	}
	Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
	return element;
}

export function setElementHTML(element: Element, html: string): void {
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	element.replaceChildren(...Array.from(parsed.body.childNodes));
}

export function setSVGChildren(svgElement: Element, markup: string): void {
	const doc = new DOMParser()
		.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, 'image/svg+xml');
	const tempSvg = doc.documentElement;
	svgElement.replaceChildren(
		...Array.from(tempSvg.childNodes).map(n => svgElement.ownerDocument.importNode(n, true))
	);
}

export function serializeChildren(element: Element): string {
	return Array.from(element.childNodes).map(node => {
		if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
		if (node.nodeType === Node.TEXT_NODE) {
			return (node.textContent ?? '')
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		}
		if (node.nodeType === Node.COMMENT_NODE) {
			return `<!--${node.textContent ?? ''}-->`;
		}
		return '';
	}).join('');
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

