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
