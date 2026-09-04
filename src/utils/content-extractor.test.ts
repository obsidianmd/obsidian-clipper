// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createMarkdownContentWithHighlightColors, processHighlights } from './content-extractor';
import { HIGHLIGHT_COLOR_MARKERS, TextHighlightData } from './highlighter';

// Default settings already use highlighterEnabled + 'highlight-inline', the
// behavior these tests exercise.

function textHighlight(content: string, color?: TextHighlightData['color']): TextHighlightData {
	// xpath is empty so processing goes straight to the content-based path,
	// matching the common case where the recorded xpath (live/reader DOM)
	// doesn't resolve against the extracted article content.
	return { type: 'text', id: '1', xpath: '', content, startOffset: 0, endOffset: 0, ...(color ? { color } : {}) };
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

	test('preserves a highlight color on the generated mark', () => {
		const result = processHighlights(article, [
			textHighlight('<p>A seismic shift is rocking the healthcare industry.</p>', 'red'),
		]);
		expect(result).toContain('<mark data-highlight="red">A seismic shift is rocking the healthcare industry.</mark>');
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
});

describe('createMarkdownContentWithHighlightColors', () => {
	test('writes every Obsidian color marker inside highlight delimiters', () => {
		for (const [color, marker] of Object.entries(HIGHLIGHT_COLOR_MARKERS)) {
			expect(createMarkdownContentWithHighlightColors(
				`<p>Before <mark data-highlight="${color}">example</mark> after.</p>`,
				'https://example.com',
			)).toBe(`Before ==${marker}example== after.`);
		}
	});

	test('keeps classic highlights marker-free', () => {
		expect(createMarkdownContentWithHighlightColors(
			'<p><mark>example</mark></p>',
			'https://example.com',
		)).toBe('==example==');
	});
});
