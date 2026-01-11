import { describe, test, expect } from 'vitest';
import { snake } from './snake';

describe('snake filter', () => {
	test('converts Title Case to snake_case', () => {
		expect(snake('Hello World')).toBe('hello_world');
	});

	test('converts camelCase to snake_case', () => {
		expect(snake('helloWorld')).toBe('hello_world');
	});

	test('converts PascalCase to snake_case', () => {
		expect(snake('HelloWorld')).toBe('hello_world');
	});

	test('converts kebab-case to snake_case', () => {
		expect(snake('hello-world')).toBe('hello_world');
	});

	test('handles single word', () => {
		expect(snake('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(snake('')).toBe('');
	});
});

