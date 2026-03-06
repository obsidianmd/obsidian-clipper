// @vitest-environment jsdom

import { createMarkdownContent } from './markdown-converter';

describe('createMarkdownContent', () => {
	test('converts standalone latex images into Obsidian block math', () => {
		const html = `
			<p class="has-text-align-center wp-block-paragraph">
				<img
					src="data:image/png;base64,abc"
					alt="\\text{LeakyReLU}(x) = \\begin{cases} x, &amp; x \\ge 0, \\\\ \\alpha x, &amp; x &lt; 0. \\end{cases}"
					class="latex"
				/>
			</p>
		`;

		const markdown = createMarkdownContent(
			html,
			'https://example.com/articles/post/'
		);

		expect(markdown).toBe(
			'$$\n\\text{LeakyReLU}(x) = \\begin{cases} x, & x \\ge 0, \\\\ \\alpha x, & x < 0. \\end{cases}\n$$'
		);
	});

	test('keeps tex-like alt text as an image when no helper condition matches', () => {
		const html = `
			<p>
				Before
				<img src="/formula.png" alt="\\alpha + \\beta" />
				after
			</p>
		`;

		const markdown = createMarkdownContent(html, 'https://example.com/articles/post/');

		expect(markdown).toContain('Before');
		expect(markdown).toContain('![\\alpha + \\beta](https://example.com/formula.png)');
		expect(markdown).toContain('after');
	});

	test('converts tex-like title text when a helper condition matches', () => {
		const html = `
			<p>
				<img
					src="/formula.png?renderer=latex"
					title="\\frac{a}{b}"
				/>
			</p>
		`;

		const markdown = createMarkdownContent(html, 'https://example.com/articles/post/');

		expect(markdown).toBe('$$\n\\frac{a}{b}\n$$');
	});

	test('keeps ordinary images as markdown images', () => {
		const html = '<p><img src="/image.png" alt="Example image"></p>';

		const markdown = createMarkdownContent(html, 'https://example.com/articles/post/');

		expect(markdown).toContain('![Example image](https://example.com/image.png)');
	});
});
