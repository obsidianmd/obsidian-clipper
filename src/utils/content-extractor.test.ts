// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { processHighlights } from './content-extractor';
import { TextHighlightData } from './highlighter';

// Default settings already use highlighterEnabled + 'highlight-inline', the
// behavior these tests exercise.

function textHighlight(content: string): TextHighlightData {
	// xpath is empty so processing goes straight to the content-based path,
	// matching the common case where the recorded xpath (live/reader DOM)
	// doesn't resolve against the extracted article content.
	return { type: 'text', id: '1', xpath: '', content, startOffset: 0, endOffset: 0 };
}

describe('processHighlights — highlight-inline', () => {
	const article = '<p>A seismic shift is rocking the healthcare industry. Much like Uber once did.</p>';

	test('wraps a whole-paragraph highlight', () => {
		const result = processHighlights(article, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry. Much like Uber once did.</p>'),
		]);
		expect(result).toContain('<mark>A seismic shift is rocking the healthcare industry. Much like Uber once did.</mark>');
	});

	// Regression for #446 / #852: a sentence highlighted within a paragraph was
	// dropped because it never equaled the full paragraph text.
	test('wraps a sentence highlighted within a paragraph', () => {
		const result = processHighlights(article, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry.</p>'),
		]);
		expect(result).toContain('<mark>A seismic shift is rocking the healthcare industry.</mark>');
		expect(result).toContain('Much like Uber once did.');
	});

	// A partial highlight crossing an inline element must still wrap (the range
	// spans nodes, so it uses extractContents rather than surroundContents).
	test('wraps a partial highlight that spans an inline element', () => {
		const withLink = '<p>A <a href="#">seismic</a> shift is rocking the healthcare industry. Much like Uber.</p>';
		const result = processHighlights(withLink, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry.</p>'),
		]);
		const mark = new DOMParser().parseFromString(result, 'text/html').querySelector('mark');
		expect(mark).not.toBeNull();
		expect(mark!.textContent?.replace(/\s+/g, ' ').trim()).toBe('A seismic shift is rocking the healthcare industry.');
		// The link must survive inside the mark, proving the range crossed it.
		expect(mark!.querySelector('a')).not.toBeNull();
	});

	const repeated = '<p>Alone on the beach, she settled herself on a rock.</p><p>He came to gather seaweed, seeing her before she saw him.</p>';

	test('marks the occurrence that matches the stored context', () => {
		const result = processHighlights(repeated, [{
			...textHighlight('<div><p>her</p></div>'),
			textQuote: { prefix: 'gather seaweed, seeing ', suffix: ' before she saw him.' },
		}]);
		expect(result).toContain('settled herself');
		expect(result).toContain('seeing <mark>her</mark> before');
	});

	test('marks two highlights of the same word in one paragraph', () => {
		const article = '<p>The seal saw the seal.</p>';
		const result = processHighlights(article, [
			{ ...textHighlight('<div><p>seal</p></div>'), id: '1', textQuote: { prefix: 'The seal saw the ', suffix: '.' } },
			{ ...textHighlight('<div><p>seal</p></div>'), id: '2', textQuote: { prefix: 'The ', suffix: ' saw the seal.' } },
		]);
		expect(new DOMParser().parseFromString(result, 'text/html').body.textContent).toBe('The seal saw the seal.');
		expect(result).toContain('The <mark>seal</mark> saw the <mark>seal</mark>.');
	});

	test('keeps a marked range inside one block', () => {
		const article = '<p>The tide came in </p><p>and out again.</p>';
		const result = processHighlights(article, [{
			...textHighlight('<div><p>came in and out</p></div>'),
			textQuote: { prefix: 'The tide ', suffix: ' again.' },
		}]);
		const body = new DOMParser().parseFromString(result, 'text/html').body;
		expect(body.querySelector('mark')).toBeNull();
		expect(body.querySelectorAll('p')).toHaveLength(2);
	});

	test('keeps a marked range inside one div', () => {
		const article = '<div>The tide came in </div><div>and out again.</div>';
		const result = processHighlights(article, [{
			...textHighlight('<div><div>came in and out</div></div>'),
			textQuote: { prefix: 'The tide ', suffix: ' again.' },
		}]);
		const body = new DOMParser().parseFromString(result, 'text/html').body;
		expect(body.querySelector('mark')).toBeNull();
		expect(body.querySelectorAll('div')).toHaveLength(2);
	});

	test('keeps a marked range out of a summary and its details body', () => {
		const article = '<details><summary>The tide came in </summary>and out again.</details>';
		const result = processHighlights(article, [{
			...textHighlight('<div><p>came in and out</p></div>'),
			textQuote: { prefix: 'The tide ', suffix: ' again.' },
		}]);
		const body = new DOMParser().parseFromString(result, 'text/html').body;
		expect(body.querySelector('mark')).toBeNull();
		expect(body.querySelector('details > summary')?.textContent).toBe('The tide came in ');
	});

	test('prefers the occurrence with the same spacing as the stored context', () => {
		const article = '<p>She settled herself on a rock.</p><p>She settled her self on a rock.</p>';
		const result = processHighlights(article, [{
			...textHighlight('<div><p>her</p></div>'),
			textQuote: { prefix: 'She settled ', suffix: ' self on a rock.' },
		}]);
		expect(result).toContain('settled herself');
		expect(result).toContain('<mark>her</mark> self');
	});

	test('prefers the same spacing before the highlight', () => {
		const article = '<p>She settled herself on a rock.</p><p>She settled her self on a rock.</p>';
		const result = processHighlights(article, [{
			...textHighlight('<div><p>self</p></div>'),
			textQuote: { prefix: 'She settled her ', suffix: ' on a rock.' },
		}]);
		expect(result).toContain('settled herself');
		expect(result).toContain('her <mark>self</mark>');
	});

	test('uses stored context for a selection with a leading space', () => {
		const result = processHighlights('<p>She combed her</p><p>He was seeing her</p>', [{
			...textHighlight('<div><p> her</p></div>'),
			textQuote: { prefix: 'He was seeing', suffix: '' },
		}]);
		expect(result).toContain('combed her');
		expect(result).toContain('seeing <mark>her</mark>');
	});

	test.each([
		['a trailing space', '<div><p>Her </p></div>', '', 'hair was wet.'],
		['spaces on both sides', '<div><p> Her </p></div>', '', 'hair was wet.'],
	])('uses stored context for a selection with %s', (_name, content, prefix, suffix) => {
		const result = processHighlights('<p>Her coat was red.</p><p>Her hair was wet.</p>', [{
			...textHighlight(content),
			textQuote: { prefix, suffix },
		}]);
		expect(result).toContain('Her coat');
		expect(result).toContain('<mark>Her</mark> hair');
	});

	test('marks a whole paragraph instead of the same words in an earlier one', () => {
		const article = '<p>She said the tide came in, then left.</p><p>the tide came in</p>';
		const result = processHighlights(article, [{
			...textHighlight('<div><p>the tide came in</p></div>'),
			textQuote: { prefix: '', suffix: '' },
		}]);
		expect(result).toContain('She said the tide came in, then left.');
		expect(result).toContain('<mark>the tide came in</mark></p>');
		expect(result.match(/<mark>/g)).toHaveLength(1);
	});

	test('falls back to a text search without stored context', () => {
		const result = processHighlights(repeated, [textHighlight('<div><p>rock</p></div>')]);
		expect(result).toContain('<mark>rock</mark>');
	});
});
