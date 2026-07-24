// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { cloneAndCleanSelectedElement } from './selected-element';

describe('cloneAndCleanSelectedElement', () => {
	test('cleans only the clone and preserves the live page element', () => {
		document.body.innerHTML = `
			<article style="color: red" onclick="alert('no')">
				<a href="/story" onmouseover="alert('no')">Story</a>
				<script>window.bad = true</script>
				<style>.bad { color: red; }</style>
				<div id="obsidian-clipper-container">Extension UI</div>
			</article>`;
		const source = document.querySelector('article')!;

		const result = cloneAndCleanSelectedElement(source, 'https://example.com/page');

		expect(result).toContain('href="https://example.com/story"');
		expect(result).not.toContain('style=');
		expect(result).not.toContain('onclick=');
		expect(result).not.toContain('onmouseover=');
		expect(result).not.toContain('<script');
		expect(result).not.toContain('Extension UI');
		expect(source.getAttribute('style')).toBe('color: red');
		expect(source.querySelector('script')).not.toBeNull();
	});

	test('normalizes srcset and removes executable URLs', () => {
		document.body.innerHTML = `
			<div>
				<img src="images/a.png" srcset="small.png 1x, /large.png 2x">
				<a href="javascript:alert('no')">Unsafe</a>
			</div>`;

		const result = cloneAndCleanSelectedElement(document.querySelector('div')!, 'https://example.com/articles/page');
		const clone = new DOMParser().parseFromString(result, 'text/html');

		expect(clone.querySelector('img')?.getAttribute('src')).toBe('https://example.com/articles/images/a.png');
		expect(clone.querySelector('img')?.getAttribute('srcset')).toBe(
			'https://example.com/articles/small.png 1x, https://example.com/large.png 2x'
		);
		expect(clone.querySelector('a')?.hasAttribute('href')).toBe(false);
	});
});
