import { describe, test, expect, summary } from './test-utils';
import { uncamel } from './uncamel';

describe('uncamel filter', () => {
	test('converts camelCase to space-separated', () => {
		expect(uncamel('camelCase')).toBe('camel case');
	});

	test('converts PascalCase to space-separated', () => {
		expect(uncamel('PascalCase')).toBe('pascal case');
	});

	test('handles multiple capitals', () => {
		// Consecutive capitals stay together until followed by lowercase
		expect(uncamel('myHTMLParser')).toBe('my html parser');
	});

	test('handles single word', () => {
		expect(uncamel('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(uncamel('')).toBe('');
	});

	test('handles already separated', () => {
		expect(uncamel('hello world')).toBe('hello world');
	});
});

summary();
