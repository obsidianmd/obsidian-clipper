// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import browser from './browser-polyfill';
import { extractPageContent, initializePageContent, processHighlights } from './content-extractor';
import { compileTemplate } from './template-compiler';
import { AnyHighlightData, TextHighlightData } from './highlighter';

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

	test('falls back to content matching when a live-page xpath does not exist in extracted html', () => {
		const result = processHighlights('<p>First paragraph.</p>', [
			{
				type: 'text',
				id: '1',
				xpath: '/html[1]/body[1]/article[1]/p[1]',
				content: '<p>First paragraph.</p>',
				startOffset: 0,
				endOffset: 16,
			},
		]);
		expect(result).toContain('<mark>First paragraph.</mark>');
	});

	test('rejects a stale xpath that resolves to a different paragraph in extracted html', () => {
		const extracted = '<p>First paragraph.</p><p>Second paragraph.</p>';
		const result = processHighlights(extracted, [
			{
				type: 'text',
				id: '1',
				xpath: '/html[1]/body[1]/p[2]',
				content: '<p>First paragraph.</p>',
				startOffset: 0,
				endOffset: 16,
			},
		]);
		expect(result).toContain('<mark>First paragraph.</mark>');
		expect(result).not.toContain('<mark>Second paragraph.</mark>');
	});

	test('falls back when an xpath-resolved highlight crosses an inline element boundary', () => {
		const withLink = '<p>A <a href="#">seismic</a> shift is rocking the healthcare industry. Much like Uber.</p>';
		const phrase = 'seismic shift is rocking the healthcare industry.';
		const result = processHighlights(withLink, [
			{
				type: 'text',
				id: '1',
				xpath: '/html[1]/body[1]/p[1]',
				content: `<p>${phrase}</p>`,
				startOffset: 'A '.length,
				endOffset: 'A '.length + phrase.length,
			},
		]);
		const mark = new DOMParser().parseFromString(result, 'text/html').querySelector('mark');
		expect(mark).not.toBeNull();
		expect(mark!.textContent?.replace(/\s+/g, ' ').trim()).toBe(phrase);
		expect(mark!.querySelector('a')).not.toBeNull();
	});

	test('skips unsupported element highlights cleanly without querying host document', () => {
		const html = '<p>Before image.</p><img src="x.png"><table><tbody><tr><td>a</td></tr></tbody></table>';
		const highlights: AnyHighlightData[] = [
			{
				type: 'element',
				id: '1',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<img src="x.png">',
			},
			{
				type: 'element',
				id: '2',
				xpath: '/html[1]/body[1]/table[1]',
				content: '<table><tbody><tr><td>a</td></tr></tbody></table>',
			},
		];
		document.body.innerHTML = '<p>Host node</p>';
		try {
			const result = processHighlights(html, highlights);
			const body = new DOMParser().parseFromString(result, 'text/html').body;
			expect(body.querySelector('mark')).toBeNull();
			expect(body.querySelector('img')?.getAttribute('src')).toBe('x.png');
			expect(body.querySelector('table')).not.toBeNull();
		} finally {
			document.body.innerHTML = '';
		}
	});

	test('wraps two non-overlapping highlights sharing the same xpath', () => {
		const html = '<p>First phrase and second phrase.</p>';
		const result = processHighlights(html, [
			{
				type: 'text',
				id: '1',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<p>First phrase</p>',
				startOffset: 0,
				endOffset: 'First phrase'.length,
			},
			{
				type: 'text',
				id: '2',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<p>second phrase</p>',
				startOffset: 'First phrase and '.length,
				endOffset: 'First phrase and second phrase'.length,
			},
		]);
		expect(result).toContain('<mark>First phrase</mark> and <mark>second phrase</mark>.');
	});
});

describe('extractPageContent', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('preserves full highlight objects returned by the content script', async () => {
		const storedHighlights: AnyHighlightData[] = [
			{
				id: '1700000000000_tx_0',
				type: 'text',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<p>First paragraph.</p>',
				startOffset: 0,
				endOffset: 16,
				groupId: 'grp_1',
				notes: ['first note'],
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
		];
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			content: '<p>First paragraph.</p><p>Second paragraph.</p>',
			selectedHtml: '',
			extractedContent: {},
			schemaOrgData: {},
			fullHtml: '<html><body><p>First paragraph.</p><p>Second paragraph.</p></body></html>',
			highlights: storedHighlights,
			title: 'Test Page',
			author: '',
			description: '',
			domain: 'example.com',
			favicon: '',
			image: '',
			parseTime: 1,
			published: '',
			site: '',
			wordCount: 4,
			language: 'en',
			metaTags: [],
		});

		const result = await extractPageContent(1);

		expect(result?.highlights).toEqual(storedHighlights);
	});

	test('normalizes legacy string highlights from pre-update content scripts', async () => {
		vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({
			content: '<p>Legacy</p>',
			selectedHtml: '',
			extractedContent: {},
			schemaOrgData: {},
			fullHtml: '<html><body><p>Legacy</p></body></html>',
			highlights: ['<p>Legacy</p>'],
			title: 'Test Page',
			author: '',
			description: '',
			domain: 'example.com',
			favicon: '',
			image: '',
			parseTime: 1,
			published: '',
			site: '',
			wordCount: 1,
			language: 'en',
			metaTags: [],
		});

		const result = await extractPageContent(1);

		expect(result?.highlights).toHaveLength(1);
		expect(result?.highlights[0]).toMatchObject({
			type: 'text',
			xpath: '',
			content: '<div><p>Legacy</p></div>',
		});
	});
});

describe('initializePageContent — highlight grouping', () => {
	test('preserves multi-paragraph highlight groups and notes in {{highlights}}', async () => {
		const articleHtml = '<p>First paragraph.</p><p>Second paragraph.</p><p>Third paragraph.</p><p>Fourth paragraph.</p>';
		const highlights: AnyHighlightData[] = [
			{
				id: '1700000000000_tx_0',
				type: 'text',
				xpath: '/html[1]/body[1]/p[1]',
				content: '<p>First paragraph.</p>',
				startOffset: 0,
				endOffset: 16,
				groupId: 'grp_1',
				notes: ['group note'],
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
				id: '1700000000000_tx_2',
				type: 'text',
				xpath: '/html[1]/body[1]/p[3]',
				content: '<p>Third paragraph.</p>',
				startOffset: 0,
				endOffset: 16,
				groupId: 'grp_1',
			},
			{
				id: '1700000005000_tx_0',
				type: 'text',
				xpath: '/html[1]/body[1]/p[4]',
				content: '<p>Fourth paragraph.</p>',
				startOffset: 0,
				endOffset: 17,
			},
		];

		const { currentVariables } = await initializePageContent(
			articleHtml,
			'',
			{},
			'https://example.com/article',
			{},
			articleHtml,
			highlights,
			'Test Article',
			'',
			'',
			'',
			'',
			'',
			'',
			8,
			'en',
			[]
		);

		const parsed = JSON.parse(currentVariables['{{highlights}}']);
		expect(parsed).toEqual([
			{
				text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
				timestamp: new Date(1700000000000).toISOString(),
				notes: ['group note'],
			},
			{
				text: 'Fourth paragraph.',
				timestamp: new Date(1700000005000).toISOString(),
			},
		]);

		const lengthOutput = await compileTemplate(
			0,
			'{{highlights|parse_json|length}}',
			currentVariables,
			'https://example.com/article'
		);
		expect(lengthOutput).toBe('2');
	});
});
