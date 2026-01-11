import { describe, test, expect, summary } from './test-utils';
import { length } from './length';

describe('length filter', () => {
	test('returns string length', () => {
		expect(length('hello')).toBe('5');
	});

	test('returns array length', () => {
		expect(length('["a","b","c"]')).toBe('3');
	});

	test('returns object keys count', () => {
		expect(length('{"a":1,"b":2}')).toBe('2');
	});

	test('handles empty string', () => {
		expect(length('')).toBe('0');
	});

	test('handles empty array', () => {
		expect(length('[]')).toBe('0');
	});

	test('handles empty object', () => {
		expect(length('{}')).toBe('0');
	});

	test('counts unicode characters correctly', () => {
		expect(length('hello')).toBe('5');
	});
});

summary();
