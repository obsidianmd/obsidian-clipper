import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './url-utils';

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
