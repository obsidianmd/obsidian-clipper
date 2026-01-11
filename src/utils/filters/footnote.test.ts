import { describe, test, expect, summary } from './test-utils';
import { footnote } from './footnote';

describe('footnote filter', () => {
	test('converts array to footnotes', () => {
		const result = footnote('["first item","second item"]');
		expect(result).toContain('[^1]');
		expect(result).toContain('first item');
		expect(result).toContain('[^2]');
		expect(result).toContain('second item');
	});

	test('converts object to footnotes', () => {
		const result = footnote('{"First Note": "Content 1", "Second Note": "Content 2"}');
		expect(result).toContain('Content 1');
		expect(result).toContain('Content 2');
	});

	test('handles single item array', () => {
		const result = footnote('["only item"]');
		expect(result).toContain('[^1]');
		expect(result).toContain('only item');
	});

	test('handles empty array', () => {
		const result = footnote('[]');
		expect(result).toBe('');
	});

	test('returns original for non-JSON', () => {
		expect(footnote('plain text')).toBe('plain text');
	});
});

summary();
