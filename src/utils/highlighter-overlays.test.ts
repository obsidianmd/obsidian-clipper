// @vitest-environment jsdom
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { renderTextHighlight, clearTextHighlights } from './highlighter-overlays';
import { getElementXPath } from './dom-utils';

// Capture ranges handed to the CSS Custom Highlight API (not implemented in
// jsdom), so we can assert what renderTextHighlight resolved.
const addedRanges: Range[] = [];

beforeAll(() => {
	class MockHighlight {
		priority = 0;
		add(range: Range) { addedRanges.push(range); }
		clear() { addedRanges.length = 0; }
	}
	(window as unknown as { Highlight: unknown }).Highlight = MockHighlight;
	(globalThis as unknown as { Highlight: unknown }).Highlight = MockHighlight;
	(globalThis as unknown as { CSS: unknown }).CSS = { highlights: new Map() };
});

beforeEach(() => {
	clearTextHighlights();
	addedRanges.length = 0;
});

describe('renderTextHighlight', () => {
	test('resolves a highlight by its stored XPath + offsets', () => {
		document.body.innerHTML = '<p>Hello world.</p>';
		const p = document.querySelector('p')!;
		renderTextHighlight({ id: '1', xpath: getElementXPath(p), startOffset: 0, endOffset: 5 });
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('Hello');
	});

	// Regression: a highlight made in a different DOM (live vs reader, or a
	// regenerated reader view) has a stale XPath. It must still render by
	// falling back to locating its stored content text.
	test('falls back to content text when the XPath is stale', () => {
		document.body.innerHTML =
			'<article><p>A seismic shift is rocking the healthcare industry. Much like Uber once did.</p></article>';
		renderTextHighlight({
			id: '2',
			xpath: '/html[1]/body[1]/div[7]/p[42]', // does not resolve
			startOffset: 0,
			endOffset: 0,
			content: '<p>A seismic shift is rocking the healthcare industry.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('A seismic shift is rocking the healthcare industry.');
	});

	test('skips the highlighter UI chrome when searching by content', () => {
		// Same text appears in a reader settings panel; the fallback must match
		// the article copy, not the chrome.
		document.body.innerHTML =
			'<div class="obsidian-reader-settings">Reader settings</div>' +
			'<article><p>Reader settings make the page easier to read.</p></article>';
		renderTextHighlight({
			id: '3',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>Reader settings make the page easier to read.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		const container = addedRanges[0].startContainer.parentElement;
		expect(container?.closest('article')).not.toBeNull();
	});

	// A highlight spanning an inline element (e.g. a link mid-sentence) is split
	// across multiple text nodes; the content fallback must still span them.
	test('falls back across inline elements within the highlighted text', () => {
		document.body.innerHTML = '<article><p>A <a href="#">seismic</a> shift is here.</p></article>';
		renderTextHighlight({
			id: '5',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>A seismic shift is here.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('A seismic shift is here.');
	});

	// A stale XPath can resolve to a *different* element with different text.
	// renderTextHighlight must reject that and re-anchor by content.
	test('rejects an XPath that resolves to the wrong text and falls back', () => {
		document.body.innerHTML =
			'<article><p>Wrong paragraph text.</p><p>Correct sentence to find.</p></article>';
		const wrongP = document.querySelector('p')!;
		renderTextHighlight({
			id: '6',
			xpath: getElementXPath(wrongP), // resolves, but to the wrong paragraph
			startOffset: 0,
			endOffset: 'Wrong paragraph text.'.length,
			content: '<p>Correct sentence to find.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('Correct sentence to find.');
	});

	// The same prose can be spaced differently across DOMs (raw textContent
	// keeps source newlines/indentation). Matching is whitespace-normalized.
	test('matches across differing whitespace', () => {
		document.body.innerHTML = '<article><p>the quick   brown\n      fox jumps over</p></article>';
		renderTextHighlight({
			id: '7',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>the quick brown fox jumps over</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString().replace(/\s+/g, ' ').trim()).toBe('the quick brown fox jumps over');
	});

	// When the exact text occurs more than once, stored prefix/suffix context
	// selects the correct occurrence rather than always the first.
	test('uses prefix/suffix context to pick the right duplicate', () => {
		document.body.innerHTML =
			'<article>' +
			'<p>Intro paragraph. The term applies here. More intro text.</p>' +
			'<p>Second paragraph. The term applies here. Closing remarks.</p>' +
			'</article>';
		const secondP = document.querySelectorAll('p')[1];
		renderTextHighlight({
			id: '8',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>The term applies here.</p>',
			textQuote: { prefix: 'Second paragraph. ', suffix: ' Closing remarks.' },
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('The term applies here.');
		// Must anchor inside the *second* paragraph, not the first.
		expect(secondP.contains(addedRanges[0].startContainer)).toBe(true);
	});

	test('renders nothing when neither XPath nor content matches', () => {
		document.body.innerHTML = '<article><p>Unrelated text.</p></article>';
		renderTextHighlight({
			id: '4',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>This sentence is not on the page.</p>',
		});
		expect(addedRanges).toHaveLength(0);
	});
});
