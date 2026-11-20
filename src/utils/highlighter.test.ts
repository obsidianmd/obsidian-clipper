// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import {
	createTextQuoteAnchor,
	getHighlightRanges,
	handleTextSelection,
	highlightElement,
	getHighlights,
	clearHighlights,
	updateHighlights,
	highlights,
	TextHighlightData,
} from './highlighter';
import { getElementByXPath, getElementXPath } from './dom-utils';

function container(text: string): Element {
	const el = document.createElement('p');
	el.textContent = text;
	return el;
}

describe('createTextQuoteAnchor', () => {
	test('captures the text on each side of the selection', () => {
		const el = container('Intro. The term applies here. Outro.');
		const start = 'Intro. '.length;
		const end = start + 'The term applies here.'.length;
		expect(createTextQuoteAnchor(el, start, end)).toEqual({
			prefix: 'Intro. ',
			suffix: ' Outro.',
		});
	});

	test('returns an empty prefix when the selection starts the block', () => {
		const el = container('The term applies here. Outro.');
		const anchor = createTextQuoteAnchor(el, 0, 'The term applies here.'.length);
		expect(anchor?.prefix).toBe('');
		expect(anchor?.suffix).toBe(' Outro.');
	});

	test('caps context at 64 characters per side', () => {
		const pad = 'x'.repeat(100);
		const el = container(`${pad}MIDDLE${pad}`);
		const anchor = createTextQuoteAnchor(el, 100, 106)!;
		expect(anchor.prefix).toBe('x'.repeat(64));
		expect(anchor.suffix).toBe('x'.repeat(64));
	});

	test('returns undefined for a whitespace-only selection', () => {
		const el = container('before    after');
		expect(createTextQuoteAnchor(el, 'before'.length, 'before    '.length)).toBeUndefined();
	});
});

describe('getHighlightRanges', () => {
	function selectAll(el: Element): Range {
		const range = document.createRange();
		range.selectNodeContents(el);
		return range;
	}

	test('highlights text inside a standard <p>', () => {
		document.body.innerHTML = '<article><p id="t">Hello world</p></article>';
		const result = getHighlightRanges(selectAll(document.getElementById('t')!));
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('text');
	});

	// Regression: https://github.com/obsidianmd/obsidian-clipper/issues/1009
	// aboutamazon.com wraps article text in <span><div><span>text</span></div></span>
	// with no <p>/<h*>/<li>, so no text block was found and nothing was highlighted.
	test('highlights text that has no <p>/heading/list ancestor (div/span markup)', () => {
		document.body.innerHTML =
			'<article><div class="contentItem-role-text"><span class="text v2">' +
			'<div class="text" id="t"><span class="text v2">One of the biggest shifts</span></div>' +
			'</span></div></article>';
		const result = getHighlightRanges(selectAll(document.getElementById('t')!));
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('text');
		expect(result[0].content).toContain('One of the biggest shifts');
	});

	test('splits a selection across multiple div-based paragraphs', () => {
		document.body.innerHTML =
			'<article id="a"><div><span>First paragraph</span></div><div><span>Second paragraph</span></div></article>';
		const result = getHighlightRanges(selectAll(document.getElementById('a')!));
		expect(result).toHaveLength(2);
	});

	test('measures offsets when the selection boundaries are elements, not text nodes', () => {
		document.body.innerHTML = '<p id="t"><b>Bold</b> and plain</p>';
		// selectNodeContents puts both boundaries on the <p> itself: (p, 0) → (p, 2).
		const [highlight] = getHighlightRanges(selectAll(document.getElementById('t')!)) as TextHighlightData[];
		expect([highlight.startOffset, highlight.endOffset]).toEqual([0, 'Bold and plain'.length]);
	});
});

// Regression: highlighting text that sits in a bare <span> inside a large
// container (uber.com/blog) anchored the highlight on the whole article
// container. Containment-based merging then absorbed every later highlight
// into it (and deleted earlier ones), so nothing else could be highlighted.
describe('text without semantic tags inside a large container', () => {
	const ARTICLE =
		'<main><div class="rich-lfc-content">' +
		'<p class="rich-paragraph"><span id="early">An earlier paragraph.</span></p>' +
		'<span id="p1">Using thousands of real-world PRs across our monorepos.</span><p></p>' +
		'<h4>Default Model Selection</h4>' +
		'<p class="rich-paragraph"><span id="s2">In the interactive interface, token costs remain fixed.</span></p>' +
		'<p class="rich-paragraph"><span id="s3">The subagent default setting is the most impactful lever.</span></p>' +
		'</div></main>';

	function select(startId: string, endId = startId): Selection {
		const range = document.createRange();
		range.setStartBefore(document.getElementById(startId)!.firstChild!);
		range.setEndAfter(document.getElementById(endId)!.lastChild!);
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(range);
		return sel;
	}

	beforeEach(async () => {
		// jsdom lacks the CSS Custom Highlight API; stub it so rendering is a no-op.
		(globalThis as any).CSS = { highlights: { set() {}, delete() {} } };
		(window as any).Highlight = class { priority = 0; add() {} clear() {} };
		clearHighlights();
		await new Promise(resolve => setTimeout(resolve, 0));
		document.body.innerHTML = ARTICLE;
	});

	test('does not anchor on a container that holds other text blocks', () => {
		const range = document.createRange();
		range.selectNodeContents(document.getElementById('p1')!);
		const [highlight] = getHighlightRanges(range);
		const anchor = getElementByXPath(highlight.xpath)!;
		expect(anchor.contains(document.getElementById('s2'))).toBe(false);
		expect(anchor.contains(document.getElementById('early'))).toBe(false);
	});

	test('later paragraph highlights are kept after highlighting the bare span', () => {
		handleTextSelection(select('p1'));
		handleTextSelection(select('s2', 's3'));
		expect(getHighlights()).toHaveLength(3);
	});

	test('highlighting the bare span does not delete existing paragraph highlights', () => {
		handleTextSelection(select('s2', 's3'));
		expect(getHighlights()).toHaveLength(2);
		handleTextSelection(select('p1'));
		expect(getHighlights()).toHaveLength(3);
	});
});

// A text highlight covers a character range inside its anchor element, not the
// whole element. Merging used to treat "one anchor contains the other" as an
// overlap and keep only the outer highlight, so any highlight anchored on an
// element that contains other anchors deleted every highlight inside it.
describe('merging highlights whose anchors are nested', () => {
	function selectRange(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Selection {
		const range = document.createRange();
		range.setStart(startNode, startOffset);
		range.setEnd(endNode, endOffset);
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(range);
		return sel;
	}

	function selectContents(el: Element): Selection {
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection()!;
		sel.removeAllRanges();
		sel.addRange(range);
		return sel;
	}

	function textHighlight(el: Element, startOffset: number, endOffset: number, id: string): TextHighlightData {
		const text = el.textContent!.slice(startOffset, endOffset);
		return { id, type: 'text', xpath: getElementXPath(el), content: `<p>${text}</p>`, startOffset, endOffset };
	}

	beforeEach(async () => {
		// jsdom lacks the CSS Custom Highlight API; stub it so rendering is a no-op.
		(globalThis as any).CSS = { highlights: { set() {}, delete() {} } };
		(window as any).Highlight = class { priority = 0; add() {} clear() {} };
		// Element highlight overlays hit-test the page; jsdom doesn't implement it.
		(document as any).elementFromPoint = () => null;
		clearHighlights();
		await new Promise(resolve => setTimeout(resolve, 0));
	});

	// Highlights saved by the buggy fallback (anchored on the whole article
	// container) stay in storage after the anchoring fix; they must not keep
	// swallowing every new highlight on the page.
	describe('a saved highlight anchored on the article container', () => {
		const PASSAGE = 'Using thousands of real-world PRs across our monorepos.';
		let saved: TextHighlightData;

		beforeEach(() => {
			document.body.innerHTML =
				'<main><div class="rich-lfc-content">' +
				'<p><span id="early">An earlier paragraph.</span></p>' +
				`<span id="p1">${PASSAGE}</span><p></p>` +
				'<p><span id="s2">In the interactive interface, token costs remain fixed.</span></p>' +
				'<p><span id="s3">The subagent default setting is the most impactful lever.</span></p>' +
				'</div></main>';
			const container = document.querySelector('.rich-lfc-content')!;
			const start = container.textContent!.indexOf(PASSAGE);
			saved = textHighlight(container, start, start + PASSAGE.length, 'saved');
			updateHighlights([saved]);
		});

		test('does not swallow highlights of other paragraphs', () => {
			const s2 = document.getElementById('s2')!.firstChild!;
			const s3 = document.getElementById('s3')!.firstChild!;
			handleTextSelection(selectRange(s2, 0, s3, s3.textContent!.length));
			expect(highlights).toHaveLength(3);
		});

		test('still merges with a new highlight of the same text', () => {
			handleTextSelection(selectContents(document.getElementById('p1')!));
			expect(highlights).toHaveLength(1);
			const merged = highlights[0] as TextHighlightData;
			expect(merged.xpath).toBe(saved.xpath);
			expect([merged.startOffset, merged.endOffset]).toEqual([saved.startOffset, saved.endOffset]);
		});
	});

	test('loose text beside other blocks is highlightable and keeps their highlights', () => {
		document.body.innerHTML =
			'<div id="c"><p id="para">A paragraph.</p>Loose text with no wrapper.<p>Another paragraph.</p></div>';
		const para = document.getElementById('para')!;
		const loose = para.nextSibling!;
		handleTextSelection(selectContents(para));
		handleTextSelection(selectRange(loose, 0, loose, loose.textContent!.length));
		expect(highlights).toHaveLength(2);
		expect(getHighlights().some(content => content.includes('Loose text with no wrapper.'))).toBe(true);
	});

	test('nested list items keep separate highlights', () => {
		document.body.innerHTML =
			'<ul><li id="outer">Outer item text<ul><li id="inner">Inner item text</li></ul></li></ul>';
		const outerText = document.getElementById('outer')!.firstChild!;
		const innerText = document.getElementById('inner')!.firstChild!;
		handleTextSelection(selectRange(outerText, 0, outerText, outerText.textContent!.length));
		handleTextSelection(selectRange(innerText, 0, innerText, innerText.textContent!.length));
		expect(highlights).toHaveLength(2);
	});

	test('selecting a paragraph with an inline image keeps the paragraph text', () => {
		document.body.innerHTML = '<p id="para">Before the image <img id="pic" src="data:,"> and after it.</p>';
		handleTextSelection(selectContents(document.getElementById('para')!));
		expect(highlights.some(h => h.type === 'text')).toBe(true);
	});

	test('an element highlight still absorbs text highlights inside it', () => {
		document.body.innerHTML = '<table id="tbl"><tbody><tr><td id="cell">Cell text</td></tr></tbody></table>';
		handleTextSelection(selectContents(document.getElementById('cell')!));
		highlightElement(document.getElementById('tbl')!);
		expect(highlights).toHaveLength(1);
		expect(highlights[0].type).toBe('element');
	});

	test('a selection overlapping two saved highlights merges both and keeps unrelated ones', () => {
		document.body.innerHTML = '<p id="a">0123456789ABCDEFGHIJ</p><p id="b">Other paragraph</p>';
		const a = document.getElementById('a')!;
		const b = document.getElementById('b')!;
		// Stored order isn't guaranteed to be document order (e.g. imported or
		// saved under a different layout), so an unrelated highlight can sit
		// between two highlights of the same paragraph.
		updateHighlights([textHighlight(a, 0, 5, 'x'), textHighlight(b, 0, 5, 'y'), textHighlight(a, 10, 15, 'z')]);
		handleTextSelection(selectRange(a.firstChild!, 3, a.firstChild!, 12));
		expect(highlights).toHaveLength(2);
		const merged = highlights.find(h => h.xpath === getElementXPath(a)) as TextHighlightData;
		expect([merged.startOffset, merged.endOffset]).toEqual([0, 15]);
		expect(highlights.some(h => h.xpath === getElementXPath(b))).toBe(true);
	});
});
