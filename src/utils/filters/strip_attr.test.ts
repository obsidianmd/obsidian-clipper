import { describe, test, expect, summary } from './test-utils';
import { strip_attr } from './strip_attr';

describe('strip_attr filter', () => {
	test('removes all HTML attributes', () => {
		const result = strip_attr('<div class="test" id="example">Content</div>');
		expect(result).toBe('<div>Content</div>');
	});

	test('keeps specified attributes', () => {
		const result = strip_attr('<div class="test" id="example">Content</div>', 'id');
		expect(result).toContain('id="example"');
		expect(result).not.toContain('class=');
	});

	test('handles multiple attributes', () => {
		const result = strip_attr('<a href="url" target="_blank" rel="noopener">Link</a>');
		expect(result).toBe('<a>Link</a>');
	});

	test('handles empty string', () => {
		expect(strip_attr('')).toBe('');
	});

	test('handles no attributes', () => {
		expect(strip_attr('<p>text</p>')).toBe('<p>text</p>');
	});
});

summary();
