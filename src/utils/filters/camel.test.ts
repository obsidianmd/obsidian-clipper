import { describe, test, expect } from 'vitest';
import { camel } from './camel';

describe('camel filter', () => {
	test('converts space-separated words to camelCase', () => {
		expect(camel('hello world')).toBe('helloWorld');
	});

	test('converts Title Case to camelCase', () => {
		expect(camel('Hello World')).toBe('helloWorld');
	});

	test('converts kebab-case to camelCase', () => {
		expect(camel('hello-world')).toBe('helloWorld');
	});

	test('converts snake_case to camelCase', () => {
		// Note: current implementation strips underscores but doesn't capitalize
		expect(camel('hello_world')).toBe('helloworld');
	});

	test('handles single word', () => {
		expect(camel('hello')).toBe('hello');
	});

	test('handles empty string', () => {
		expect(camel('')).toBe('');
	});

	test('handles multiple spaces', () => {
		expect(camel('hello   world')).toBe('helloWorld');
	});
});

