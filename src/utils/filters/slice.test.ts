import { describe, test, expect, summary } from './test-utils';
import { slice } from './slice';

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

summary();
