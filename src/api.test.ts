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

	test('preserves academic citations, math, complex tables, and rawContentHtml under jsdom DOMParser', async () => {
		const prose = 'Dynamic general equilibrium models quantify transition paths cleanly. '.repeat(10);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Equilibrium Dynamics</title>
					<meta name="citation_doi" content="10.1111/meca.70034" />
				</head>
				<body>
					<article>
						<h1>Equilibrium Dynamics</h1>
						<p>
							${prose}
							As established in <a class="bibLink" href="#bib-2">Smith et al., 2020</a>
							and computed via <math><mfrac><mi>K</mi><mi>L</mi></mfrac></math>.
						</p>
						<table>
							<thead>
								<tr><th colspan="2">Model</th></tr>
								<tr><th>Name</th><th>Fit</th></tr>
							</thead>
							<tbody>
								<tr><td>Baseline</td><td>0.92</td></tr>
							</tbody>
						</table>
						<section id="bib">
							<h2>References</h2>
							<ol><li id="bib-2">Smith, J. (2020).</li></ol>
						</section>
					</article>
				</body>
			</html>
		`;

		const jsdomParser: DocumentParser = {
			parseFromString(input: string, mimeType: string) {
				return new window.DOMParser().parseFromString(input, mimeType as DOMParserSupportedType);
			},
		};

		const academicResult = await clip({
			html,
			url: 'https://onlinelibrary.wiley.com/doi/10.1111/meca.70034',
			template: {
				...template,
				noteContentFormat: '{{content}}\n\n<!-- FILTERED -->\n{{contentHtml|markdown}}\n\n<!-- RAW -->\n{{rawContentHtml}}',
			},
			documentParser: jsdomParser,
		});

		expect(academicResult.content).toContain('[Smith et al., 2020](#bib-2)');
		expect(academicResult.content).toContain('<a id="bib-2"></a>Smith, J. (2020).');
		expect(academicResult.content).toContain('$\\frac{K}{L}$');
		expect(academicResult.content).toContain('colspan="2"');
		expect(academicResult.rawContentHtml).toContain('id="bib-2"');
		expect(academicResult.variables['{{rawContentHtml}}']).toContain('References');

		const rawOnlyResult = await clip({
			html,
			url: 'https://onlinelibrary.wiley.com/doi/10.1111/meca.70034',
			template,
			documentParser: jsdomParser,
			academicMode: false,
		});

		expect(rawOnlyResult.content).not.toContain('<a id="bib-2"></a>');
	});
});
