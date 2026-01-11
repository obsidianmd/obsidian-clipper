import { describe, test, expect } from 'vitest';
import { object } from './object';

describe('object filter', () => {
	test('converts object to array of pairs', () => {
		const result = object('{"a":1,"b":2}', 'array');
		expect(result).toContain('a');
		expect(result).toContain('1');
	});

	test('returns object keys', () => {
		const result = object('{"a":1,"b":2}', 'keys');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['a', 'b']);
	});

	test('returns object values', () => {
		const result = object('{"a":1,"b":2}', 'values');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 2]);
	});

	test('handles empty object', () => {
		const result = object('{}', 'keys');
		expect(result).toBe('[]');
	});

	test('returns original for non-JSON', () => {
		expect(object('hello', 'keys')).toBe('hello');
	});
});

