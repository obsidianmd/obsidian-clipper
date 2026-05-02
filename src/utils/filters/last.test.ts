import { describe, test, expect } from 'vitest';
import { last } from './last';

describe('last filter', () => {
	test('returns last element of array', () => {
		expect(last('["a","b","c"]')).toBe('c');
	});

	test('returns input if not array', () => {
		expect(last('hello')).toBe('hello');
	});

	test('handles single element array', () => {
		expect(last('["only"]')).toBe('only');
	});

	test('handles array of numbers', () => {
		expect(last('[1,2,3]')).toBe('3');
	});

	test('handles empty array', () => {
		// Empty array returns the input string as-is
		expect(last('[]')).toBe('[]');
	});
});

