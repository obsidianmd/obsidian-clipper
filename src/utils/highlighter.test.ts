// @vitest-environment jsdom
import { describe, test, expect, afterEach } from 'vitest';
import { AnyHighlightData, createTextQuoteAnchor, getHighlights, updateHighlights } from './highlighter';

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

describe('getHighlights', () => {
	afterEach(() => {
		updateHighlights([]);
	});

	test('returns full highlight records including groupId and metadata', () => {
		const stored: AnyHighlightData[] = [
			{
				id: '1700000000000_tx_0',
				type: 'text',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<p>First paragraph.</p>',
				startOffset: 0,
				endOffset: 16,
				groupId: 'grp_1',
				notes: ['a note'],
			},
			{
				id: '1700000000000_tx_1',
				type: 'text',
				xpath: '/html[1]/body[1]/p[2]',
				content: '<p>Second paragraph.</p>',
				startOffset: 0,
				endOffset: 17,
				groupId: 'grp_1',
			},
			{
				id: '1700000005000_el_0',
				type: 'element',
				xpath: '/html[1]/body[1]/figure[1]',
				content: '<figure><img src="image.png"></figure>',
			},
		];

		updateHighlights(stored);

		expect(getHighlights()).toEqual(stored);
	});

	test('returns a shallow copy so callers cannot mutate stored highlights', () => {
		const stored: AnyHighlightData[] = [
			{
				id: '1700000000000_tx_0',
				type: 'text',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<p>Paragraph.</p>',
				startOffset: 0,
				endOffset: 10,
			},
		];

		updateHighlights(stored);
		const returned = getHighlights();
		returned.pop();

		expect(getHighlights()).toHaveLength(1);
	});
});
