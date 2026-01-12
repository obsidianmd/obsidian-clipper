import { describe, test, expect } from 'vitest';
import { unique } from './unique';

describe('unique filter', () => {
	test('removes duplicates from array of primitives', () => {
		const result = unique('[1,2,2,3,3]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 2, 3]);
	});

	test('removes duplicates from string array', () => {
		const result = unique('["a","b","a","c","b"]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c']);
	});

	test('removes duplicate objects', () => {
		const result = unique('[{"a":1},{"b":2},{"a":1}]');
		const parsed = JSON.parse(result);
		expect(parsed).toHaveLength(2);
	});

	test('handles empty array', () => {
		expect(unique('[]')).toBe('[]');
	});

	test('handles single element', () => {
		const result = unique('["only"]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['only']);
	});

	test('returns original for non-JSON', () => {
		expect(unique('hello')).toBe('hello');
	});
});

