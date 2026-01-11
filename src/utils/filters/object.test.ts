import { describe, test, expect } from 'vitest';
import { object, validateObjectParams } from './object';

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

describe('object param validation', () => {
	test('missing param returns error', () => {
		const result = validateObjectParams(undefined);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('requires a parameter');
	});

	test('valid params return valid', () => {
		expect(validateObjectParams('array').valid).toBe(true);
		expect(validateObjectParams('keys').valid).toBe(true);
		expect(validateObjectParams('values').valid).toBe(true);
	});

	test('invalid param returns error', () => {
		const result = validateObjectParams('entries');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('invalid parameter');
	});
});

