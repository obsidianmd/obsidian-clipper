// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import { applyFilters, clipperFilters } from './filters';

describe('Clipper filter adapter', () => {
	test('runs standard filter chains through Knap', () => {
		expect(applyFilters(' Shared Language ', 'trim|lower|replace:" ":"-"'))
			.toBe('shared-language');
	});

	test('adds Clipper environment filters to the registry', () => {
		expect(clipperFilters).toHaveProperty('markdown');
		expect(clipperFilters).toHaveProperty('html_to_json');
	});

	test('converts academic HTML fragments via the markdown filter', () => {
		const html = '<article><p>See <a href="#CR1" role="doc-biblioref">1</a> and <math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>.</p><section role="doc-bibliography"><h2>References</h2><ol><li id="CR1">Ref One.</li></ol></section></article>';
		const md = applyFilters(html, 'markdown', 'https://example.com/paper');
		expect(md).toContain('[1](#CR1)');
		expect(md).toContain('$\\frac{a}{b}$');
		expect(md).toContain('<a id="CR1"></a>Ref One.');
	});

	test('passes the current URL to fragment links', () => {
		const output = JSON.parse(applyFilters(
			'"Selected text"',
			'fragment_link',
			'https://example.com/article',
		));

		expect(output).toEqual([
			'Selected text [link](https://example.com/article#:~:text=Selected%20text)',
		]);
	});

	test('reports unknown filters in Clipper-only filter paths', () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			expect(applyFilters('value', 'does_not_exist')).toBe('value');
			expect(errorSpy).toHaveBeenCalledWith('Invalid filter: does_not_exist');
		} finally {
			errorSpy.mockRestore();
		}
	});
});
