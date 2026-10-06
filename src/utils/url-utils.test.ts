import { describe, expect, it } from 'vitest';
import { normalizeUrl, resolveFaviconUrl } from './url-utils';

describe('resolveFaviconUrl', () => {
	it('resolves relative favicons against the live document base URI', () => {
		expect(resolveFaviconUrl('icons/icon.png', 'https://example.com/assets/'))
			.toBe('https://example.com/assets/icons/icon.png');
	});

	it('keeps a missing favicon empty', () => {
		expect(resolveFaviconUrl('', 'https://example.com/page')).toBe('');
	});

	it('preserves data URLs', () => {
		const favicon = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
		expect(resolveFaviconUrl(favicon, 'https://example.com/page')).toBe(favicon);
	});

	it('falls back to the page URL when the HTML base is invalid', () => {
		expect(resolveFaviconUrl('/icon.png', 'https://example.com/page', 'https://['))
			.toBe('https://example.com/icon.png');
	});

	it('does not fail clipping when the favicon URL is invalid', () => {
		expect(resolveFaviconUrl('https://[', 'https://example.com/page')).toBe('https://[');
	});
});

describe('normalizeUrl', () => {
	it('removes fragments and ephemeral query parameters', () => {
		expect(normalizeUrl('https://example.com/page?keep=yes&utm_source=news#section'))
			.toBe('https://example.com/page?keep=yes');
	});

	it('preserves non-ephemeral query parameters', () => {
		expect(normalizeUrl('https://example.com/page?q=clipper&lang=en'))
			.toBe('https://example.com/page?q=clipper&lang=en');
	});

	it('returns invalid URLs unchanged', () => {
		expect(normalizeUrl('not a url')).toBe('not a url');
	});
});
