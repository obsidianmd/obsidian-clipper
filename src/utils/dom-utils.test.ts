// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { getElementByXPathInDoc, wrapTextWithMark, wrapElementWithMark } from './dom-utils';

// These cover the inline-highlight fix: highlights must be markable on a
// CLONED document (so they can be applied before Defuddle extraction), and a
// partial highlight that crosses an inline element must not be silently
// dropped.

function docFrom(html: string): Document {
	return new DOMParser().parseFromString(html, 'text/html');
}

describe('wrapTextWithMark (ownerDocument-aware)', () => {
	it('wraps a partial offset range in <mark> on a cloned/separate document', () => {
		const doc = docFrom('<p>The reason was buried in the S-1.</p>');
		const clone = doc.cloneNode(true) as Document;
		const p = clone.querySelector('p')!;

		// "reason" sits at offset 4..10 of "The reason was buried in the S-1."
		wrapTextWithMark(p, { startOffset: 4, endOffset: 10 });

		const mark = p.querySelector('mark');
		expect(mark).not.toBeNull();
		expect(mark!.textContent).toBe('reason');
	});

	it('does not throw and still marks when the range crosses an inline element', () => {
		// A fragment spanning across a <a> boundary makes surroundContents()
		// throw; the extractContents() fallback must handle it.
		const doc = docFrom('<p>billions of <a href="#">consumer discounts</a> and driver incentives</p>');
		const p = doc.querySelector('p')!;
		const full = p.textContent || '';
		const start = full.indexOf('of consumer');
		const end = full.indexOf('and') - 1; // through "...discounts "

		expect(() => wrapTextWithMark(p, { startOffset: start, endOffset: end })).not.toThrow();

		const mark = p.querySelector('mark');
		expect(mark).not.toBeNull();
		expect((mark!.textContent || '').includes('consumer discounts')).toBe(true);
	});
});

describe('wrapElementWithMark (ownerDocument-aware)', () => {
	it('wraps an element\'s contents in <mark> on a cloned document', () => {
		const clone = docFrom('<blockquote>whole block</blockquote>').cloneNode(true) as Document;
		const bq = clone.querySelector('blockquote')!;
		wrapElementWithMark(bq);
		expect(bq.querySelector('mark')?.textContent).toBe('whole block');
	});
});

describe('getElementByXPathInDoc', () => {
	it('resolves an xpath against the passed document, not the global one', () => {
		const doc = docFrom('<div><section><p>first</p><p>target</p></section></div>');
		const el = getElementByXPathInDoc('/html/body/div/section/p[2]', doc);
		expect(el?.textContent).toBe('target');
	});
});
