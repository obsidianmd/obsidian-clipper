import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { clip, DocumentParser } from './api';
import { Template } from './types/types';

const documentParser: DocumentParser = {
	parseFromString(html: string) {
		return parseHTML(html).document;
	},
};

const template: Template = {
	id: 'clean-page-test',
	name: 'Clean page test',
	behavior: 'create',
	noteNameFormat: '{{title}}',
	path: '',
	noteContentFormat: [
		'Markdown:',
		'{{content}}',
		'HTML:',
		'{{contentHtml}}',
		'Full:',
		'{{fullHtml}}',
	].join('\n'),
	properties: [],
};

describe('clip clean page integration', () => {
	it('builds content variables from cleaned Defuddle HTML', async () => {
		const result = await clip({
			html: `
				<html>
					<head><title>Clean Page</title></head>
					<body>
						<article>
							<h1>Clean Page</h1>
							<p>Main story.</p>
							<div id="div-gpt-ad-123"><p>Advertisement copy</p></div>
							<iframe src="https://securepubads.g.doubleclick.net/pagead/ads"></iframe>
							<p class="roadmap">Roadmap stays.</p>
						</article>
					</body>
				</html>
			`,
			url: 'https://example.com/clean-page',
			template,
			documentParser,
		});

		expect(result.fullContent).toContain('Main story.');
		expect(result.fullContent).toContain('Roadmap stays.');
		expect(result.fullContent).not.toContain('Advertisement copy');
		expect(result.fullContent).not.toContain('div-gpt-ad');
		expect(result.variables['{{content}}']).not.toContain('Advertisement copy');
		expect(result.variables['{{contentHtml}}']).not.toContain('securepubads');
		expect(result.variables['{{fullHtml}}']).not.toContain('securepubads');
	});
});
