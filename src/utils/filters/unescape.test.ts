import { describe, test, expect, summary } from './test-utils';
import { unescape } from './unescape';

describe('unescape filter', () => {
	test('unescapes escaped quotes', () => {
		expect(unescape('\\"hello\\"')).toBe('"hello"');
	});

	test('unescapes escaped newlines', () => {
		expect(unescape('line1\\nline2')).toBe('line1\nline2');
	});

	test('handles no escapes', () => {
		expect(unescape('plain text')).toBe('plain text');
	});

	test('handles empty string', () => {
		expect(unescape('')).toBe('');
	});

	test('handles multiple escapes', () => {
		expect(unescape('\\"one\\"\\n\\"two\\"')).toBe('"one"\n"two"');
	});
});

summary();
