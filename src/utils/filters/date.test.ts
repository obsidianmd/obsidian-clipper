import { describe, test, expect, summary } from './test-utils';
import { date } from './date';

describe('date filter', () => {
	test('formats date with specified format', () => {
		const result = date('2024-12-01', 'YYYY-MM-DD');
		expect(result).toBe('2024-12-01');
	});

	test('converts date format with input format', () => {
		const result = date('12/01/2024', '("YYYY-MM-DD", "MM/DD/YYYY")');
		expect(result).toBe('2024-12-01');
	});

	test('formats with different output format', () => {
		const result = date('2024-12-01', 'DD/MM/YYYY');
		expect(result).toBe('01/12/2024');
	});

	test('handles year only', () => {
		const result = date('2024-12-01', 'YYYY');
		expect(result).toBe('2024');
	});

	test('handles month name', () => {
		const result = date('2024-12-01', 'MMMM');
		expect(result).toBe('December');
	});

	test('handles empty string', () => {
		const result = date('');
		expect(result).toBe('Invalid Date');
	});
});

summary();
