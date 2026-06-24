// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { normalizeImageUrls } from './image-url-normalization';

const pageUrl = 'https://example.com/articles/post';

function firstImage(html: string): HTMLImageElement {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const img = doc.querySelector('img');
	if (!img) throw new Error('Expected normalized HTML to contain an image');
	return img as HTMLImageElement;
}

describe('normalizeImageUrls', () => {
	test('promotes data-src when an image has no src', () => {
		const img = firstImage(normalizeImageUrls('<p><img data-src="https://cdn.example.com/a.jpg"></p>', pageUrl));

		expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.jpg');
	});

	test.each([
		'data-original',
		'data-lazy-src',
		'data-actualsrc',
		'data-backup',
	])('promotes %s when it is the first valid lazy candidate', attribute => {
		const img = firstImage(normalizeImageUrls(`<img ${attribute}="https://cdn.example.com/a.jpg">`, pageUrl));

		expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.jpg');
	});

	test('replaces a data image placeholder with a lazy image candidate', () => {
		const img = firstImage(normalizeImageUrls(
			'<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-src="https://cdn.example.com/a.jpg">',
			pageUrl
		));

		expect(img.getAttribute('src')).toBe('https://cdn.example.com/a.jpg');
	});

	test('preserves an existing usable src when a lazy candidate is present', () => {
		const img = firstImage(normalizeImageUrls(
			'<img src="https://cdn.example.com/current.jpg" data-src="https://cdn.example.com/lazy.jpg">',
			pageUrl
		));

		expect(img.getAttribute('src')).toBe('https://cdn.example.com/current.jpg');
	});

	test('resolves root-relative and path-relative lazy image URLs against the page URL', () => {
		const html = normalizeImageUrls(
			'<img data-src="/images/root.jpg"><img data-src="images/path.jpg">',
			pageUrl
		);
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const images = Array.from(doc.querySelectorAll('img'));

		expect(images[0].getAttribute('src')).toBe('https://example.com/images/root.jpg');
		expect(images[1].getAttribute('src')).toBe('https://example.com/articles/images/path.jpg');
	});

	test('resolves relative srcset candidates without removing descriptors', () => {
		const img = firstImage(normalizeImageUrls(
			'<img srcset="/a-1x.jpg 1x, a-2x.jpg 2x, https://cdn.example.com/a-3x.jpg 3x">',
			pageUrl
		));

		expect(img.getAttribute('srcset')).toBe(
			'https://example.com/a-1x.jpg 1x, https://example.com/articles/a-2x.jpg 2x, https://cdn.example.com/a-3x.jpg 3x'
		);
	});

	test('does not invent src when no lazy candidate is valid', () => {
		const img = firstImage(normalizeImageUrls('<img data-src="http://[::1">', pageUrl));

		expect(img.hasAttribute('src')).toBe(false);
	});

	test('does not replace a usable src with an invalid lazy candidate', () => {
		const img = firstImage(normalizeImageUrls(
			'<img src="https://cdn.example.com/current.jpg" data-src="http://[::1">',
			pageUrl
		));

		expect(img.getAttribute('src')).toBe('https://cdn.example.com/current.jpg');
	});
});
