import { describe, test, expect, summary } from './test-utils';
import { link } from './link';

describe('link filter', () => {
	test('converts string to markdown link', () => {
		expect(link('https://example.com', 'Example')).toBe('[Example](https://example.com)');
	});

	test('handles URL without link text', () => {
		const result = link('https://example.com');
		expect(result).toContain('https://example.com');
	});

	test('handles array of URLs', () => {
		const result = link('["url1","url2"]', 'Link');
		expect(result).toContain('[Link](url1)');
		expect(result).toContain('[Link](url2)');
	});

	test('handles object with link text values', () => {
		const result = link('{"url1": "Link 1", "url2": "Link 2"}');
		expect(result).toContain('[Link 1](url1)');
		expect(result).toContain('[Link 2](url2)');
	});

	test('handles empty string', () => {
		expect(link('')).toBe('');
	});

	test('escapes special markdown characters', () => {
		const result = link('https://example.com', 'Test [link]');
		expect(result).toContain('Test');
	});
});

summary();
