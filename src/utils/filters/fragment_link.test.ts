import { describe, test, expect, summary } from './test-utils';
import { fragment_link } from './fragment_link';

describe('fragment_link filter', () => {
	test('creates text fragment link from array', () => {
		const result = fragment_link('["text content"]', 'https://example.com');
		expect(Array.isArray(result)).toBeTrue();
		expect(result[0]).toContain('text content');
		expect(result[0]).toContain('https://example.com');
	});

	test('creates link with custom title', () => {
		const result = fragment_link('["text"]', '"custom title":https://example.com');
		expect(result[0]).toContain('custom title');
	});

	test('encodes text fragment', () => {
		const result = fragment_link('["hello world"]', 'https://example.com');
		expect(result[0]).toContain('#:~:text=');
	});

	test('returns original without URL', () => {
		const result = fragment_link('["text"]');
		expect(result).toEqual(['["text"]']);
	});

	test('handles empty string', () => {
		const result = fragment_link('', 'https://example.com');
		expect(result).toEqual(['']);
	});

	test('handles multiple highlights', () => {
		const result = fragment_link('["first","second"]', 'https://example.com');
		expect(result).toHaveLength(2);
	});
});

summary();
