const REMOVABLE_ELEMENTS = [
	'script',
	'style',
	'noscript',
	'link[rel="stylesheet"]',
	'#obsidian-clipper-container',
	'[data-obsidian-element-picker-overlay]',
].join(', ');
const URL_ATTRIBUTES = ['href', 'src', 'poster'];

function makeAbsoluteUrl(value: string, baseUrl: string): string | null {
	const trimmed = value.trim();
	if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('data:')) {
		return trimmed;
	}
	if (/^(javascript|vbscript):/i.test(trimmed)) {
		return null;
	}

	try {
		return new URL(trimmed, baseUrl).href;
	} catch {
		return trimmed;
	}
}

function cleanAttributes(element: Element, baseUrl: string): void {
	for (const attribute of Array.from(element.attributes)) {
		if (attribute.name === 'style' || attribute.name.toLowerCase().startsWith('on')) {
			element.removeAttribute(attribute.name);
		}
	}

	for (const attribute of URL_ATTRIBUTES) {
		const value = element.getAttribute(attribute);
		if (value === null) continue;
		const resolved = makeAbsoluteUrl(value, baseUrl);
		if (resolved === null) element.removeAttribute(attribute);
		else element.setAttribute(attribute, resolved);
	}

	const srcset = element.getAttribute('srcset');
	if (srcset !== null) {
		const resolved = srcset
			.split(',')
			.map(candidate => {
				const [url, descriptor] = candidate.trim().split(/\s+/, 2);
				const absoluteUrl = makeAbsoluteUrl(url, baseUrl);
				return absoluteUrl === null ? '' : `${absoluteUrl}${descriptor ? ` ${descriptor}` : ''}`;
			})
			.filter(Boolean)
			.join(', ');
		if (resolved) element.setAttribute('srcset', resolved);
		else element.removeAttribute('srcset');
	}
}

export function cloneAndCleanSelectedElement(element: Element, baseUrl: string): string {
	const clone = element.cloneNode(true) as Element;
	clone.querySelectorAll(REMOVABLE_ELEMENTS).forEach(child => child.remove());

	for (const candidate of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
		cleanAttributes(candidate, baseUrl);
	}

	return clone.outerHTML;
}
