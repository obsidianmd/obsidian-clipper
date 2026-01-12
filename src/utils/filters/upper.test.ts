import { describe, test, expect } from 'vitest';
import { upper } from './upper';

describe('upper filter', () => {
	test('converts text to uppercase', () => {
		expect(upper('hello world')).toBe('HELLO WORLD');
	});

	test('handles mixed case', () => {
		expect(upper('Hello World')).toBe('HELLO WORLD');
	});

	test('handles already uppercase', () => {
		expect(upper('HELLO')).toBe('HELLO');
	});

	test('handles empty string', () => {
		expect(upper('')).toBe('');
	});

	test('preserves numbers and special characters', () => {
		expect(upper('hello123!')).toBe('HELLO123!');
	});
});

