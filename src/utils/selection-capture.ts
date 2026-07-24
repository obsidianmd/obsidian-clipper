export interface SelectionSnapshot {
	html: string;
	text: string;
}

const VISUAL_BULLET = /^[•·]$/;
const VISUAL_DOT = /^\.$/;

function closestList(node: Node | null): HTMLUListElement | HTMLOListElement | null {
	const element = node instanceof Element ? node : node?.parentElement;
	return element?.closest('ul, ol') as HTMLUListElement | HTMLOListElement | null;
}

function cloneSelectedList(range: Range, document: Document): DocumentFragment | null {
	const startList = closestList(range.startContainer);
	const endList = closestList(range.endContainer);
	if (!startList || startList !== endList) return null;

	const selectedItems = Array.from(startList.children)
		.filter((child): child is HTMLLIElement => child.tagName === 'LI' && range.intersectsNode(child));
	if (selectedItems.length === 0) return null;

	const fragment = document.createDocumentFragment();
	const list = document.createElement(startList.tagName.toLowerCase());
	for (const item of selectedItems) list.appendChild(item.cloneNode(true));
	fragment.appendChild(list);
	return fragment;
}

function wrapOrphanListItems(container: HTMLElement, listTag: 'ul' | 'ol' = 'ul'): void {
	const children = Array.from(container.children);
	let index = 0;
	while (index < children.length) {
		if (children[index].tagName !== 'LI') {
			index++;
			continue;
		}

		const list = container.ownerDocument.createElement(listTag);
		children[index].before(list);
		while (index < children.length && children[index].tagName === 'LI') {
			list.appendChild(children[index]);
			index++;
		}
	}
}

function isVisualBullet(element: Element): boolean {
	return VISUAL_BULLET.test((element.textContent || '').trim()) || VISUAL_DOT.test((element.textContent || '').trim());
}

function hasBulletClass(element: Element): boolean {
	return /(?:^|[-_\s])(bullet|marker|list-item|listitem)(?:$|[-_\s])/i.test(element.className || '');
}

function hasFakeListRole(element: Element): boolean {
	return element.getAttribute('role') === 'list' &&
		Array.from(element.children).filter(child => child.getAttribute('role') === 'listitem').length >= 2;
}

function normalizeRoleList(container: HTMLElement): void {
	for (const list of Array.from(container.querySelectorAll('[role="list"]'))) {
		if (!hasFakeListRole(list)) continue;
		const replacement = container.ownerDocument.createElement('ul');
		for (const item of Array.from(list.children)) {
			if (item.getAttribute('role') !== 'listitem') continue;
			const li = container.ownerDocument.createElement('li');
			li.innerHTML = item.innerHTML;
			replacement.appendChild(li);
		}
		list.replaceWith(replacement);
	}
}

function hasGeneratedListMarker(element: Element): boolean {
	try {
		const style = window.getComputedStyle(element);
		if (style.display === 'list-item') return true;
		if (/jsdom/i.test(window.navigator.userAgent)) return false;
		const before = window.getComputedStyle(element, '::before').content.replace(/["']/g, '').trim();
		return VISUAL_BULLET.test(before) || VISUAL_DOT.test(before);
	} catch {
		return false;
	}
}

function normalizeStyledListItems(container: HTMLElement): void {
	for (const parent of [container, ...Array.from(container.querySelectorAll('*'))]) {
		const items = Array.from(parent.children).filter(child => child.tagName !== 'LI');
		if (items.length < 2 || !items.every(hasGeneratedListMarker)) continue;

		const list = container.ownerDocument.createElement('ul');
		items[0].before(list);
		for (const item of items) {
			const li = container.ownerDocument.createElement('li');
			li.innerHTML = item.innerHTML;
			list.appendChild(li);
			item.remove();
		}
	}
}

function normalizeVisualBulletRuns(container: HTMLElement): void {
	for (const parent of [container, ...Array.from(container.querySelectorAll('*'))]) {
		const children = Array.from(parent.children);
		for (let index = 0; index < children.length - 1;) {
			const marker = children[index];
			const item = children[index + 1];
			if (!isVisualBullet(marker) || !item.textContent?.trim()) {
				index++;
				continue;
			}

			const markerText = (marker.textContent || '').trim();
			let end = index;
			let pairs = 0;
			while (end < children.length - 1 && isVisualBullet(children[end]) && children[end + 1].textContent?.trim()) {
				pairs++;
				end += 2;
			}

			// A visible bullet glyph immediately followed by an item is a strong
			// signal. A plain dot additionally needs repetition or an explicit
			// marker class so sentence punctuation is never converted.
			const isConfident = VISUAL_BULLET.test(markerText) || pairs >= 2 || hasBulletClass(marker);
			if (!isConfident) {
				index++;
				continue;
			}

			const list = container.ownerDocument.createElement('ul');
			marker.before(list);
			for (let pair = index; pair < end; pair += 2) {
				const li = container.ownerDocument.createElement('li');
				li.innerHTML = children[pair + 1].innerHTML;
				list.appendChild(li);
				children[pair].remove();
				children[pair + 1].remove();
			}
			index = end;
		}
	}
}

function normalizeSelectionStructure(container: HTMLElement, listTag?: 'ul' | 'ol'): void {
	wrapOrphanListItems(container, listTag);
	normalizeRoleList(container);
	normalizeStyledListItems(container);
	normalizeVisualBulletRuns(container);
}

function createPlainTextFallback(text: string, document: Document): string {
	const container = document.createElement('div');
	const paragraphs = text
		.split(/\n{2,}/)
		.map(paragraph => paragraph.replace(/\n+/g, ' ').trim())
		.filter(Boolean);

	for (const paragraph of paragraphs) {
		const element = document.createElement('p');
		element.textContent = paragraph;
		container.appendChild(element);
	}

	return container.innerHTML;
}

export function captureSelectionSnapshot(selection: Selection | null, document: Document): SelectionSnapshot | null {
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

	const text = selection.toString().trim();
	if (!text) return null;

	const container = document.createElement('div');
	try {
		for (let index = 0; index < selection.rangeCount; index++) {
			if (index > 0) container.appendChild(document.createElement('br'));
			const range = selection.getRangeAt(index);
			const selectedList = cloneSelectedList(range, document);
			container.appendChild(selectedList || range.cloneContents());
		}
	} catch {
		return { html: createPlainTextFallback(text, document), text };
	}

	const firstRangeList = selection.rangeCount > 0 ? closestList(selection.getRangeAt(0).startContainer) : null;
	normalizeSelectionStructure(container, firstRangeList?.tagName.toLowerCase() as 'ul' | 'ol' | undefined);
	const html = container.innerHTML.trim();
	return { html: html || createPlainTextFallback(text, document), text };
}
