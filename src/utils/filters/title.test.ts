import { describe, test, expect, summary } from './test-utils';
import { title } from './title';

describe('title filter', () => {
	test('converts text to Title Case', () => {
		expect(title('hello world')).toBe('Hello World');
	});

	test('handles already title case', () => {
		expect(title('Hello World')).toBe('Hello World');
	});

	test('handles uppercase text', () => {
		expect(title('HELLO WORLD')).toBe('Hello World');
	});

	test('handles single word', () => {
		expect(title('hello')).toBe('Hello');
	});

	test('handles empty string', () => {
		expect(title('')).toBe('');
	});

	test('handles multiple spaces', () => {
		const result = title('hello   world');
		expect(result).toContain('Hello');
		expect(result).toContain('World');
	});
});

summary();
