import { describe, test, expect, summary } from './test-utils';
import { first } from './first';

describe('first filter', () => {
	test('returns first element of array', () => {
		expect(first('["a","b","c"]')).toBe('a');
	});

	test('returns input if not array', () => {
		expect(first('hello')).toBe('hello');
	});

	test('handles single element array', () => {
		expect(first('["only"]')).toBe('only');
	});

	test('handles array of numbers', () => {
		expect(first('[1,2,3]')).toBe('1');
	});

	test('handles empty array', () => {
		// Empty array returns the input string as-is
		expect(first('[]')).toBe('[]');
	});

	test('handles array of objects', () => {
		// Object.toString() returns "[object Object]"
		const result = first('[{"a":1},{"b":2}]');
		expect(result).toBe('[object Object]');
	});
});

summary();
