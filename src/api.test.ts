// @vitest-environment jsdom

import { parseHTML } from 'linkedom';
import { describe, expect, test } from 'vitest';
import { clip, type DocumentParser } from './api';
import type { Template } from './types/types';

const documentParser: DocumentParser = {
	parseFromString(html: string) {
		return parseHTML(html).document;
	},
};

const template: Template = {
	id: 'test',
	name: 'Test',
	behavior: 'create',
	noteNameFormat: '{{title}}',
	path: '',
	noteContentFormat: '{{content}}',
	properties: [],
};

describe('clip', () => {
	test.each([
		['/favicon.ico', '', 'https://example.com/favicon.ico'],
		['icons/favicon.png', '', 'https://example.com/articles/icons/favicon.png'],
		['//cdn.example.com/icon.png', '', 'https://cdn.example.com/icon.png'],
		['icon.png', '<base href="https://cdn.example.com/assets/">', 'https://cdn.example.com/assets/icon.png'],
		['icon.png', '<base href="../assets/">', 'https://example.com/assets/icon.png'],
		['https://cdn.example.com/icon.png', '', 'https://cdn.example.com/icon.png'],
	])('resolves favicon %s with base %s', async (href, base, expected) => {
		const html = `<html><head><title>Sample</title>${base}<link rel="icon" href="${href}"></head><body><article><p>Sample article content.</p></article></body></html>`;
		const result = await clip({
			html,
			url: 'https://example.com/articles/page',
			template: { ...template, noteContentFormat: '{{favicon}}' },
			documentParser: { parseFromString: html => new DOMParser().parseFromString(html, 'text/html') },
		});
		expect(result.content).toBe(expected);
	});

	test('extracts content from a linkedom Document', async () => {
		const paragraph =
			'Regression marker content for the Obsidian Web Clipper API. '.repeat(80);

		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Clipper document regression</title>
				</head>
				<body>
					<article>
						<h1>Clipper document regression</h1>
						<p>${paragraph}</p>
					</article>
				</body>
			</html>
		`;

		const result = await clip({
			html,
			url: 'https://example.com/article',
			template,
			documentParser,
		});

		expect(result.noteName).not.toBe('Untitled');
		expect(result.content).toContain('Regression marker content');
	});
});
