// @vitest-environment node

import { describe, expect, test, vi } from 'vitest';

const { parseHTML } = vi.hoisted(() => {
	const linkedom = require('linkedom');
	if (typeof (globalThis as any).window === 'undefined') {
		(globalThis as any).window = globalThis;
	}
	if (typeof (globalThis as any).DOMParser === 'undefined') {
		(globalThis as any).DOMParser = class {
			parseFromString(html: string) {
				return linkedom.parseHTML(html).document;
			}
		};
	}
	if (typeof (globalThis as any).document === 'undefined') {
		(globalThis as any).document = linkedom.parseHTML('<!DOCTYPE html><html><head></head><body></body></html>').document;
	}
	return linkedom;
});

import { clip, type DocumentParser } from '../api';
import type { Template } from '../types/types';
import {
	detectAcademicArticle,
	resolveAcademicOptions,
	createAcademicMarkdownContent,
} from './academic';
import { applyFilters } from './filters';

const documentParser: DocumentParser = {
	parseFromString(html: string) {
		return parseHTML(html).document;
	},
};

function makeTemplate(overrides: Partial<Template> = {}): Template {
	return {
		id: 'academic-test',
		name: 'Academic Test',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: '',
		noteContentFormat: '{{content}}',
		properties: [],
		...overrides,
	};
}

describe('Academic preservation mode (Issue #995)', () => {
	test('preserves Wiley-style citation links, normalized same-page URLs, and collapsed external bibliography anchors', async () => {
		const url = 'https://onlinelibrary.wiley.com/doi/10.1111/meca.70034';
		const prose = 'This theoretical result extends prior empirical findings in macroeconomic dynamics. '.repeat(8);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Macroeconomic Equilibrium Analysis</title>
					<meta name="citation_doi" content="10.1111/meca.70034" />
					<meta name="citation_title" content="Macroeconomic Equilibrium Analysis" />
				</head>
				<body>
					<article>
						<h1>Macroeconomic Equilibrium Analysis</h1>
						<section id="sec1">
							<h2>1. Introduction</h2>
							<p>
								${prose}
								As shown by <a class="bibLink" href="${url}#meca70034-bib-0002">Smith et al., 2020</a>
								and confirmed in subsequent work<sup>[<a class="bibLink ref" href="#meca70034-bib-0015">15</a>]</sup>.
								See also <a class="xref" href="#sec1">Section 1</a>.
							</p>
						</section>
					</article>
					<section class="article-section__references" style="display: none" aria-hidden="true">
						<h2>References</h2>
						<ul class="rlist separator">
							<li id="meca70034-bib-0002">
								Smith, J., &amp; Doe, A. (2020). Equilibrium dynamics. <em>Metroeconomica</em>.
								<a href="https://doi.org/10.1111/example1">CrossRef</a>
							</li>
							<li>
								<a id="meca70034-bib-0015"></a>
								Jones, R. (2022). Growth models. <em>Journal of Economics</em>.
							</li>
						</ul>
					</section>
				</body>
			</html>
		`;

		const result = await clip({
			html,
			url,
			template: makeTemplate({
				noteContentFormat: '{{content}}\n\n<!-- RAW -->\n{{rawContentHtml}}',
			}),
			documentParser,
		});

		// In-text citations preserved as fragment links
		expect(result.content).toContain('[Smith et al., 2020](#meca70034-bib-0002)');
		expect(result.content).toContain('<sup>[[15](#meca70034-bib-0015)]</sup>');
		expect(result.content).toContain('[Section 1](#sec1)');

		// Collapsed external bibliography was unhidden, adopted, and anchored
		expect(result.content).toContain('<a id="meca70034-bib-0002"></a>Smith, J.');
		expect(result.content).toContain('<a id="meca70034-bib-0015"></a>Jones, R.');
		expect(result.content).toContain('<a id="sec1"></a>1. Introduction');
		expect(result.content).toContain('[CrossRef](https://doi.org/10.1111/example1)');

		// contentHtml preserves IDs and hrefs
		expect(result.variables['{{contentHtml}}']).toContain('id="meca70034-bib-0002"');
		expect(result.variables['{{contentHtml}}']).toContain('id="meca70034-bib-0015"');
		expect(result.variables['{{contentHtml}}']).toContain('href="#meca70034-bib-0015"');

		// rawContentHtml is populated with pre-standardization HTML including adopted references
		expect(result.rawContentHtml).toContain('meca70034-bib-0015');
		expect(result.variables['{{rawContentHtml}}']).toContain('article-section__references');
	});

	test('preserves Springer/Nature #CR15 citations, multi-citation ranges, and arXiv LaTeXML references', async () => {
		const prose = 'Quantum error correction achieves fault tolerance under realistic noise thresholds. '.repeat(8);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Quantum Codes</title>
					<meta name="citation_arxiv_id" content="2401.00001" />
				</head>
				<body>
					<article>
						<h1>Quantum Codes</h1>
						<p>
							${prose}
							Prior studies<sup>[<a class="c-bibliographic-information__ref" href="#CR12">12</a>–<a class="c-bibliographic-information__ref" href="#CR15">15</a>]</sup>
							and arXiv citations <cite class="ltx_cite">[<a class="ltx_ref" href="#bib.bib1"><span class="ltx_text ltx_ref_tag">1</span></a>]</cite>
							support Equation (<a class="ltx_ref" href="#S2.E1"><span class="ltx_text ltx_ref_tag">1</span></a>).
						</p>
						<table class="ltx_equation" id="S2.E1">
							<tbody>
								<tr>
									<td class="ltx_eqn_cell">
										<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">
											<mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow>
										</math>
									</td>
									<td class="ltx_eqn_cell ltx_eqn_eqno"><span class="ltx_tag ltx_tag_equation">(1)</span></td>
								</tr>
							</tbody>
						</table>
						<section id="bib">
							<h2>References</h2>
							<ol class="c-article-references">
								<li id="CR12" data-counter="12.">Twelve Author (2021).</li>
								<li id="CR15" data-counter="15.">Fifteen Author (2023).</li>
								<li id="bib.bib1"><span class="ltx_tag ltx_tag_bibitem">[1]</span> ArXiv Author (2024).</li>
							</ol>
						</section>
					</article>
				</body>
			</html>
		`;

		const result = await clip({
			html,
			url: 'https://link.springer.com/article/10.1007/s00000-024-0001',
			template: makeTemplate(),
			documentParser,
		});

		// Multi-citation range preserves dash and both links
		expect(result.content).toContain('<sup>[[12](#CR12)–[15](#CR15)]</sup>');
		// arXiv ltx_ref preserved as link rather than unwrapped to plain text
		expect(result.content).toContain('\\[[1](#bib.bib1)\\]');
		expect(result.content).toContain('Equation ([1](#S2.E1))');

		// Equation anchor and \tag{1} preserved
		expect(result.content).toContain('<a id="S2.E1"></a>');
		expect(result.content).toContain('\\tag{1}');
		expect(result.content).toContain('E = m c^{2}');

		// All bibliography anchors preserved with proper numbering
		expect(result.content).toContain('<a id="CR12"></a>Twelve Author (2021).');
		expect(result.content).toContain('<a id="CR15"></a>Fifteen Author (2023).');
		expect(result.content).toContain('<a id="bib.bib1"></a>\\[1\\] ArXiv Author (2024).');
	});

	test('converts button/JS citation triggers and keeps footnotes separate from bibliography without ID collisions', async () => {
		const prose = 'Empirical methodology combines archival sources with panel econometrics across regions. '.repeat(8);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Separate Footnotes and Bibliography</title>
					<meta name="citation_doi" content="10.1234/test.2026" />
				</head>
				<body>
					<article>
						<h1>Separate Footnotes and Bibliography</h1>
						<p>
							${prose}
							This claim has an explanatory footnote<sup id="fnref:1"><a href="#fn:1">1</a></sup>
							and cites a paper via button <button data-rid="B1">1</button>
							and JS link <a href="javascript:void(0)" data-bib-id="B2">2</a>.
						</p>
						<section role="doc-bibliography">
							<h2>References</h2>
							<ol>
								<li id="B1">Bibliography Entry One (2020).</li>
								<li id="B2"><span id="B2-anchor"></span>Bibliography Entry Two (2021).</li>
							</ol>
						</section>
						<div id="footnotes-container" class="footnotes">
							<h2>Footnotes</h2>
							<ol>
								<li id="fn:1"><p>This is a genuine article footnote, not a bibliography entry.</p></li>
							</ol>
						</div>
					</article>
				</body>
			</html>
		`;

		const result = await clip({
			html,
			url: 'https://academic.oup.com/ej/article/10.1234/test.2026',
			template: makeTemplate(),
			documentParser,
		});

		// True footnote converted to Markdown footnote [^1]
		expect(result.content).toContain('[^1]');
		expect(result.content).toContain('[^1]: This is a genuine article footnote, not a bibliography entry.');

		// Bibliography citations stay fragment links, NOT merged or dropped by ID=1 collision
		expect(result.content).toContain('[1](#B1)');
		expect(result.content).toContain('[2](#B2)');
		expect(result.content).toContain('<a id="B1"></a>Bibliography Entry One (2020).');
		expect(result.content).toContain('<a id="B2"></a>Bibliography Entry Two (2021).');
	});

	test('extracts MathML without data-latex, all annotation encoding variants, and multiline caption math', async () => {
		const prose = 'Variational inference approximates intractable posterior distributions accurately. '.repeat(8);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Math Extraction</title>
					<meta name="citation_doi" content="10.1000/math.1" />
				</head>
				<body>
					<article>
						<h1>Math Extraction</h1>
						<p>
							${prose}
							Inline power <math><msup><mi>x</mi><mn>2</mn></msup></math>,
							fraction <math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>,
							and annotation with TeX encoding
							<math>
								<semantics>
									<msup><mi>y</mi><mn>3</mn></msup>
									<annotation encoding="TeX">y^{3} + \\alpha</annotation>
								</semantics>
							</math>.
						</p>
						<figure id="fig-math">
							<img src="/img/plot.png" alt="Convergence plot" />
							<figcaption>
								Convergence of <math>
									<mfrac>
										<mi>L</mi>
										<mi>N</mi>
									</mfrac>
								</math> with <annotation-test></annotation-test> rate <a href="#CR1">1</a>.
							</figcaption>
						</figure>
						<section role="doc-bibliography">
							<h2>References</h2>
							<ol><li id="CR1">Blei et al. (2017).</li></ol>
						</section>
					</article>
				</body>
			</html>
		`;

		const result = await clip({
			html,
			url: 'https://arxiv.org/html/2401.12345v1',
			template: makeTemplate(),
			documentParser,
		});

		// Must NOT collapse to $x2$ or $ab$ or $y3y^{3} + \alpha$
		expect(result.content).toContain('$x^{2}$');
		expect(result.content).toContain('$\\frac{a}{b}$');
		expect(result.content).toContain('$y^{3} + \\alpha$');
		expect(result.content).not.toContain('$x2$');
		expect(result.content).not.toContain('y3y^{3}');

		// Multiline <math> inside <figcaption> converts cleanly
		expect(result.content).toContain('$\\frac{L}{N}$');
		expect(result.content).toContain('[1](#CR1)');
		expect(result.content).toContain('https://arxiv.org/img/plot.png');
	});

	test('preserves complex tables as HTML with captions, footnotes, math, and safe entities, while simple tables become pipe tables', async () => {
		const prose = 'Experimental benchmarks compare baseline and proposed architectures across datasets. '.repeat(8);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Tables Test</title>
					<meta name="citation_doi" content="10.1000/tables.1" />
				</head>
				<body>
					<article>
						<h1>Tables Test</h1>
						<p>${prose}</p>
						<table id="tab1">
							<caption>Table 1. Results (<a href="#CR1">1</a>)</caption>
							<thead>
								<tr>
									<th rowspan="2">Model</th>
									<th colspan="2">Metrics</th>
								</tr>
								<tr>
									<th>Score</th>
									<th>Significance</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td>Model A <math><msup><mi>R</mi><mn>2</mn></msup></math></td>
									<td>0.95</td>
									<td>p &lt; 0.05 &amp; q &gt; 0.01</td>
								</tr>
							</tbody>
						</table>
						<div class="table-foot">* Statistically significant at <math><mi>&#x3B1;</mi><mo>=</mo><mn>0.05</mn></math>.</div>

						<figure id="tab2">
							<figcaption>Table 2. Simple summary</figcaption>
							<table>
								<thead>
									<tr><th colspan="1">Metric</th><th rowspan="1">Value</th></tr>
								</thead>
								<tbody>
									<tr><td>Accuracy</td><td>99%</td></tr>
								</tbody>
							</table>
						</figure>

						<section role="doc-bibliography">
							<h2>References</h2>
							<ol><li id="CR1">Benchmarks (2025).</li></ol>
						</section>
					</article>
				</body>
			</html>
		`;

		const result = await clip({
			html,
			url: 'https://www.nature.com/articles/s41586-025-00001-0',
			template: makeTemplate(),
			documentParser,
		});

		// Complex table keeps rowspan/colspan HTML, caption, math, safe entities (&lt; stays &lt;)
		expect(result.content).toContain('<a id="tab1"></a>');
		expect(result.content).toContain('rowspan="2"');
		expect(result.content).toContain('colspan="2"');
		expect(result.content).toContain('$R^{2}$');
		expect(result.content).toContain('p &lt; 0.05 &amp; q &gt; 0.01');
		expect(result.content).toContain('\\* Statistically significant at $\\alpha = 0.05$.');

		// Simple table wrapped in <figure id="tab2"> with trivial span=1 becomes pipe table with caption & anchor
		expect(result.content).toContain('<a id="tab2"></a>');
		expect(result.content).toContain('Table 2. Simple summary');
		expect(result.content).toContain('| Metric | Value |');
		expect(result.content).toContain('| Accuracy | 99% |');
	});

	test('preserves multi-panel subfigures, srcset in HTML, and rich captions with repeated tokens and citations', async () => {
		const prose = 'Microscopy imaging reveals distinct structural phases across temperature gradients. '.repeat(8);
		const html = `
			<!doctype html>
			<html>
				<head>
					<title>Figures Test</title>
					<meta name="citation_doi" content="10.1000/fig.1" />
				</head>
				<body>
					<article>
						<h1>Figures Test</h1>
						<p>${prose} See Figure <a href="#fig1">1</a>.</p>
						<figure id="fig1">
							<img src="/images/fig1a-thumb.png" srcset="/images/fig1a-400.png 400w, /images/fig1a-1600.png 1600w" alt="Panel A" />
							<img data-src="/images/fig1b.png" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="" />
							<figcaption>
								<strong>Figure 1.</strong> (a) Phase diagram at <em>T</em><sub>c</sub> and (b) scaling <math><msup><mi>L</mi><mn>2</mn></msup></math> from <a href="#CR1">1</a>.
							</figcaption>
						</figure>
						<section role="doc-bibliography">
							<h2>References</h2>
							<ol><li id="CR1">Imaging Study (2024).</li></ol>
						</section>
					</article>
				</body>
			</html>
		`;

		const resultMd = await clip({
			html,
			url: 'https://www.science.org/doi/10.1126/science.abc1234',
			template: makeTemplate(),
			documentParser,
		});

		// Both subfigures preserved with highest-res srcset URL and lazy data-src resolved
		expect(resultMd.content).toContain('<a id="fig1"></a>');
		expect(resultMd.content).toContain('![Panel A](https://www.science.org/images/fig1a-1600.png)');
		expect(resultMd.content).toContain('![](https://www.science.org/images/fig1b.png)');

		// Caption preserves formatting, sub, math, repeated tokens, and citation link
		expect(resultMd.content).toContain('**Figure 1.**');
		expect(resultMd.content).toContain('(a)');
		expect(resultMd.content).toContain('(b)');
		expect(resultMd.content).toContain('<sub>c</sub>');
		expect(resultMd.content).toContain('$L^{2}$');
		expect(resultMd.content).toContain('[1](#CR1)');

		// Full srcset preserved in contentHtml and rawContentHtml
		expect(resultMd.variables['{{contentHtml}}']).toContain('srcset="https://www.science.org/images/fig1a-400.png 400w, https://www.science.org/images/fig1a-1600.png 1600w"');
		expect(resultMd.rawContentHtml).toContain('fig1a-1600.png 1600w');

		// preserveFigures: 'html' keeps full <figure> + srcset in Markdown
		const resultHtmlFig = await clip({
			html,
			url: 'https://www.science.org/doi/10.1126/science.abc1234',
			template: makeTemplate({ preserveFigures: 'html' }),
			documentParser,
		});
		expect(resultHtmlFig.content).toContain('<figure id="fig1">');
		expect(resultHtmlFig.content).toContain('srcset="https://www.science.org/images/fig1a-400.png 400w, https://www.science.org/images/fig1a-1600.png 1600w"');
	});

	test('respects academicMode: false, granular option overrides, and does not misclassify non-academic blogs', async () => {
		const blogHtml = `
			<!doctype html>
			<html>
				<head><title>Weekend Cooking Blog</title></head>
				<body>
					<article>
						<h1>Weekend Cooking Blog</h1>
						<p>${'Homemade sourdough bread relies on natural fermentation and patient folding. '.repeat(8)}</p>
					</article>
				</body>
			</html>
		`;
		const blogDoc = documentParser.parseFromString(blogHtml, 'text/html');
		expect(detectAcademicArticle(blogDoc, 'https://example.com/blog/sourdough')).toBe(false);
		expect(resolveAcademicOptions(undefined, { doc: blogDoc, url: 'https://example.com/blog/sourdough' }).anyEnabled).toBe(false);

		const academicHtml = `
			<!doctype html>
			<html>
				<head>
					<title>Test Paper</title>
					<meta name="citation_doi" content="10.1000/test.2" />
				</head>
				<body>
					<article>
						<h1>Test Paper</h1>
						<p>${'Analytical model details and derivations follow. '.repeat(8)} Cite <a class="ref" href="#CR1">1</a>.</p>
						<ol class="references"><li id="CR1">Ref 1</li></ol>
					</article>
				</body>
			</html>
		`;

		// Disabling academicMode prevents citation shielding
		const disabled = await clip({
			html: academicHtml,
			url: 'https://example.com/paper',
			academicMode: false,
			template: makeTemplate(),
			documentParser,
		});
		expect(disabled.content).not.toContain('[1](#CR1)');

		// Granular override: academicMode: false + preserveCitationLinks: true
		const citationOnly = await clip({
			html: academicHtml,
			url: 'https://example.com/paper',
			academicMode: false,
			preserveCitationLinks: true,
			preserveReferenceAnchors: false,
			template: makeTemplate(),
			documentParser,
		});
		expect(citationOnly.content).toContain('[1](#CR1)');
		expect(citationOnly.content).not.toContain('<a id="CR1"></a>');
	});

	test('markdown filter and createAcademicMarkdownContent preserve academic structure directly from rawContentHtml', () => {
		const rawHtml = `
			<article>
				<p>Result from <a href="#CR1">1</a> and <math><msup><mi>z</mi><mn>2</mn></msup></math>.</p>
				<ol class="references"><li id="CR1">Reference One</li></ol>
			</article>
		`;
		const md = createAcademicMarkdownContent(rawHtml, 'https://example.com/paper', { academicMode: true }, documentParser);
		expect(md).toContain('[1](#CR1)');
		expect(md).toContain('$z^{2}$');
		expect(md).toContain('<a id="CR1"></a>Reference One');

		// Filter path (note: applyFilters uses global DOMParser, available in jsdom/browser/CLI)
		if (typeof DOMParser !== 'undefined') {
			const filtered = applyFilters(rawHtml, 'markdown', 'https://example.com/paper');
			expect(filtered).toContain('[1](#CR1)');
		}
	});
});
