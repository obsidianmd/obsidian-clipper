// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { Reader } from './reader';

// Runtime exercise of the reader's text-direction logic (#864). applyReaderDirection
// is the single shared helper used by every reader path (live page, standalone
// reader page, and in-reader navigation), so testing it covers the contract for all.
const applyDir = (doc: Document, sourceDir: string | null | undefined, language: string | null | undefined) =>
	(Reader as unknown as {
		applyReaderDirection: (d: Document, s?: string | null, l?: string | null) => void;
	}).applyReaderDirection(doc, sourceDir, language);

const extractContent = (doc: Document) =>
	(Reader as unknown as {
		extractContent: (d: Document) => Promise<{ dir?: string }>;
	}).extractContent(doc);

function freshDoc(): Document {
	return document.implementation.createHTMLDocument('test');
}

describe('reader direction (applyReaderDirection)', () => {
	test('preserves a direction declared on the source body', async () => {
		const doc = freshDoc();
		doc.body.setAttribute('dir', 'rtl');
		doc.body.innerHTML = '<article><h1>Title</h1><p>Article content.</p></article>';
		Object.defineProperty(doc, 'URL', { value: 'https://example.com/article', configurable: true });

		const content = await extractContent(doc);
		expect(content.dir).toBe('rtl');
	});

	test('derives dir="rtl" from an RTL article language', () => {
		const doc = freshDoc();
		applyDir(doc, undefined, 'ar');
		expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
	});

	test('handles other RTL languages and region subtags', () => {
		for (const lang of ['fa', 'he', 'ur', 'ar-EG']) {
			const doc = freshDoc();
			applyDir(doc, undefined, lang);
			expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
		}
	});

	test('leaves no dir for an LTR language', () => {
		const doc = freshDoc();
		applyDir(doc, undefined, 'en');
		expect(doc.documentElement.getAttribute('dir')).toBeNull();
	});

	test('honors an explicit source dir even when the page declares no language', () => {
		const doc = freshDoc();
		applyDir(doc, 'rtl', undefined);
		expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
	});

	test('an explicit source dir takes precedence over the language', () => {
		const doc = freshDoc();
		applyDir(doc, 'ltr', 'ar');
		expect(doc.documentElement.getAttribute('dir')).toBe('ltr');
	});

	test('resets a stale direction when navigating to an LTR article', () => {
		const doc = freshDoc();
		applyDir(doc, undefined, 'ar');
		expect(doc.documentElement.getAttribute('dir')).toBe('rtl');
		applyDir(doc, undefined, 'en');
		expect(doc.documentElement.getAttribute('dir')).toBeNull();
	});
});
