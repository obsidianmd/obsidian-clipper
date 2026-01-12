import { describe, test, expect } from 'vitest';
import { number_format } from './number_format';

describe('number_format filter', () => {
	test('formats number with thousands separator', () => {
		expect(number_format('1000')).toBe('1,000');
	});

	test('formats large numbers', () => {
		expect(number_format('1234567')).toBe('1,234,567');
	});

	test('formats with decimal places', () => {
		expect(number_format('1234567.89', '2')).toBe('1,234,567.89');
	});

	test('handles small numbers', () => {
		expect(number_format('123')).toBe('123');
	});

	test('handles zero', () => {
		expect(number_format('0')).toBe('0');
	});

	test('returns original for non-numbers', () => {
		expect(number_format('hello')).toBe('hello');
	});

	test('handles negative numbers', () => {
		expect(number_format('-1234567')).toBe('-1,234,567');
	});
});

