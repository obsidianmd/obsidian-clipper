import { describe, test, expect } from 'vitest';
import { strip_tags } from './strip_tags';

describe('strip_tags filter', () => {
	test('removes all HTML tags', () => {
		expect(strip_tags('<p>Hello <b>world</b>!</p>')).toBe('Hello world!');
	});

	test('keeps specified tags', () => {
		const result = strip_tags('<p>Hello <b>world</b>!</p>', 'b');
		expect(result).toBe('Hello <b>world</b>!');
	});

	test('keeps multiple specified tags', () => {
		// Use comma-separated format without parentheses/quotes for multiple tags
		const result = strip_tags('<p>Hello <b>world</b> <em>test</em>!</p>', 'b, em');
		expect(result).toContain('<b>');
		expect(result).toContain('<em>');
	});

	test('handles nested tags', () => {
		expect(strip_tags('<div><p>text</p></div>')).toBe('text');
	});

	test('handles empty string', () => {
		expect(strip_tags('')).toBe('');
	});

	test('handles no tags', () => {
		expect(strip_tags('plain text')).toBe('plain text');
	});

	test('handles self-closing tags', () => {
		expect(strip_tags('before<br/>after')).toBe('beforeafter');
	});
});

