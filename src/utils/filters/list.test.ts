import { describe, test, expect } from 'vitest';
import { list, validateListParams } from './list';

describe('list filter', () => {
	test('converts array to bullet list', () => {
		const result = list('["a","b","c"]');
		expect(result).toContain('- a');
		expect(result).toContain('- b');
		expect(result).toContain('- c');
	});

	test('converts to numbered list', () => {
		const result = list('["a","b","c"]', 'numbered');
		expect(result).toContain('1. a');
		expect(result).toContain('2. b');
		expect(result).toContain('3. c');
	});

	test('converts to task list', () => {
		const result = list('["a","b"]', 'task');
		expect(result).toContain('- [ ] a');
		expect(result).toContain('- [ ] b');
	});

	test('converts to numbered task list', () => {
		const result = list('["a","b"]', 'numbered-task');
		expect(result).toContain('1. [ ] a');
		expect(result).toContain('2. [ ] b');
	});

	test('handles empty array', () => {
		expect(list('[]')).toBe('');
	});

	test('handles single item', () => {
		const result = list('["only"]');
		expect(result).toBe('- only');
	});

	test('returns original for non-JSON with bullet prefix', () => {
		// Non-JSON input is treated as a single item and formatted as a list item
		expect(list('plain text')).toBe('- plain text');
	});
});

describe('list param validation', () => {
	test('no param is valid (defaults to bullet)', () => {
		expect(validateListParams(undefined).valid).toBe(true);
	});

	test('valid params return valid', () => {
		expect(validateListParams('numbered').valid).toBe(true);
		expect(validateListParams('task').valid).toBe(true);
		expect(validateListParams('numbered-task').valid).toBe(true);
	});

	test('invalid list type returns error', () => {
		const result = validateListParams('bullets');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('invalid list type');
	});
});

