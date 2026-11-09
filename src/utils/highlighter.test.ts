// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createTextQuoteAnchor, getHighlightRanges } from './highlighter';

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
});
