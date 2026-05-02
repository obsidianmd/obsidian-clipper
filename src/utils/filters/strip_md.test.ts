import { describe, test, expect } from 'vitest';
import { strip_md } from './strip_md';

describe('strip_md filter', () => {
	test('removes bold formatting', () => {
		expect(strip_md('**bold** text')).toBe('bold text');
	});

	test('removes italic formatting', () => {
		expect(strip_md('*italic* text')).toBe('italic text');
	});

	test('removes combined formatting', () => {
		expect(strip_md('**bold** and *italic*')).toBe('bold and italic');
	});

	test('removes headers', () => {
		expect(strip_md('# Header')).toBe('Header');
	});

	test('removes links', () => {
		expect(strip_md('[link](url)')).toBe('link');
	});

	test('removes wikilinks', () => {
		expect(strip_md('[[page]]')).toBe('page');
	});

	test('removes wikilinks with alias', () => {
		expect(strip_md('[[page|alias]]')).toBe('alias');
	});

	test('handles empty string', () => {
		expect(strip_md('')).toBe('');
	});

	test('handles plain text', () => {
		expect(strip_md('plain text')).toBe('plain text');
	});

	test('removes code blocks', () => {
		expect(strip_md('`code`')).toBe('code');
	});
});

