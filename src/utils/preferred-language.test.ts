// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import Defuddle from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { getPreferredLanguage } from './preferred-language';

afterEach(() => vi.unstubAllGlobals());

describe('preferred extraction language', () => {
	test('browser language takes precedence over the source document', () => {
		vi.stubGlobal('navigator', { language: 'ja-JP' });
		const doc = new DOMParser().parseFromString('<html lang="en"></html>', 'text/html');
		expect(getPreferredLanguage(doc)).toBe('ja-JP');
	});

	test.each([undefined, { language: '' }])('falls back to the source document without a browser language (%j)', nav => {
		vi.stubGlobal('navigator', nav);
		const doc = new DOMParser().parseFromString('<html lang="ja"></html>', 'text/html');
		expect(getPreferredLanguage(doc)).toBe('ja');
		expect(getPreferredLanguage()).toBeUndefined();
		expect(getPreferredLanguage(new DOMParser().parseFromString('<html></html>', 'text/html'))).toBeUndefined();
	});

	// Synthetic network responses test the installed Defuddle implementation;
	// these are not evidence of a successful live YouTube clip.
	test.each([
		{ tracks: ['en-US', 'ja-JP'], preferred: undefined, expected: 'en-US' },
		{ tracks: ['en-US', 'ja-JP'], preferred: 'ja-JP', expected: 'ja-JP' },
		{ tracks: ['en-US', 'ja-JP'], preferred: 'ja', expected: 'ja-JP' },
		{ tracks: ['en-US'], preferred: 'ja-JP', expected: 'en-US' },
		{ tracks: ['ja-JP'], preferred: 'ja-JP', expected: 'ja-JP' },
		{ tracks: ['en', 'de', 'fr'], preferred: 'fr-FR', expected: 'fr' },
		{ tracks: ['fr', 'en', 'de'], preferred: 'fr-FR', expected: 'fr' },
		{ tracks: ['en', 'fr', 'de', 'ko'], preferred: 'ko-KR', expected: 'ko' },
		{ tracks: ['ja', 'fr', 'en-US'], preferred: 'en-US', expected: 'en-US' },
		{ tracks: ['en', 'pt-PT', 'pt-BR'], preferred: 'pt-BR', expected: 'pt-BR' },
		{ tracks: ['en', 'pt-BR', 'pt-PT'], preferred: 'pt-PT', expected: 'pt-PT' },
		{ tracks: ['en', 'fr-FR', 'de'], preferred: 'fr', expected: 'fr-FR' },
		{ tracks: ['en', 'fr-FR', 'de'], preferred: 'fr-fr', expected: 'fr-FR' },
		{ tracks: ['en', 'zh-Hans', 'zh-Hant'], preferred: 'zh-Hant', expected: 'zh-Hant' },
		{ tracks: ['de', 'en', 'ja'], preferred: 'fr-FR', expected: 'en' },
		{ tracks: ['de', 'ja', 'ko'], preferred: 'fr-FR', expected: 'de' },
	])('extracts the expected transcript: $tracks / $preferred', async ({ tracks, preferred, expected }) => {
		vi.stubGlobal('navigator', { language: preferred });
		const url = 'https://www.youtube.com/watch?v=fixture0001';
		const doc = new DOMParser().parseFromString('<html><head><title>Fixture</title></head><body></body></html>', 'text/html');
		const transcriptFor = (language: string) => `Transcript for ${language}.`;
		const fetchFixture = vi.fn(async (input: RequestInfo | URL) => {
			const request = String(input);
			if (request.includes('/player?')) return new Response(JSON.stringify({
				videoDetails: { videoId: 'fixture0001' },
				captions: { playerCaptionsTracklistRenderer: { captionTracks: tracks.map(languageCode => ({
					languageCode, baseUrl: `https://www.youtube.com/api/timedtext?lang=${languageCode}`,
				})) } },
			}));
			if (request.includes('/timedtext?')) {
				const language = new URL(request).searchParams.get('lang');
				if (!language || !tracks.includes(language)) throw new Error(`Unexpected caption track: ${language}`);
				return new Response(`<transcript><text start="0" dur="3">${transcriptFor(language)}</text></transcript>`);
			}
			if (request.includes('/next?')) return new Response('{}');
			throw new Error(`Unexpected fixture request: ${request}`);
		});
		const result = await new Defuddle(doc, { url, language: getPreferredLanguage(doc), fetch: fetchFixture }).parseAsync();
		const variables = JSON.stringify(result.variables);
		expect(variables).toContain(transcriptFor(expected));
		for (const other of tracks.filter(track => track !== expected)) {
			expect(variables).not.toContain(transcriptFor(other));
		}
		const requestedLanguages = fetchFixture.mock.calls
			.map(([request]) => new URL(String(request)))
			.filter(request => request.pathname === '/api/timedtext')
			.map(request => request.searchParams.get('lang'));
		expect(requestedLanguages.length).toBeGreaterThan(0);
		expect(new Set(requestedLanguages)).toEqual(new Set([expected]));
	});

	test('preserves article metadata, content, and Markdown', () => {
		vi.stubGlobal('navigator', { language: 'ja-JP' });
		const html = '<html lang="en"><head><title>Example article</title><meta name="author" content="Example Author"></head><body><article><h1>Example article</h1><p>' + 'This is an article with useful details and a <strong>bold phrase</strong>. '.repeat(20) + '</p></article></body></html>';
		const parse = (language?: string) => new Defuddle(new DOMParser().parseFromString(html, 'text/html'), { url: 'https://example.com/article', language }).parse();
		const before = parse();
		const after = parse(getPreferredLanguage());
		expect(after.title).toBe('Example article');
		expect(after.author).toBe('Example Author');
		expect(after.content).toBe(before.content);
		expect(createMarkdownContent(after.content, 'https://example.com/article')).toBe(createMarkdownContent(before.content, 'https://example.com/article'));
	});
});
