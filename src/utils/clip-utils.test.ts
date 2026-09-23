// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { createMarkdownContent } from 'defuddle/full';
import { parseForClip, prepareDocumentForClip } from './clip-utils';

describe('parseForClip', () => {
	test('preserves SVG images embedded with object elements', () => {
		window.history.replaceState({}, '', '/html/2608.28188v1');
		const paragraph = 'Regression marker content for SVG object clipping. '.repeat(80);
		document.documentElement.innerHTML = `
			<head><title>SVG object article</title></head>
			<body>
				<article>
					<h1>SVG object article</h1>
					<p>${paragraph}</p>
					<figure>
							<object type="image/svg+xml" data="2608.28188v1/overview.svg" width="452" height="150"></object>
						<figcaption>Overview diagram</figcaption>
					</figure>
				</article>
			</body>
		`;

		const result = parseForClip(document);
		const markdown = createMarkdownContent(result.content, 'https://arxiv.org/html/2608.28188v1');
		const imageUrl = new URL('2608.28188v1/overview.svg', document.URL).href;

		expect(result.content).toContain('2608.28188v1/overview.svg');
		expect(result.content).toContain('Overview diagram');
		expect(markdown).toContain(`![](${imageUrl})`);
	});
});

describe('prepareDocumentForClip', () => {
	test('normalizes SVG objects on a clone without changing the live page', () => {
		document.body.innerHTML = `
			<object
				type="image/svg+xml"
				data="2608.28188v1/overview.svg"
				width="452"
				height="150"
				aria-label="Overview"
			></object>
		`;

		const prepared = prepareDocumentForClip(document);
		const image = prepared.querySelector('img');

		expect(prepared).not.toBe(document);
		expect(document.querySelector('object')).not.toBeNull();
		expect(prepared.querySelector('object')).toBeNull();
		expect(image?.getAttribute('src')).toBe('2608.28188v1/overview.svg');
		expect(image?.getAttribute('alt')).toBe('Overview');
		expect(image?.getAttribute('width')).toBe('452');
		expect(image?.getAttribute('height')).toBe('150');
	});

	test('avoids cloning pages without SVG objects', () => {
		document.body.innerHTML = '<article><p>Plain article</p></article>';

		expect(prepareDocumentForClip(document)).toBe(document);
	});
});
