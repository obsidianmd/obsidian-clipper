import { describe, test, expect } from 'vitest';
import { normalizeUrlForMatching } from './string-utils';

describe('normalizeUrlForMatching', () => {
	test('removes query and hash parameters', () => {
		const result = normalizeUrlForMatching('https://example.com/docs/page?utm=abc#section-1');
		expect(result).toBe('https://example.com/docs/page');
	});

	test('removes text fragment hashes', () => {
		const result = normalizeUrlForMatching('https://example.com/article#:~:text=important%20sentence');
		expect(result).toBe('https://example.com/article');
	});

	test('keeps base url unchanged when no query/hash exists', () => {
		const result = normalizeUrlForMatching('https://example.com/path/to/page');
		expect(result).toBe('https://example.com/path/to/page');
	});

	test('returns original value for invalid URLs', () => {
		const result = normalizeUrlForMatching('not a valid url');
		expect(result).toBe('not a valid url');
	});
});
