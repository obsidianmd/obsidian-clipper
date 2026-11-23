// @vitest-environment jsdom
import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import {
	AnyHighlightData,
	HighlightsStorage,
	applyHighlights,
	canRedo,
	collapseGroupsForExport,
	createTextQuoteAnchor,
	highlights,
	loadHighlights,
	redo,
	setPageTitle,
	setPageUrl,
	undo,
	updateHighlightNotes,
	updateHighlights,
} from './highlighter';
import browser from './browser-polyfill';

function container(text: string): Element {
	const el = document.createElement('p');
	el.textContent = text;
	return el;
}

describe('createTextQuoteAnchor', () => {
	test('captures the text on each side of the selection', () => {
		const el = container('Intro. The term applies here. Outro.');
		const start = 'Intro. '.length;
		const end = start + 'The term applies here.'.length;
		expect(createTextQuoteAnchor(el, start, end)).toEqual({
			prefix: 'Intro. ',
			suffix: ' Outro.',
		});
	});

	test('returns an empty prefix when the selection starts the block', () => {
		const el = container('The term applies here. Outro.');
		const anchor = createTextQuoteAnchor(el, 0, 'The term applies here.'.length);
		expect(anchor?.prefix).toBe('');
		expect(anchor?.suffix).toBe(' Outro.');
	});

	test('caps context at 64 characters per side', () => {
		const pad = 'x'.repeat(100);
		const el = container(`${pad}MIDDLE${pad}`);
		const anchor = createTextQuoteAnchor(el, 100, 106)!;
		expect(anchor.prefix).toBe('x'.repeat(64));
		expect(anchor.suffix).toBe('x'.repeat(64));
	});

	test('returns undefined for a whitespace-only selection', () => {
		const el = container('before    after');
		expect(createTextQuoteAnchor(el, 'before'.length, 'before    '.length)).toBeUndefined();
	});
});

describe('updateHighlightNotes', () => {
	const pageUrl = 'https://example.invalid/synthetic-article';
	let stored: { highlights?: HighlightsStorage };

	function highlight(id: string, notes?: string[], groupId?: string): AnyHighlightData {
		return {
			id,
			type: 'element',
			xpath: '/html[1]/body[1]/missing[1]',
			content: '<p>Synthetic highlighted passage.</p>',
			...(notes ? { notes } : {}),
			...(groupId ? { groupId } : {}),
		};
	}

	beforeEach(() => {
		document.body.innerHTML = '<main><p>Synthetic article.</p></main>';
		vi.stubGlobal('CSS', { highlights: new Map() });
		stored = {};
		vi.spyOn(browser.storage.local, 'get').mockImplementation(async () =>
			JSON.parse(JSON.stringify(stored)));
		vi.spyOn(browser.storage.local, 'set').mockImplementation(async (items) => {
			Object.assign(stored, JSON.parse(JSON.stringify(items)));
		});
		setPageUrl(pageUrl);
		setPageTitle('Synthetic article');
		updateHighlights([]);
	});

	afterEach(() => {
		document.body.classList.remove('obsidian-highlighter-active');
		updateHighlights([]);
		applyHighlights();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	test('uses the stable id and persists a multiline annotation in the existing URL record', async () => {
		updateHighlights([highlight('1700000000001'), highlight('1700000000002')]);
		const note = 'First line\nSecond line';

		expect(updateHighlightNotes('1700000000002', note)).toBe(true);
		expect(highlights[0].notes).toBeUndefined();
		expect(highlights[1].notes).toEqual([note]);
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[1].notes).toEqual([note]);
		});
		expect(stored.highlights?.[pageUrl]?.url).toBe(pageUrl);
	});

	test('replaces an existing annotation on each edit instead of duplicating its previous text', async () => {
		updateHighlights([highlight('1700000000001', ['Original note'])]);
		expect(updateHighlightNotes('1700000000001', 'Original note\nNew detail')).toBe(true);
		expect(updateHighlightNotes('1700000000001', 'Revised note')).toBe(true);
		expect(highlights[0].notes).toEqual(['Revised note']);
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[0].notes).toEqual(['Revised note']);
		});
	});

	test('clears whitespace-only input and persists the removal', async () => {
		updateHighlights([highlight('1700000000001', ['Old note'])]);
		expect(updateHighlightNotes('1700000000001', ' \n\t ')).toBe(true);
		expect(highlights[0].notes).toEqual([]);
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[0].notes).toEqual([]);
		});
	});

	test('stores one edited note on the canonical group member and exports it once', async () => {
		updateHighlights([
			highlight('1700000000001', ['First old note'], 'selection-group'),
			highlight('1700000000002', ['Second old note'], 'selection-group'),
			highlight('1700000000003', ['Unrelated note']),
		]);
		expect(updateHighlightNotes('1700000000002', 'Edited group\nannotation')).toBe(true);
		expect(highlights.map(item => item.notes)).toEqual([
			['Edited group\nannotation'], [], ['Unrelated note'],
		]);
		const exported = collapseGroupsForExport(highlights);
		expect(exported).toHaveLength(2);
		expect(exported[0].notes).toEqual(['Edited group\nannotation']);
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[1].notes).toEqual([]);
		});
	});

	test('does not accept an array index or mutate storage for a missing id', () => {
		updateHighlights([highlight('1700000000001', ['Existing note'])]);
		const previous = highlights;
		expect(updateHighlightNotes('0', 'Wrong target')).toBe(false);
		expect(highlights).toBe(previous);
		expect(highlights[0].notes).toEqual(['Existing note']);
		expect(browser.storage.local.set).not.toHaveBeenCalled();
	});

	test('undoes and redoes annotation edits through the existing history and storage', async () => {
		updateHighlights([highlight('1700000000001', ['Before edit'])]);
		updateHighlightNotes('1700000000001', 'After edit');
		undo();
		expect(highlights[0].notes).toEqual(['Before edit']);
		expect(canRedo()).toBe(true);
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[0].notes).toEqual(['Before edit']);
		});
		redo();
		expect(highlights[0].notes).toEqual(['After edit']);
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[0].notes).toEqual(['After edit']);
		});
	});

	test('reloads a saved annotation from the existing highlight storage', async () => {
		updateHighlights([highlight('1700000000001')]);
		updateHighlightNotes('1700000000001', 'Saved across reload');
		await vi.waitFor(() => {
			expect(stored.highlights?.[pageUrl]?.highlights[0].notes).toEqual(['Saved across reload']);
		});
		updateHighlights([]);
		await loadHighlights();
		expect(highlights[0].notes).toEqual(['Saved across reload']);
	});
});
