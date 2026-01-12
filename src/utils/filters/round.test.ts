import { describe, test, expect } from 'vitest';
import { round, validateRoundParams } from './round';

describe('round filter', () => {
	test('rounds to nearest integer by default', () => {
		expect(round('3.7')).toBe('4');
		expect(round('3.2')).toBe('3');
	});

	test('rounds to specified decimal places', () => {
		expect(round('3.14159', '2')).toBe('3.14');
	});

	test('rounds up at midpoint', () => {
		expect(round('3.5')).toBe('4');
	});

	test('handles negative numbers', () => {
		expect(round('-3.7')).toBe('-4');
	});

	test('handles integers', () => {
		expect(round('5')).toBe('5');
	});

	test('returns original for non-numbers', () => {
		expect(round('hello')).toBe('hello');
	});

	test('handles zero decimal places', () => {
		expect(round('3.14159', '0')).toBe('3');
	});
});

describe('round param validation', () => {
	test('no param is valid (optional)', () => {
		expect(validateRoundParams(undefined).valid).toBe(true);
	});

	test('valid params return valid', () => {
		expect(validateRoundParams('0').valid).toBe(true);
		expect(validateRoundParams('2').valid).toBe(true);
		expect(validateRoundParams('10').valid).toBe(true);
	});

	test('non-numeric param returns error', () => {
		const result = validateRoundParams('abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('must be a number');
	});

	test('negative param returns error', () => {
		const result = validateRoundParams('-2');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('non-negative');
	});
});

