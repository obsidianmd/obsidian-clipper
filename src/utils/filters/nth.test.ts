import { describe, test, expect, summary } from './test-utils';
import { nth } from './nth';

describe('nth filter', () => {
	test('keeps nth element (1-based)', () => {
		const result = nth('["a","b","c","d","e"]', '3');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['c']);
	});

	test('keeps every nth element', () => {
		const result = nth('["a","b","c","d","e","f"]', '2n');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['b', 'd', 'f']);
	});

	test('keeps nth and following (n+offset)', () => {
		const result = nth('["a","b","c","d","e"]', 'n+3');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['c', 'd', 'e']);
	});

	test('handles group pattern', () => {
		const result = nth('[1,2,3,4,5,6,7,8,9,10]', '1,2,3:5');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 2, 3, 6, 7, 8]);
	});

	test('handles empty array', () => {
		const result = nth('[]', '3');
		expect(result).toBe('[]');
	});

	test('returns original for non-JSON', () => {
		expect(nth('hello', '3')).toBe('hello');
	});
});

summary();
