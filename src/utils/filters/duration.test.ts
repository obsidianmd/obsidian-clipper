import { describe, test, expect } from 'vitest';
import { duration } from './duration';

describe('duration filter', () => {
	test('normalizes PT1868S with custom format', () => {
		const result = duration('PT1868S', 'H:mm:ss');
		expect(result).toBe('0:31:08');
	});

	test('normalizes PT60M to hours', () => {
		const result = duration('PT60M');
		expect(result).toBe('01:00:00');
	});

	test('normalizes PT80M to hours and minutes', () => {
		const result = duration('PT80M');
		expect(result).toBe('01:20:00');
	});

	test('formats ISO duration with custom format', () => {
		const result = duration('PT1H30M', 'HH:mm:ss');
		expect(result).toBe('01:30:00');
	});

	test('uses default format over 1 hour', () => {
		const result = duration('PT1H30M');
		expect(result).toBe('01:30:00');
	});

	test('uses short format under 1 hour', () => {
		const result = duration('PT30M');
		expect(result).toBe('30:00');
	});

	test('formats PT5M30S correctly', () => {
		const result = duration('PT5M30S');
		expect(result).toBe('05:30');
	});

	test('formats seconds with custom format', () => {
		const result = duration('3665', 'H:mm:ss');
		expect(result).toBe('1:01:05');
	});

	test('normalizes PT6702S correctly', () => {
		// PT6702S = 6702 seconds = 1h 51m 42s
		// After normalization fix, this should properly convert
		const result = duration('PT6702S', 'HH:mm:ss');
		expect(result).toBe('01:51:42');
	});

	test('handles plain seconds', () => {
		const result = duration('90', 'mm:ss');
		expect(result).toBe('01:30');
	});

	test('handles zero', () => {
		const result = duration('0', 'mm:ss');
		expect(result).toBe('00:00');
	});

	test('returns invalid string as-is', () => {
		const result = duration('invalid');
		expect(result).toBe('invalid');
	});
});
