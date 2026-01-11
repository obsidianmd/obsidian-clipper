import { describe, test, expect } from 'vitest';
import { calc, validateCalcParams } from './calc';

describe('calc filter', () => {
	test('addition', () => {
		expect(calc('5', '+10')).toBe('15');
	});

	test('subtraction', () => {
		expect(calc('10', '-3')).toBe('7');
	});

	test('multiplication', () => {
		expect(calc('5', '*3')).toBe('15');
	});

	test('division', () => {
		expect(calc('10', '/2')).toBe('5');
	});

	test('exponentiation with **', () => {
		expect(calc('2', '**3')).toBe('8');
	});

	test('exponentiation with ^', () => {
		expect(calc('2', '^3')).toBe('8');
	});

	test('returns original for non-numbers', () => {
		expect(calc('hello', '+10')).toBe('hello');
	});

	test('handles decimal numbers', () => {
		expect(calc('5.5', '+2.5')).toBe('8');
	});

	test('handles negative numbers', () => {
		expect(calc('-5', '+10')).toBe('5');
	});

	test('returns original without params', () => {
		expect(calc('5')).toBe('5');
	});
});

describe('calc param validation', () => {
	test('valid params return valid', () => {
		expect(validateCalcParams('+10').valid).toBe(true);
		expect(validateCalcParams('-5').valid).toBe(true);
		expect(validateCalcParams('*2').valid).toBe(true);
		expect(validateCalcParams('/3').valid).toBe(true);
		expect(validateCalcParams('**2').valid).toBe(true);
		expect(validateCalcParams('^3').valid).toBe(true);
		expect(validateCalcParams('"+10"').valid).toBe(true);
	});

	test('missing params returns error', () => {
		const result = validateCalcParams(undefined);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('requires');
	});

	test('invalid operator returns error', () => {
		const result = validateCalcParams('%5');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('invalid operator');
	});

	test('missing number returns error', () => {
		const result = validateCalcParams('+');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('number');
	});

	test('non-numeric value returns error', () => {
		const result = validateCalcParams('+abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('number');
	});
});

