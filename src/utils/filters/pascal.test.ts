import { describe, test, expect } from 'vitest';
import { pascal } from './pascal';

describe('pascal filter', () => {
	test('converts space-separated words to PascalCase', () => {
		expect(pascal('hello world')).toBe('HelloWorld');
	});

	test('converts kebab-case to PascalCase', () => {
		expect(pascal('hello-world')).toBe('HelloWorld');
	});

	test('converts snake_case to PascalCase', () => {
		expect(pascal('hello_world')).toBe('HelloWorld');
	});

	test('converts camelCase to PascalCase', () => {
		expect(pascal('helloWorld')).toBe('HelloWorld');
	});

	test('handles single word', () => {
		expect(pascal('hello')).toBe('Hello');
	});

	test('handles empty string', () => {
		expect(pascal('')).toBe('');
	});
});

