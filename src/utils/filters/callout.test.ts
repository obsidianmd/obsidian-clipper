import { describe, test, expect } from 'vitest';
import { callout } from './callout';

describe('callout filter', () => {
	test('creates default info callout', () => {
		const result = callout('content');
		expect(result).toContain('[!info]');
		expect(result).toContain('content');
	});

	test('creates callout with custom type', () => {
		const result = callout('content', 'warning');
		expect(result).toContain('[!warning]');
	});

	test('creates callout with title', () => {
		const result = callout('content', '("note", "My Title")');
		expect(result).toContain('[!note]');
		expect(result).toContain('My Title');
	});

	test('handles empty content', () => {
		const result = callout('');
		expect(result).toContain('[!info]');
	});

	test('handles multiline content', () => {
		const result = callout('line1\nline2');
		expect(result).toContain('line1');
		expect(result).toContain('line2');
	});
});

