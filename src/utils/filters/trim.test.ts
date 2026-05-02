import { describe, test, expect } from 'vitest';
import { trim } from './trim';

describe('trim filter', () => {
	test('removes whitespace from both ends', () => {
		expect(trim('  hello world  ')).toBe('hello world');
	});

	test('removes tabs and newlines', () => {
		expect(trim('\n\thello\t\n')).toBe('hello');
	});

	test('handles no whitespace', () => {
		expect(trim('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(trim('')).toBe('');
	});

	test('handles only whitespace', () => {
		expect(trim('   ')).toBe('');
	});

	test('preserves internal whitespace', () => {
		expect(trim('  hello   world  ')).toBe('hello   world');
	});
});

