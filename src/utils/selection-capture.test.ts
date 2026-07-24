// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { captureSelectionSnapshot } from './selection-capture';

describe('captureSelectionSnapshot', () => {
	test('clones the exact selected range while preserving HTML structure', () => {
		document.body.innerHTML = '<h2>Heading</h2><p>One <a href="/link">linked</a> line</p><ul><li>Item</li></ul>';
		const paragraph = document.querySelector('p')!;
		const range = document.createRange();
		range.selectNode(paragraph);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);

		const snapshot = captureSelectionSnapshot(selection, document);

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
});
