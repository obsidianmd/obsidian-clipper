import { describe, test, expect, summary } from './test-utils';
import { table } from './table';

describe('table filter', () => {
	test('converts array of objects to markdown table', () => {
		const result = table('[{"name":"Alice","age":30},{"name":"Bob","age":25}]');
		expect(result).toContain('| name | age |');
		expect(result).toContain('| Alice | 30 |');
		expect(result).toContain('| Bob | 25 |');
	});

	test('creates table with separator row', () => {
		const result = table('[{"a":1}]');
		// Separator row uses "| - |" format
		expect(result).toContain('| - |');
	});

	test('handles simple array', () => {
		const result = table('["a","b","c"]');
		expect(result).toContain('| Value |');
	});

	test('handles custom column headers', () => {
		const result = table('["a","b","c","d"]', '("Col1", "Col2")');
		expect(result).toContain('| Col1 | Col2 |');
	});

	test('handles empty array', () => {
		// Empty array creates a default single-column table with no rows
		const result = table('[]');
		expect(result).toContain('| Value |');
	});

	test('returns original for non-JSON', () => {
		expect(table('plain text')).toBe('plain text');
	});
});

summary();
