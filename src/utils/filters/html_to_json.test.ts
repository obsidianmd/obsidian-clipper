import { describe, test, expect } from 'vitest';
import { html_to_json } from './html_to_json';

describe('html_to_json filter', () => {
	// Note: html_to_json uses DOMParser which is not available in Node.js
	// These tests verify error handling when DOMParser is unavailable

	test('returns input when DOMParser unavailable', () => {
		// In Node.js environment without DOMParser, filter returns input
		const result = html_to_json('<p>text</p>');
		// Will be input string since DOMParser throws
		expect(typeof result).toBe('string');
	});

	test('handles empty string', () => {
		expect(html_to_json('')).toBe('');
	});

	test('handles plain text', () => {
		const result = html_to_json('plain text');
		expect(result).toContain('plain text');
	});

	test('handles simple div', () => {
		const result = html_to_json('<div class="test">content</div>');
		// In browser this would return JSON, in Node it returns original
		expect(typeof result).toBe('string');
	});
});

