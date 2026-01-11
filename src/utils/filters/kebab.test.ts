import { describe, test, expect, summary } from './test-utils';
import { kebab } from './kebab';

describe('kebab filter', () => {
	test('converts Title Case to kebab-case', () => {
		expect(kebab('Hello World')).toBe('hello-world');
	});

	test('converts camelCase to kebab-case', () => {
		expect(kebab('helloWorld')).toBe('hello-world');
	});

	test('converts PascalCase to kebab-case', () => {
		expect(kebab('HelloWorld')).toBe('hello-world');
	});

	test('converts snake_case to kebab-case', () => {
		expect(kebab('hello_world')).toBe('hello-world');
	});

	test('handles single word', () => {
		expect(kebab('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(kebab('')).toBe('');
	});
});

summary();
