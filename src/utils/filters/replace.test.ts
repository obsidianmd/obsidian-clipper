import { describe, expect, test } from 'vitest';
import { applyFilters } from '../filters';
import { replace } from './replace';

describe('replace filter', () => {
	test('simple replacement', () => {
		expect(replace('hello,world', '",":""')).toBe('helloworld');
	});

	test('regex global replacement', () => {
		expect(replace('hello world', '"/[aeiou]/g":"*"')).toBe('h*ll* w*rld');
	});

	// Issue #589: capture-group replacements must not fall back to the original
	// input when the pattern does not match (JS default for String.replace).
	test('returns empty string when group-ref replacement has no match', () => {
		expect(
			replace(
				'Some text without the marker',
				'"/.*Pronunciation:(.*?)(\\n.*){1,}/gms":"$1"',
			),
		).toBe('');
	});

	test('returns empty string for simple group extract with no match', () => {
		expect(replace('hello world', '"/foo:(.*)/":"$1"')).toBe('');
	});

	test('extracts group when pattern matches', () => {
		expect(
			replace(
				'word\nPronunciation: alpha\nmore',
				'"/.*Pronunciation:(.*?)(\\n.*){1,}/gms":"$1"',
			),
		).toBe(' alpha');
	});

	test('literal replacement still returns original when no match', () => {
		expect(replace('hello world', '"/xyz/g":"nope"')).toBe('hello world');
	});

	test('matched group equal to the input is not treated as a miss', () => {
		expect(replace('hello', '"/(hello)/":"$1"')).toBe('hello');
	});
});

describe('replace filter via applyFilters', () => {
	test('returns empty string when group-ref replacement has no match', () => {
		expect(
			applyFilters(
				'Some text without the marker',
				'replace:"/.*Pronunciation:(.*?)(\\n.*){1,}/gms":"$1"',
			),
		).toBe('');
	});

	test('literal replacement still returns original when no match', () => {
		expect(applyFilters('hello world', 'replace:"/xyz/g":"nope"')).toBe('hello world');
	});
});
