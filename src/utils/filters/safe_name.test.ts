import { describe, test, expect, summary } from './test-utils';
import { safe_name } from './safe_name';

describe('safe_name filter', () => {
	test('removes forward slashes', () => {
		const result = safe_name('file/name');
		expect(result.includes('/')).toBeFalse();
	});

	test('removes colons', () => {
		const result = safe_name('file:name');
		expect(result.includes(':')).toBeFalse();
	});

	test('removes backslashes', () => {
		const result = safe_name('file\\name');
		expect(result.includes('\\')).toBeFalse();
	});

	test('preserves valid characters', () => {
		expect(safe_name('valid-file_name')).toBe('valid-file_name');
	});

	test('preserves alphanumeric characters', () => {
		expect(safe_name('file123')).toBe('file123');
	});

	test('handles empty string', () => {
		// Empty string returns 'Untitled' as fallback
		expect(safe_name('')).toBe('Untitled');
	});

	test('handles multiple invalid characters', () => {
		const result = safe_name('file/name:test?query');
		expect(result.includes('/')).toBeFalse();
		expect(result.includes(':')).toBeFalse();
		expect(result.includes('?')).toBeFalse();
	});

	test('windows mode removes windows-specific characters', () => {
		const result = safe_name('file<>:"/\\|?*name', 'windows');
		expect(result.includes('<')).toBeFalse();
		expect(result.includes('>')).toBeFalse();
		expect(result.includes('|')).toBeFalse();
	});
});

summary();
