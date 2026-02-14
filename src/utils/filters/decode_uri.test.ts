import { describe, test, expect } from 'vitest';
import { decode_uri } from './decode_uri';

describe('decode_uri filter', () => {
	test('decodes URL-encoded Chinese text', () => {
		expect(decode_uri('%E8%BF%99%E6%9C%9F%E5%92%B1%E4%BB%AC')).toBe('这期咱们');
	});

	test('decodes URL-encoded special characters', () => {
		expect(decode_uri('hello%20world')).toBe('hello world');
		expect(decode_uri('%26%3D%3F')).toBe('&=?');
	});

	test('handles already decoded text', () => {
		expect(decode_uri('hello world')).toBe('hello world');
		expect(decode_uri('这期咱们')).toBe('这期咱们');
	});

	test('handles empty string', () => {
		expect(decode_uri('')).toBe('');
	});

	test('handles mixed encoded and plain text', () => {
		expect(decode_uri('Hello%20%E4%B8%96%E7%95%8C')).toBe('Hello 世界');
	});

	test('returns original string for malformed URI', () => {
		expect(decode_uri('%E0%A4%A')).toBe('%E0%A4%A');
		expect(decode_uri('%')).toBe('%');
		expect(decode_uri('%ZZ')).toBe('%ZZ');
	});
});
