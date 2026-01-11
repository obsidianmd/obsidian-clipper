import { describe, test, expect } from 'vitest';
import { remove_tags } from './remove_tags';

describe('remove_tags filter', () => {
	test('removes specified tags only', () => {
		expect(remove_tags('<p>Hello <b>world</b>!</p>', 'b')).toBe('<p>Hello world!</p>');
	});

	test('removes multiple specified tags', () => {
		// Use comma-separated format for multiple tags
		const result = remove_tags('<p>Hello <b>world</b> <em>test</em>!</p>', 'b, em');
		expect(result).toContain('<p>');
		expect(result).not.toContain('<b>');
		expect(result).not.toContain('<em>');
	});

	test('preserves unspecified tags', () => {
		const result = remove_tags('<div><p><b>text</b></p></div>', 'b');
		expect(result).toContain('<div>');
		expect(result).toContain('<p>');
	});

	test('handles empty string', () => {
		expect(remove_tags('')).toBe('');
	});

	test('handles no matching tags', () => {
		expect(remove_tags('<p>text</p>', 'div')).toBe('<p>text</p>');
	});
});

