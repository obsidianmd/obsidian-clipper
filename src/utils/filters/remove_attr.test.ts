import { describe, test, expect, summary } from './test-utils';
import { remove_attr } from './remove_attr';

describe('remove_attr filter', () => {
	test('removes specified attribute', () => {
		const result = remove_attr('<div class="test" id="example">Content</div>', 'class');
		expect(result).toBe('<div id="example">Content</div>');
	});

	test('removes multiple specified attributes', () => {
		// Use comma-separated format for multiple attributes
		const result = remove_attr('<div class="test" id="example" style="color:red">Content</div>', 'class, style');
		expect(result).toContain('id="example"');
		expect(result).not.toContain('class');
		expect(result).not.toContain('style');
	});

	test('handles empty string', () => {
		expect(remove_attr('')).toBe('');
	});

	test('handles no matching attributes', () => {
		expect(remove_attr('<div id="test">Content</div>', 'class')).toBe('<div id="test">Content</div>');
	});

	test('preserves unspecified attributes', () => {
		const result = remove_attr('<a href="url" target="_blank">Link</a>', 'target');
		expect(result).toContain('href="url"');
	});
});

summary();
