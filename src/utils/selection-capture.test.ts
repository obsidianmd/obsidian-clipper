// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { captureSelectionSnapshot } from './selection-capture';
import { createMarkdownContent } from 'defuddle/full';

function selectNode(node: Node): Selection {
	const range = document.createRange();
	range.selectNode(node);
	const selection = window.getSelection()!;
	selection.removeAllRanges();
	selection.addRange(range);
	return selection;
}

describe('captureSelectionSnapshot', () => {
	test('clones the exact selected range while preserving HTML structure', () => {
		document.body.innerHTML = '<h2>Heading</h2><p>One <a href="/link">linked</a> line</p><ul><li>Item</li></ul>';
		const paragraph = document.querySelector('p')!;
		const snapshot = captureSelectionSnapshot(selectNode(paragraph), document);

		expect(snapshot?.html).toContain('<p>One <a href="/link">linked</a> line</p>');
		expect(snapshot?.text).toBe('One linked line');
	});

	test('keeps paragraph separation in the text fallback', () => {
		const fakeSelection = {
			isCollapsed: false,
			rangeCount: 1,
			toString: () => 'First paragraph\n\nSecond paragraph',
			getRangeAt: () => { throw new Error('Range unavailable'); },
		} as unknown as Selection;

		const snapshot = captureSelectionSnapshot(fakeSelection, document);

		expect(snapshot?.html).toBe('<p>First paragraph</p><p>Second paragraph</p>');
	});

	test('preserves semantic unordered lists as Markdown lists', () => {
		document.body.innerHTML = '<ul><li>First</li><li>Second <strong>bold</strong></li></ul>';
		const snapshot = captureSelectionSnapshot(selectNode(document.querySelector('ul')!), document);

		expect(snapshot?.html).toBe('<ul><li>First</li><li>Second <strong>bold</strong></li></ul>');
		expect(createMarkdownContent(snapshot!.html, 'https://example.test/')).toContain('- First');
		expect(createMarkdownContent(snapshot!.html, 'https://example.test/')).toContain('- Second **bold**');
	});

	test('preserves ordered and nested list indentation', () => {
		document.body.innerHTML = '<ol><li>First<ul><li>Nested</li></ul></li><li>Second</li></ol>';
		const snapshot = captureSelectionSnapshot(selectNode(document.querySelector('ol')!), document);
		const markdown = createMarkdownContent(snapshot!.html, 'https://example.test/');

		expect(snapshot?.html).toContain('<ol>');
		expect(snapshot?.html).toContain('<ul><li>Nested</li></ul>');
		expect(markdown).toMatch(/1\. First/);
		expect(markdown).toMatch(/\s+- Nested/);
	});

	test('reconstructs only selected list items inside their nearest list wrapper', () => {
		document.body.innerHTML = '<ul><li>Before</li><li>Selected one</li><li>Selected two</li><li>After</li></ul>';
		const items = document.querySelectorAll('li');
		const range = document.createRange();
		range.setStartBefore(items[1]);
		range.setEndAfter(items[2]);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		const snapshot = captureSelectionSnapshot(selection, document);

		expect(snapshot?.html).toBe('<ul><li>Selected one</li><li>Selected two</li></ul>');
		expect(createMarkdownContent(snapshot!.html, 'https://example.test/')).toContain('- Selected one');
		expect(snapshot?.html).not.toContain('Before');
		expect(snapshot?.html).not.toContain('After');
	});

	test('converts high-confidence visual bullet pairs into a list without isolated glyphs', () => {
		document.body.innerHTML = '<div><span>•</span><p>First</p><span>•</span><p>Second</p></div>';
		const snapshot = captureSelectionSnapshot(selectNode(document.body.firstElementChild!), document);

		expect(snapshot?.html).toContain('<ul><li>First</li><li>Second</li></ul>');
		expect(snapshot?.html).not.toMatch(/[•·]/);
		expect(createMarkdownContent(snapshot!.html, 'https://example.test/')).toContain('- First');
	});

	test('converts an isolated visual bullet marker when it directly labels an item', () => {
		document.body.innerHTML = '<div><span>•</span><p>Only item</p></div>';
		const snapshot = captureSelectionSnapshot(selectNode(document.body.firstElementChild!), document);

		expect(snapshot?.html).toContain('<ul><li>Only item</li></ul>');
		expect(snapshot?.html).not.toContain('•');
	});

	test('converts role-based fake list containers but leaves normal punctuation intact', () => {
		document.body.innerHTML = '<div><div role="list"><div role="listitem">First</div><div role="listitem">Second</div></div><p>A normal sentence.</p></div>';
		const snapshot = captureSelectionSnapshot(selectNode(document.body.firstElementChild!), document);

		expect(snapshot?.html).toContain('<ul><li>First</li><li>Second</li></ul>');
		expect(snapshot?.html).toContain('<p>A normal sentence.</p>');
	});

	test('converts repeated CSS list-item blocks without semantic li elements', () => {
		document.body.innerHTML = '<div><div style="display:list-item">First</div><div style="display:list-item">Second</div></div>';
		const snapshot = captureSelectionSnapshot(selectNode(document.body.firstElementChild!), document);

		expect(snapshot?.html).toContain('<ul><li>First</li><li>Second</li></ul>');
	});

	test('does not disturb non-list block structure', () => {
		document.body.innerHTML = '<article><h2>Heading</h2><p>Paragraph with <em>emphasis</em>, <a href="/link">link</a>, and <strong>bold</strong>.</p><blockquote>Quote</blockquote><pre><code>const x = 1;</code></pre><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table><figure><img src="image.png"><figcaption>Caption</figcaption></figure></article>';
		const snapshot = captureSelectionSnapshot(selectNode(document.querySelector('article')!), document);

		for (const tag of ['h2', 'p', 'blockquote', 'pre', 'table', 'figure', 'img', 'figcaption']) {
			expect(snapshot?.html).toContain(`<${tag}`);
		}
		expect(snapshot?.html).toContain('<strong>bold</strong>');
		expect(snapshot?.html).toContain('<em>emphasis</em>');
	});
});
