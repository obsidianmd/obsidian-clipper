import { describe, test, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { applyHighlightsToDocument, unwrapHighlightMarks } from './highlight-marker';
import { AnyHighlightData } from './highlighter';

// jsdom installs window/document globals so the production code (which
// references DOMParser, document.createTreeWalker, NodeFilter, XPathResult,
// Range, etc.) can run unmodified under Node.
beforeAll(() => {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	const g = globalThis as Record<string, unknown>;
	g.window = dom.window;
	g.document = dom.window.document;
	g.DOMParser = dom.window.DOMParser;
	g.Node = dom.window.Node;
	g.NodeFilter = dom.window.NodeFilter;
	g.XPathResult = dom.window.XPathResult;
	g.Range = dom.window.Range;
	g.Text = dom.window.Text;
	g.HTMLElement = dom.window.HTMLElement;
});

function buildDocument(bodyHtml: string): Document {
	const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
	return dom.window.document;
}

function buildTextHighlight(
	xpath: string,
	startOffset: number,
	endOffset: number,
	id = `${Date.now()}`,
): AnyHighlightData {
	return {
		id,
		type: 'text',
		xpath,
		content: '',
		startOffset,
		endOffset,
	};
}

describe('applyHighlightsToDocument', () => {
	test('wraps a partial single-text-node selection', () => {
		const doc = buildDocument('<p id="t">Hello there world</p>');
		const xpath = '/html/body/p';
		applyHighlightsToDocument(doc, [buildTextHighlight(xpath, 6, 11)]);

		const html = doc.body.innerHTML;
		expect(html).toContain('Hello <mark>there</mark> world');
	});

	test('wraps a selection that spans an inline link (extract+insert path)', () => {
		// Mirrors AfterCertainty highlight [4]: "...are countries, not companies..."
		// where the source HTML has the word "countries" inside an <a> tag.
		const doc = buildDocument(
			'<p>Lastly, there are the Mag7 which are <a href="x">countries</a>, not companies. End.</p>',
		);
		const xpath = '/html/body/p';
		// "Mag7 which are countries, not companies. End."
		// Concatenated text-content offsets:
		//   "Lastly, there are the Mag7 which are " ends at 37
		//   "countries" 37..46
		//   ", not companies. End." 46..67
		applyHighlightsToDocument(doc, [buildTextHighlight(xpath, 22, 60)]);

		const html = doc.body.innerHTML;
		// Range crossed an <a>; mark must wrap a fragment that still contains
		// the link element.
		expect(html).toContain('<mark>');
		expect(html).toContain('</mark>');
		expect(html).toContain('<a href="x">countries</a>');
		// The plain text inside the document should be unchanged after marking.
		expect(doc.body.textContent).toBe(
			'Lastly, there are the Mag7 which are countries, not companies. End.',
		);
	});

	test('wraps a selection that spans <em> formatting', () => {
		// Mirrors AfterCertainty highlight [1]: "as *extremely obvious* when somet"
		const doc = buildDocument(
			'<p>It was that it was <em>extremely obvious</em> when something happened.</p>',
		);
		const xpath = '/html/body/p';
		// "as " "extremely obvious" " when somet" — start at 15, end at 47
		applyHighlightsToDocument(doc, [buildTextHighlight(xpath, 15, 47)]);

		const html = doc.body.innerHTML;
		expect(html).toContain('<mark>');
		expect(html).toContain('<em>extremely obvious</em>');
	});

	test('selection starting mid-word (xpath valid) still marks correctly', () => {
		// Mirrors AfterCertainty highlight [0]: "n growth stage investing..." where
		// the user accidentally started selection inside the word "when".
		const doc = buildDocument(
			'<p>There was a time when growth stage investing was simple.</p>',
		);
		const xpath = '/html/body/p';
		// offsets: "There was a time whe" = 20, "n growth stage investing" = 24 chars
		applyHighlightsToDocument(doc, [buildTextHighlight(xpath, 20, 44)]);

		const html = doc.body.innerHTML;
		expect(html).toContain('whe<mark>n growth stage investing</mark>');
	});

	test('multiple highlights apply independently', () => {
		const doc = buildDocument(
			'<p id="a">First paragraph.</p><p id="b">Second paragraph.</p>',
		);
		applyHighlightsToDocument(doc, [
			buildTextHighlight('/html/body/p[1]', 0, 5, 'a'),
			buildTextHighlight('/html/body/p[2]', 7, 16, 'b'),
		]);

		const html = doc.body.innerHTML;
		expect(html).toContain('<mark>First</mark> paragraph.');
		expect(html).toContain('Second <mark>paragraph</mark>.');
	});

	test('unwrapHighlightMarks restores the document', () => {
		const doc = buildDocument('<p>Hello there world</p>');
		const xpath = '/html/body/p';
		const insertions = applyHighlightsToDocument(doc, [
			buildTextHighlight(xpath, 6, 11),
		]);
		expect(doc.body.innerHTML).toContain('<mark>');

		unwrapHighlightMarks(insertions);
		expect(doc.body.innerHTML).toBe('<p>Hello there world</p>');
	});

	test('xpath that does not resolve is silently skipped', () => {
		const doc = buildDocument('<p>Hello world</p>');
		const insertions = applyHighlightsToDocument(doc, [
			buildTextHighlight('/html/body/div/section/article', 0, 5),
		]);
		expect(insertions).toHaveLength(0);
		expect(doc.body.innerHTML).toBe('<p>Hello world</p>');
	});
});
