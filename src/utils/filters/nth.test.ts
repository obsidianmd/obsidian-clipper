import { describe, test, expect } from 'vitest';
import { nth, validateNthParams } from './nth';

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

describe('nth param validation', () => {
	test('no param is valid (optional)', () => {
		expect(validateNthParams(undefined).valid).toBe(true);
	});

	test('valid params return valid', () => {
		expect(validateNthParams('3').valid).toBe(true);
		expect(validateNthParams('5n').valid).toBe(true);
		expect(validateNthParams('n+7').valid).toBe(true);
		expect(validateNthParams('1,2,3:5').valid).toBe(true);
	});

	test('invalid syntax returns error', () => {
		const result = validateNthParams('abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('invalid syntax');
	});

	test('invalid basis pattern returns error', () => {
		const result = validateNthParams('1,2:abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('basis');
	});
});

