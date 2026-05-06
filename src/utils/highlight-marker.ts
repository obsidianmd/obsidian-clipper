// Insert <mark> elements directly into a live (or cloned) Document at the
// positions described by stored highlights. Defuddle later converts <mark>
// into Obsidian's ==highlight== markdown, so getting the marks structurally
// correct here is what makes round-trips work for selections that cross
// links, <em>/<strong>, and other inline formatting.
//
// This replaces a fragile substring-search-on-cleaned-HTML approach that
// silently dropped any highlight whose plain text didn't match a single
// text node in the cleaned content (links, &nbsp;, hair-space em-dashes,
// partial-paragraph selections all broke it).

import { AnyHighlightData, TextHighlightData } from './highlighter';

export interface MarkInsertion {
	mark: HTMLElement;
}

export function applyHighlightsToDocument(
	doc: Document,
	highlights: AnyHighlightData[],
): MarkInsertion[] {
	const inserted: MarkInsertion[] = [];
	for (const highlight of highlights) {
		try {
			const element = evaluateXPath(doc, highlight.xpath);
			if (!element) continue;

			if (highlight.type === 'element') {
				inserted.push(...wrapElementWithMark(element));
			} else if (highlight.type === 'text') {
				const range = buildRangeForTextHighlight(doc, element, highlight);
				if (range) {
					const ins = wrapRangeWithMark(range);
					if (ins) inserted.push(ins);
				}
			}
		} catch {
			// One bad highlight should never sink the rest. Continue.
		}
	}
	return inserted;
}

export function unwrapHighlightMarks(insertions: MarkInsertion[]): void {
	// Restore the document by replacing each <mark> with its children, in
	// reverse order so nested marks unwrap from the inside out.
	for (let i = insertions.length - 1; i >= 0; i--) {
		const { mark } = insertions[i];
		const parent = mark.parentNode;
		if (!parent) continue;
		while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
		parent.removeChild(mark);
	}
}

function evaluateXPath(doc: Document, xpath: string): Element | null {
	if (!xpath) return null;
	try {
		return doc.evaluate(
			xpath,
			doc,
			null,
			XPathResult.FIRST_ORDERED_NODE_TYPE,
			null,
		).singleNodeValue as Element | null;
	} catch {
		return null;
	}
}

function buildRangeForTextHighlight(
	doc: Document,
	element: Element,
	highlight: TextHighlightData,
): Range | null {
	const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
	let currentOffset = 0;
	let startNode: Text | null = null;
	let endNode: Text | null = null;
	let startOffset = 0;
	let endOffset = 0;

	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) {
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

	if (!startNode || !endNode) return null;

	const range = doc.createRange();
	try {
		range.setStart(startNode, startOffset);
		range.setEnd(endNode, endOffset);
	} catch {
		return null;
	}
	return range.collapsed ? null : range;
}

function wrapRangeWithMark(range: Range): MarkInsertion | null {
	const doc = range.startContainer.ownerDocument;
	if (!doc) return null;
	const mark = doc.createElement('mark');

	try {
		// Fast path: range stays within one text node / one element boundary.
		range.surroundContents(mark);
		return { mark };
	} catch {
		// Range crosses element boundaries (e.g. a selection that spans an
		// <a> or <em>). Extract the contents into a DocumentFragment, wrap
		// that fragment in <mark>, then re-insert at the range's position.
		try {
			const fragment = range.extractContents();
			mark.appendChild(fragment);
			range.insertNode(mark);
			return { mark };
		} catch {
			return null;
		}
	}
}

function wrapElementWithMark(element: Element): MarkInsertion[] {
	const doc = element.ownerDocument;
	if (!doc) return [];
	const mark = doc.createElement('mark');
	while (element.firstChild) mark.appendChild(element.firstChild);
	element.appendChild(mark);
	return [{ mark }];
}
