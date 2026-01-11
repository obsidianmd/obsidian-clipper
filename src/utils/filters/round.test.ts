import { describe, test, expect } from 'vitest';
import { round } from './round';

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

