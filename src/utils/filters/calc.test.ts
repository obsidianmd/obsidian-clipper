import { describe, test, expect, summary } from './test-utils';
import { calc } from './calc';

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

summary();
