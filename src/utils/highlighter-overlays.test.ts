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
