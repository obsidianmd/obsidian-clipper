import { describe, test, expect } from 'vitest';
import { join } from './join';

describe('join filter', () => {
	test('combines array elements with comma by default', () => {
		expect(join('["a","b","c"]')).toBe('a,b,c');
	});

	test('joins with custom separator', () => {
		expect(join('["a","b","c"]', ' ')).toBe('a b c');
	});

	test('joins with newline separator', () => {
		expect(join('["a","b"]', '\\n')).toBe('a\nb');
	});

	test('handles single element', () => {
		expect(join('["only"]')).toBe('only');
	});

	test('handles empty array', () => {
		expect(join('[]')).toBe('');
	});

	test('returns original for non-JSON', () => {
		expect(join('hello')).toBe('hello');
	});

	test('joins with dash separator', () => {
		expect(join('["a","b","c"]', '-')).toBe('a-b-c');
	});

	test('joins with quoted newline separator', () => {
		// When the renderer wraps actual newlines in quotes
		expect(join('["a","b"]', '"\n\n"')).toBe('a\n\nb');
	});
});

