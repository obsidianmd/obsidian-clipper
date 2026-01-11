import { describe, test, expect } from 'vitest';
import { date_modify } from './date_modify';

describe('date_modify filter', () => {
	test('adds years', () => {
		const result = date_modify('2024-12-01', '+1 year');
		expect(result).toContain('2025');
	});

	test('subtracts months', () => {
		const result = date_modify('2024-12-01', '-2 months');
		expect(result).toContain('2024-10');
	});

	test('adds days', () => {
		const result = date_modify('2024-12-01', '+5 days');
		expect(result).toContain('2024-12-06');
	});

	test('subtracts weeks', () => {
		const result = date_modify('2024-12-15', '-1 week');
		expect(result).toContain('2024-12-08');
	});

	test('handles hours', () => {
		// Adding hours won't change the date unless it crosses midnight
		// Output format is YYYY-MM-DD, so hours aren't visible
		const result = date_modify('2024-12-01T22:00:00', '+4 hours');
		expect(result).toContain('2024-12-02');
	});

	test('returns original without params', () => {
		const result = date_modify('2024-12-01');
		expect(result).toContain('2024');
	});
});

