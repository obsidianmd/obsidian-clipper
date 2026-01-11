import { describe, test, expect } from 'vitest';
import { lower } from './lower';

describe('lower filter', () => {
	test('converts text to lowercase', () => {
		expect(lower('HELLO WORLD')).toBe('hello world');
	});

	test('handles mixed case', () => {
		expect(lower('Hello World')).toBe('hello world');
	});

	test('handles already lowercase', () => {
		expect(lower('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(lower('')).toBe('');
	});

	test('preserves numbers and special characters', () => {
		expect(lower('HELLO123!')).toBe('hello123!');
	});
});

