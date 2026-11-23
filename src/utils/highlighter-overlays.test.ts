// @vitest-environment jsdom
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderTextHighlight, clearTextHighlights, syncHoverListener, handleMouseUp, markHighlightJustCreated } from './highlighter-overlays';
import { AnyHighlightData, highlights, updateHighlights, applyHighlights, setPageUrl } from './highlighter';
import { getElementXPath } from './dom-utils';
import { emitStorageChange } from './__mocks__/webextension-polyfill';

// Capture ranges handed to the CSS Custom Highlight API (not implemented in
// jsdom), so we can assert what renderTextHighlight resolved.
const addedRanges: Range[] = [];

beforeAll(() => {
	class MockHighlight {
		priority = 0;
		add(range: Range) { addedRanges.push(range); }
		clear() { addedRanges.length = 0; }
	}
	(window as unknown as { Highlight: unknown }).Highlight = MockHighlight;
	(globalThis as unknown as { Highlight: unknown }).Highlight = MockHighlight;
	(globalThis as unknown as { CSS: unknown }).CSS = { highlights: new Map() };
});

beforeEach(() => {
	clearTextHighlights();
	addedRanges.length = 0;
});

describe('renderTextHighlight', () => {
	test('resolves a highlight by its stored XPath + offsets', () => {
		document.body.innerHTML = '<p>Hello world.</p>';
		const p = document.querySelector('p')!;
		renderTextHighlight({ id: '1', xpath: getElementXPath(p), startOffset: 0, endOffset: 5 });
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('Hello');
	});

	// Regression: a highlight made in a different DOM (live vs reader, or a
	// regenerated reader view) has a stale XPath. It must still render by
	// falling back to locating its stored content text.
	test('falls back to content text when the XPath is stale', () => {
		document.body.innerHTML =
			'<article><p>A seismic shift is rocking the healthcare industry. Much like Uber once did.</p></article>';
		renderTextHighlight({
			id: '2',
			xpath: '/html[1]/body[1]/div[7]/p[42]', // does not resolve
			startOffset: 0,
			endOffset: 0,
			content: '<p>A seismic shift is rocking the healthcare industry.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('A seismic shift is rocking the healthcare industry.');
	});

	test('skips the highlighter UI chrome when searching by content', () => {
		// Same text appears in a reader settings panel; the fallback must match
		// the article copy, not the chrome.
		document.body.innerHTML =
			'<div class="obsidian-reader-settings">Reader settings</div>' +
			'<article><p>Reader settings make the page easier to read.</p></article>';
		renderTextHighlight({
			id: '3',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>Reader settings make the page easier to read.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		const container = addedRanges[0].startContainer.parentElement;
		expect(container?.closest('article')).not.toBeNull();
	});

	// A highlight spanning an inline element (e.g. a link mid-sentence) is split
	// across multiple text nodes; the content fallback must still span them.
	test('falls back across inline elements within the highlighted text', () => {
		document.body.innerHTML = '<article><p>A <a href="#">seismic</a> shift is here.</p></article>';
		renderTextHighlight({
			id: '5',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>A seismic shift is here.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('A seismic shift is here.');
	});

	// A stale XPath can resolve to a *different* element with different text.
	// renderTextHighlight must reject that and re-anchor by content.
	test('rejects an XPath that resolves to the wrong text and falls back', () => {
		document.body.innerHTML =
			'<article><p>Wrong paragraph text.</p><p>Correct sentence to find.</p></article>';
		const wrongP = document.querySelector('p')!;
		renderTextHighlight({
			id: '6',
			xpath: getElementXPath(wrongP), // resolves, but to the wrong paragraph
			startOffset: 0,
			endOffset: 'Wrong paragraph text.'.length,
			content: '<p>Correct sentence to find.</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('Correct sentence to find.');
	});

	// The same prose can be spaced differently across DOMs (raw textContent
	// keeps source newlines/indentation). Matching is whitespace-normalized.
	test('matches across differing whitespace', () => {
		document.body.innerHTML = '<article><p>the quick   brown\n      fox jumps over</p></article>';
		renderTextHighlight({
			id: '7',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>the quick brown fox jumps over</p>',
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString().replace(/\s+/g, ' ').trim()).toBe('the quick brown fox jumps over');
	});

	// When the exact text occurs more than once, stored prefix/suffix context
	// selects the correct occurrence rather than always the first.
	test('uses prefix/suffix context to pick the right duplicate', () => {
		document.body.innerHTML =
			'<article>' +
			'<p>Intro paragraph. The term applies here. More intro text.</p>' +
			'<p>Second paragraph. The term applies here. Closing remarks.</p>' +
			'</article>';
		const secondP = document.querySelectorAll('p')[1];
		renderTextHighlight({
			id: '8',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>The term applies here.</p>',
			textQuote: { prefix: 'Second paragraph. ', suffix: ' Closing remarks.' },
		});
		expect(addedRanges).toHaveLength(1);
		expect(addedRanges[0].toString()).toBe('The term applies here.');
		// Must anchor inside the *second* paragraph, not the first.
		expect(secondP.contains(addedRanges[0].startContainer)).toBe(true);
	});

	test('renders nothing when neither XPath nor content matches', () => {
		document.body.innerHTML = '<article><p>Unrelated text.</p></article>';
		renderTextHighlight({
			id: '4',
			xpath: '/nonexistent',
			startOffset: 0,
			endOffset: 0,
			content: '<p>This sentence is not on the page.</p>',
		});
		expect(addedRanges).toHaveLength(0);
	});
});


describe('highlight annotation controls', () => {
	const noteId = '1700000000001';

	function textHighlight(id: string, paragraph: Element, notes?: string[], groupId?: string): AnyHighlightData {
		return {
			id,
			type: 'text',
			xpath: getElementXPath(paragraph),
			startOffset: 0,
			endOffset: paragraph.textContent!.length,
			content: paragraph.outerHTML,
			...(notes ? { notes } : {}),
			...(groupId ? { groupId } : {}),
		};
	}

	function clickHighlight(row = 0) {
		document.querySelectorAll('article p')[row].dispatchEvent(
			new MouseEvent('click', { bubbles: true, clientX: 80, clientY: 70 + row * 60 }),
		);
	}

	function openEditor(row = 0): HTMLTextAreaElement {
		clickHighlight(row);
		const button = document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotate-button');
		expect(button?.style.display).not.toBe('none');
		button!.click();
		return document.querySelector<HTMLTextAreaElement>('.obsidian-highlight-annotation-textarea')!;
	}

	beforeAll(() => {
		// jsdom has no layout. Only geometry is supplied here; event handling,
		// highlight state, note updates and storage calls use the real modules.
		Object.defineProperty(Range.prototype, 'getClientRects', {
			configurable: true,
			value: function (this: Range) {
				const row = Number(this.startContainer.parentElement?.closest('p')?.getAttribute('data-row') || 0);
				return [new DOMRect(40, 60 + row * 60, 220, 20)];
			},
		});
	});

	beforeEach(() => {
		updateHighlights([]);
		syncHoverListener();
		document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotation-editor [data-action="cancel"]')?.click();
		document.querySelector('article')?.remove();
		const article = document.createElement('article');
		article.innerHTML = '<p data-row="0">A synthetic highlighted sentence.</p>' +
			'<p data-row="1">A second synthetic highlighted sentence.</p>';
		document.body.appendChild(article);
		document.body.classList.remove('obsidian-highlighter-active');
		window.getSelection()?.removeAllRanges();
		setPageUrl('https://example.invalid/annotation-ui');
		updateHighlights([textHighlight(noteId, article.querySelector('p')!)]);
		applyHighlights();
	});

	afterEach(() => {
		document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotation-editor [data-action="cancel"]')?.click();
		updateHighlights([]);
		syncHoverListener();
		window.getSelection()?.removeAllRanges();
	});

	test('opens the prototype editor from a text highlight using its stable id', () => {
		updateHighlights([textHighlight(noteId, document.querySelector('article p')!, ['Existing annotation'])]);
		applyHighlights();
		const textarea = openEditor();
		const editor = textarea.closest<HTMLElement>('.obsidian-highlight-annotation-editor')!;
		expect(editor.dataset.highlightId).toBe(noteId);
		expect(textarea.value).toBe('Existing annotation');
		expect(textarea.getAttribute('aria-label')).toBeTruthy();
		expect(document.activeElement).toBe(textarea);
		expect(document.querySelectorAll('.obsidian-highlight-annotation-editor')).toHaveLength(1);
	});

	test('saves a multiline annotation with Shift+Enter and closes the editor', () => {
		const textarea = openEditor();
		textarea.value = 'First synthetic line\nSecond synthetic line';
		textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
		expect(highlights[0].notes).toEqual(['First synthetic line\nSecond synthetic line']);
		expect(document.querySelector('.obsidian-highlight-annotation-editor')).toBeNull();
	});

	test('clears existing notes through the Save button without deleting the highlight', () => {
		updateHighlights([textHighlight(noteId, document.querySelector('article p')!, ['Old annotation'])]);
		applyHighlights();
		const textarea = openEditor();
		textarea.value = ' \n ';
		document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotation-editor [data-action="save"]')!.click();
		expect(highlights).toHaveLength(1);
		expect(highlights[0].notes).toEqual([]);
	});

	test('Escape and Cancel discard edits without mutating the saved annotation', () => {
		updateHighlights([textHighlight(noteId, document.querySelector('article p')!, ['Saved annotation'])]);
		applyHighlights();
		let textarea = openEditor();
		textarea.value = 'Unsaved draft';
		textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.querySelector('.obsidian-highlight-annotation-editor')).toBeNull();
		expect(highlights[0].notes).toEqual(['Saved annotation']);

		textarea = openEditor();
		textarea.value = 'Another unsaved draft';
		document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotation-editor [data-action="cancel"]')!.click();
		expect(document.querySelector('.obsidian-highlight-annotation-editor')).toBeNull();
		expect(highlights[0].notes).toEqual(['Saved annotation']);
	});

	test('Escape cancels annotation edits when either action button has focus', () => {
		updateHighlights([textHighlight(noteId, document.querySelector('article p')!, ['SAVED_ANNOTATION_PLACEHOLDER'])]);
		applyHighlights();

		for (const action of ['save', 'cancel']) {
			const textarea = openEditor();
			textarea.value = 'UNSAVED_DRAFT_PLACEHOLDER';
			const button = document.querySelector<HTMLButtonElement>(
				'.obsidian-highlight-annotation-editor [data-action="' + action + '"]',
			)!;
			button.focus();
			expect(document.activeElement).toBe(button);

			const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
			button.dispatchEvent(escape);

			expect(document.querySelector('.obsidian-highlight-annotation-editor')).toBeNull();
			expect(escape.defaultPrevented).toBe(true);
			expect(highlights[0].notes).toEqual(['SAVED_ANNOTATION_PLACEHOLDER']);
		}
	});

	test('prefills notes from the full selection group and edits the group only once', () => {
		const paragraphs = document.querySelectorAll('article p');
		updateHighlights([
			textHighlight(noteId, paragraphs[0], ['First old note'], 'synthetic-group'),
			textHighlight('1700000000002', paragraphs[1], ['Second old note'], 'synthetic-group'),
		]);
		applyHighlights();
		const textarea = openEditor(1);
		expect(textarea.value).toBe('First old note\nSecond old note');
		expect(textarea.closest<HTMLElement>('.obsidian-highlight-annotation-editor')!.dataset.highlightId)
			.toBe('1700000000002');
		textarea.value = 'One revised group annotation';
		textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
		expect(highlights.map(highlight => highlight.notes)).toEqual([['One revised group annotation'], []]);
	});

	test('does not turn an editor mouseup into a page highlight even with a noncollapsed selection', () => {
		const textarea = openEditor();
		const paragraphText = document.querySelector('article p')!.firstChild!;
		const selection = window.getSelection()!;
		const range = document.createRange();
		range.setStart(paragraphText, 0);
		range.setEnd(paragraphText, 5);
		selection.addRange(range);
		textarea.addEventListener('mouseup', handleMouseUp);
		textarea.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 80, clientY: 70 }));
		expect(highlights).toHaveLength(1);
		expect(highlights[0].id).toBe(noteId);
		expect(highlights[0].notes).toBeUndefined();
	});

	test('keeps an unsaved editor draft on viewport resize', () => {
		const textarea = openEditor();
		textarea.value = 'Draft surviving a layout change';
		window.dispatchEvent(new Event('resize'));
		expect(document.querySelector('.obsidian-highlight-annotation-textarea')).toBe(textarea);
		expect(textarea.value).toBe('Draft surviving a layout change');
	});

	test('reattaches cached actions and replaces a detached editor after Reader swaps the body', () => {
		const firstEditor = openEditor().closest<HTMLElement>('.obsidian-highlight-annotation-editor')!;
		const annotate = document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotate-button')!;
		const remove = document.querySelector<HTMLButtonElement>('.obsidian-highlight-delete')!;
		// Reader replaces body children while preserving the content-script owner.
		firstEditor.remove();
		annotate.remove();
		remove.remove();
		const textarea = openEditor();
		expect(document.querySelector('.obsidian-highlight-annotate-button')).toBe(annotate);
		expect(document.querySelector('.obsidian-highlight-delete')).toBe(remove);
		expect(annotate.isConnected).toBe(true);
		expect(remove.isConnected).toBe(true);
		expect(textarea.closest('.obsidian-highlight-annotation-editor')).not.toBe(firstEditor);
		expect(document.activeElement).toBe(textarea);
	});

	test('applies real external note changes and removes an editor when its highlight is deleted', () => {
		const pageUrl = 'https://example.invalid/annotation-ui';
		const changed = { ...highlights[0], notes: ['A changed synthetic note'] };
		emitStorageChange({ highlights: { newValue: {
			[pageUrl]: { url: pageUrl, title: 'Synthetic article', highlights: [changed] },
		} } });
		expect(highlights[0].notes).toEqual(['A changed synthetic note']);
		const textarea = openEditor();
		expect(textarea.value).toBe('A changed synthetic note');
		textarea.value = 'A local draft for a record that will be deleted';

		emitStorageChange({ highlights: { newValue: {} } });
		expect(highlights).toHaveLength(0);
		expect(document.querySelector('.obsidian-highlight-annotation-editor')).toBeNull();
		expect(document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotate-button')!.style.display).toBe('none');
	});

	test('keeps immediate actions and an editor draft when storage echoes equivalent reordered fields', () => {
		const pageUrl = 'https://example.invalid/annotation-ui';
		const original = textHighlight(noteId, document.querySelector('article p')!);
		if (original.type === 'text') {
			original.textQuote = { prefix: 'Synthetic prefix', suffix: 'Synthetic suffix' };
		}
		updateHighlights([original]);
		applyHighlights();
		// Browser storage can reconstruct dictionaries in a different key order,
		// including nested text anchors, while retaining exactly the same data.
		const echoed = Object.fromEntries(Object.entries(original).reverse());
		echoed.textQuote = { suffix: 'Synthetic suffix', prefix: 'Synthetic prefix' };
		expect(Object.keys(echoed)).not.toEqual(Object.keys(original));
		const change = { highlights: { newValue: {
			[pageUrl]: { url: pageUrl, title: 'Synthetic article', highlights: [echoed] },
		} } };
		const range = document.createRange();
		range.selectNodeContents(document.querySelector('article p')!.firstChild!);
		const selection = window.getSelection()!;
		selection.addRange(range);
		markHighlightJustCreated();
		selection.removeAllRanges();
		const annotate = document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotate-button')!;
		expect(annotate.style.display).not.toBe('none');

		emitStorageChange(change);
		expect(annotate.style.display).not.toBe('none');
		annotate.click();
		const textarea = document.querySelector<HTMLTextAreaElement>('.obsidian-highlight-annotation-textarea')!;
		expect(textarea).not.toBeNull();
		textarea.value = 'Unsaved synthetic draft across an equivalent storage echo';
		emitStorageChange(change);
		expect(document.querySelector('.obsidian-highlight-annotation-textarea')).toBe(textarea);
		expect(textarea.value).toBe('Unsaved synthetic draft across an equivalent storage echo');
	});

	test('offers Annotate immediately after a selection and preserves it through the trailing drag click', () => {
		const text = document.querySelector('article p')!.firstChild!;
		const range = document.createRange();
		range.selectNodeContents(text);
		const selection = window.getSelection()!;
		selection.addRange(range);

		markHighlightJustCreated();
		selection.removeAllRanges(); // The selection flow clears the native range next.
		const annotate = document.querySelector<HTMLButtonElement>('.obsidian-highlight-annotate-button')!;
		expect(annotate).not.toBeNull();
		expect(annotate.style.display).not.toBe('none');

		// A drag ending outside the highlight still dispatches a page click.
		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 500, clientY: 500 }));
		expect(annotate.style.display).not.toBe('none');
		annotate.click();
		const editor = document.querySelector<HTMLElement>('.obsidian-highlight-annotation-editor')!;
		expect(editor.dataset.highlightId).toBe(noteId);
		expect(document.activeElement).toBe(editor.querySelector('textarea'));
	});
});
