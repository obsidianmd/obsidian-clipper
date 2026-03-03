// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { createMarkdownContent } from './markdown-converter';

describe('math formula conversion', () => {
	test('converts inline math with data-latex to $...$', () => {
		const html = '<p>Let <math display="inline" data-latex="\\small X_1 + Y_2">X₁ + Y₂</math> be a sample</p>';
		const md = createMarkdownContent(html, 'https://mp.weixin.qq.com/s/test');
		expect(md).toContain('$X_1 + Y_2$');
		expect(md).not.toContain('\\small');
	});

	test('converts block math with data-latex to $$...$$', () => {
		const html = '<math display="block" data-latex="\\small \\beta(a) = \\sup_t X_t">β(a)</math>';
		const md = createMarkdownContent(html, 'https://example.com/');
		expect(md).toContain('$$');
		expect(md).toContain('\\beta(a) = \\sup_t X_t');
		expect(md).not.toContain('\\small');
	});

	test('decodes URI-encoded data-latex values', () => {
		const html = '<p><math display="inline" data-latex="%5Csmall%20X%5E2">X²</math></p>';
		const md = createMarkdownContent(html, 'https://example.com/');
		expect(md).toContain('$X^2$');
	});

	test('passes through normal data-latex without cleaning prefix', () => {
		const html = '<p><math display="inline" data-latex="E = mc^2">E=mc²</math></p>';
		const md = createMarkdownContent(html, 'https://example.com/');
		expect(md).toContain('$E = mc^2$');
	});
});
