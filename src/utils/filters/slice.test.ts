import { describe, test, expect } from 'vitest';
import { slice, validateSliceParams } from './slice';

describe('slice filter', () => {
	test('extracts portion of string', () => {
		expect(slice('hello', '1,4')).toBe('ell');
	});

	test('extracts portion of array', () => {
		const result = slice('["a","b","c","d"]', '1,3');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['b', 'c']);
	});

	test('slices from index to end with single param', () => {
		expect(slice('hello', '2')).toBe('llo');
	});

	test('handles negative index', () => {
		expect(slice('hello', '-3')).toBe('llo');
	});

	test('handles negative second parameter', () => {
		expect(slice('hello', '0,-2')).toBe('hel');
	});

	test('returns original without params', () => {
		expect(slice('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(slice('', '0,5')).toBe('');
	});

	test('handles array slice', () => {
		const result = slice('[1,2,3,4,5]', '1,4');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([2, 3, 4]);
	});
});

describe('slice param validation', () => {
	test('valid params return valid', () => {
		expect(validateSliceParams('0,5').valid).toBe(true);
		expect(validateSliceParams('0').valid).toBe(true);
		expect(validateSliceParams('-3').valid).toBe(true);
		expect(validateSliceParams('1,-1').valid).toBe(true);
	});

	test('missing params returns error', () => {
		const result = validateSliceParams(undefined);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('requires');
	});

	test('non-numeric params returns error', () => {
		const result = validateSliceParams('abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('not a valid number');
	});

	test('too many params returns error', () => {
		const result = validateSliceParams('1,2,3');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('at most 2');
	});
});

