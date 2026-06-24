// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import { clip } from './api';

describe('clip API image URL normalization', () => {
	test('includes promoted lazy image URLs in generated content', async () => {
		const result = await clip({
			html: `
				<html>
					<head><title>Lazy image article</title></head>
					<body>
						<article>
							<h1>Lazy image article</h1>
							<p>Article text with enough content for extraction.</p>
							<img data-src="/images/a.jpg" alt="A">
						</article>
					</body>
				</html>
			`,
			url: 'https://example.com/articles/post',
			template: {
				id: 'lazy-image-test',
				name: 'Lazy image test',
				behavior: 'create',
				noteNameFormat: '{{title}}',
				path: '',
				noteContentFormat: '{{content}}',
				properties: [],
			},
			documentParser: {
				parseFromString: (html: string) => parseHTML(html).document,
			},
		});

		expect(result.content).toContain('https://example.com/images/a.jpg');
	});
});
