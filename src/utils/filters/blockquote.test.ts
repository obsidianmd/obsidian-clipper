import { describe, test, expect } from 'vitest';
import { blockquote } from './blockquote';

describe('blockquote filter', () => {
	test('adds > prefix to single line', () => {
		expect(blockquote('single line')).toBe('> single line');
	});

	test('adds > prefix to each line', () => {
		expect(blockquote('line1\nline2')).toBe('> line1\n> line2');
	});

	test('handles multiple lines', () => {
		expect(blockquote('a\nb\nc')).toBe('> a\n> b\n> c');
	});

	test('handles empty string', () => {
		expect(blockquote('')).toBe('> ');
	});

	test('handles lines with existing content', () => {
		expect(blockquote('Hello\nWorld')).toBe('> Hello\n> World');
	});
});

