import { describe, test, expect } from 'vitest';
import { capitalize } from './capitalize';

describe('capitalize filter', () => {
	test('capitalizes first character and lowercases rest', () => {
		expect(capitalize('hELLO wORLD')).toBe('Hello world');
	});

	test('handles already capitalized string', () => {
		expect(capitalize('Hello')).toBe('Hello');
	});

	test('handles lowercase string', () => {
		expect(capitalize('hello')).toBe('Hello');
	});

	test('handles uppercase string', () => {
		expect(capitalize('HELLO')).toBe('Hello');
	});

	test('handles empty string', () => {
		expect(capitalize('')).toBe('');
	});

	test('handles single character', () => {
		expect(capitalize('h')).toBe('H');
	});
});

