import { describe, test, expect } from 'vitest';
import { replace, validateReplaceParams } from './replace';

describe('replace filter', () => {
	test('simple replacement', () => {
		expect(replace('hello,world', '",":""')).toBe('helloworld');
	});

	test('replaces all occurrences', () => {
		expect(replace('a,b,c', '",":"-"')).toBe('a-b-c');
	});

	test('removes text with empty replacement', () => {
		expect(replace('hello!', '"!":""')).toBe('hello');
	});

	test('removes percent sign (user issue case)', () => {
		expect(replace('100%', '"%":""')).toBe('100');
	});

	test('multiple replacements applied in order', () => {
		expect(replace('hello world', '"e":"a","o":"0"')).toBe('hall0 w0rld');
	});

	test('regex global replacement', () => {
		expect(replace('hello world', '"/[aeiou]/g":"*"')).toBe('h*ll* w*rld');
	});

	test('regex case-insensitive replacement', () => {
		expect(replace('HELLO world', '"/hello/i":"hi"')).toBe('hi world');
	});

	test('returns original if no params', () => {
		expect(replace('hello')).toBe('hello');
	});

	test('handles empty string input', () => {
		expect(replace('', '"a":"b"')).toBe('');
	});

	test('handles parenthesized params', () => {
		expect(replace('hello', '("e":"a")')).toBe('hallo');
	});

	test('handles special characters in replacement', () => {
		expect(replace('hello:world', '"\\:":"-"')).toBe('hello-world');
	});
});

describe('replace param validation', () => {
	test('valid params return valid', () => {
		expect(validateReplaceParams('"old":"new"').valid).toBe(true);
		expect(validateReplaceParams('"a":"b","c":"d"').valid).toBe(true);
		expect(validateReplaceParams('"/regex/g":"text"').valid).toBe(true);
		expect(validateReplaceParams('"text":').valid).toBe(true);
	});

	test('missing params returns error', () => {
		const result = validateReplaceParams(undefined);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('requires');
	});

	test('unquoted params returns error', () => {
		const result = validateReplaceParams('old:new');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('quoted');
	});

	test('missing colon separator returns error', () => {
		const result = validateReplaceParams('"old""new"');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('quoted');
	});
});

