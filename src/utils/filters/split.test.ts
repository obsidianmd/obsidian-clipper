import { describe, test, expect } from 'vitest';
import { split } from './split';

describe('split filter', () => {
	test('splits string by comma', () => {
		const result = split('a,b,c', ',');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c']);
	});

	test('splits string by space', () => {
		const result = split('hello world', ' ');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['hello', 'world']);
	});

	test('splits into characters without separator', () => {
		const result = split('abc');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c']);
	});

	test('handles empty string', () => {
		const result = split('');
		expect(result).toBe('[]');
	});

	test('splits by regex', () => {
		// Regex split includes trailing empty string when pattern matches at end
		const result = split('a1b2c3', '[0-9]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b', 'c', '']);
	});

	test('handles no matches', () => {
		const result = split('hello', ',');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['hello']);
	});
});

