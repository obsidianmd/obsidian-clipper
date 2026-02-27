import { describe, test, expect } from 'vitest';
import { merge } from './merge';

describe('merge filter', () => {
	test('adds values to array', () => {
		const result = merge('["a","b"]', '"c","d"');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c', 'd']);
	});

	test('adds single value', () => {
		const result = merge('["a","b"]', '"c"');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c']);
	});

	test('creates array from non-array', () => {
		// When input is a JSON string (not array), it wraps the original input string in array
		const result = merge('"a"', '"b","c"');
		const parsed = JSON.parse(result);
		// Note: the original string '"a"' (with quotes) is kept as first element
		expect(parsed).toEqual(['"a"', 'b', 'c']);
	});

	test('handles empty array', () => {
		const result = merge('[]', '"a"');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a']);
	});

	test('handles parenthesized params', () => {
		const result = merge('["a"]', '("b","c")');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c']);
	});
});

