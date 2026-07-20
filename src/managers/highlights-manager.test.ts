// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import browser from '../utils/browser-polyfill';
import { AnyHighlightData, StoredData, collapseGroupsForExport } from '../utils/highlighter';
import { importHighlightsFromJson } from './highlights-manager';

// Mirrors what exportHighlights writes, so a round-trip can be asserted.
function exportedFile(): string {
	return JSON.stringify(
		Object.entries(stored).map(([url, data]) => ({
			url,
			highlights: collapseGroupsForExport(data.highlights),
		})),
	);
}

function textHighlight(id: string, content: string, groupId?: string): AnyHighlightData {
	return { id, type: 'text', xpath: `/p[${id}]`, startOffset: 0, endOffset: content.length, content, ...(groupId ? { groupId } : {}) };
}

let stored: Record<string, StoredData>;

function highlightsFor(url: string): AnyHighlightData[] {
	return stored[url]?.highlights ?? [];
}

beforeEach(() => {
	stored = {};
	vi.stubGlobal('alert', () => {});
	browser.storage.local.get = (async () => ({ highlights: stored })) as typeof browser.storage.local.get;
	browser.storage.local.set = (async (items: { highlights: Record<string, StoredData> }) => {
		stored = items.highlights;
	}) as unknown as typeof browser.storage.local.set;
});

const file = (highlights: unknown[], url = 'https://example.com/page') =>
	JSON.stringify([{ url, highlights }]);

describe('importHighlightsFromJson', () => {
	test('imports highlights onto a page that has none', async () => {
		await importHighlightsFromJson(file([
			{ text: 'a highlighted sentence', timestamp: '2026-01-01T00:00:00.000Z' },
		]));

		const highlights = highlightsFor('https://example.com/page');
		expect(highlights).toHaveLength(1);
		expect(highlights[0].content).toBe('a highlighted sentence');
		// Anchoring is re-derived from the text on render, so the xpath is empty.
		expect(highlights[0].xpath).toBe('');
		expect(highlights[0].type).toBe('text');
	});

	test('keeps existing highlights instead of replacing them', async () => {
		stored['https://example.com/page'] = {
			url: 'https://example.com/page',
			title: 'Existing title',
			highlights: [{ id: '100', type: 'text', xpath: '/p[1]', startOffset: 0, endOffset: 5, content: 'kept' }],
		};

		await importHighlightsFromJson(file([{ text: 'added', timestamp: '2026-01-01T00:00:00.000Z' }]));

		expect(highlightsFor('https://example.com/page').map(h => h.content)).toEqual(['kept', 'added']);
		// An untouched page keeps its title — the export format doesn't carry one.
		expect(stored['https://example.com/page'].title).toBe('Existing title');
	});

	test('importing the same file twice adds nothing the second time', async () => {
		const json = file([
			{ text: 'first', timestamp: '2026-01-01T00:00:00.000Z' },
			{ text: 'second', timestamp: '2026-01-02T00:00:00.000Z' },
		]);

		await importHighlightsFromJson(json);
		await importHighlightsFromJson(json);

		expect(highlightsFor('https://example.com/page')).toHaveLength(2);
	});

	test('splits a grouped entry back into its members', async () => {
		await importHighlightsFromJson(file([
			{ text: 'part one\n\npart two', timestamp: '2026-01-01T00:00:00.000Z', notes: ['a note'] },
		]));

		const highlights = highlightsFor('https://example.com/page');
		expect(highlights.map(h => h.content)).toEqual(['part one', 'part two']);
		// Both members stay grouped, and the merged notes go back on the first.
		expect(highlights[0].groupId).toBeDefined();
		expect(highlights[1].groupId).toBe(highlights[0].groupId);
		expect(highlights[0].notes).toEqual(['a note']);
		expect(highlights[1].notes).toBeUndefined();
	});

	test('normalizes the url so tracking params do not create a second entry', async () => {
		await importHighlightsFromJson(file([{ text: 'one' }], 'https://example.com/page?utm_source=news'));

		expect(Object.keys(stored)).toEqual(['https://example.com/page']);
	});

	test('derives the highlight id from the exported timestamp', async () => {
		const timestamp = '2026-01-01T00:00:00.000Z';
		await importHighlightsFromJson(file([{ text: 'one', timestamp }]));

		expect(highlightsFor('https://example.com/page')[0].id).toBe(String(Date.parse(timestamp)));
	});

	test('re-importing an unmodified export is a no-op', async () => {
		stored['https://example.com/page'] = {
			url: 'https://example.com/page',
			highlights: [
				textHighlight('100', 'a plain highlight'),
				// A single highlight whose own content contains a blank line — this
				// must not be mistaken for a group separator and re-split on import.
				textHighlight('200', 'first line\n\nsecond line'),
				// A real group, which the export collapses into one entry.
				textHighlight('300', 'group part one', 'g1'),
				textHighlight('400', 'group part two', 'g1'),
			],
		};

		await importHighlightsFromJson(exportedFile());

		expect(highlightsFor('https://example.com/page').map(h => h.content)).toEqual([
			'a plain highlight',
			'first line\n\nsecond line',
			'group part one',
			'group part two',
		]);
	});

	test('folds in highlights still stored under a pre-normalization url', async () => {
		// loadHighlights only migrates a raw key to its normalized form when the
		// page is opened, so an export can still contain the raw key.
		stored['https://example.com/page?utm_source=news'] = {
			url: 'https://example.com/page?utm_source=news',
			title: 'Legacy title',
			highlights: [textHighlight('100', 'saved before normalization')],
		};

		await importHighlightsFromJson(exportedFile());

		// Not duplicated, and not left behind under two keys.
		expect(Object.keys(stored)).toEqual(['https://example.com/page']);
		expect(highlightsFor('https://example.com/page').map(h => h.content)).toEqual([
			'saved before normalization',
		]);
		expect(stored['https://example.com/page'].title).toBe('Legacy title');
	});

	test('reconciles a page split across the raw and normalized url', async () => {
		const rawUrl = 'https://example.com/page?utm_source=news';
		// The state left by an earlier import that wrote to the normalized key
		// without noticing the originals under the raw one.
		stored['https://example.com/page'] = {
			url: 'https://example.com/page',
			highlights: [{ id: '500', type: 'text', xpath: '', startOffset: 0, endOffset: 0, content: 'the same text' }],
		};
		stored[rawUrl] = {
			url: rawUrl,
			highlights: [textHighlight('100', 'the same text')],
		};

		await importHighlightsFromJson(exportedFile());

		const highlights = highlightsFor('https://example.com/page');
		expect(Object.keys(stored)).toEqual(['https://example.com/page']);
		expect(highlights.map(h => h.content)).toEqual(['the same text']);
		// The copy that kept its DOM anchor wins.
		expect(highlights[0].xpath).toBe('/p[100]');
	});

	test('rejects a malformed file without writing anything', async () => {
		stored['https://example.com/page'] = {
			url: 'https://example.com/page',
			highlights: [{ id: '100', type: 'text', xpath: '/p[1]', startOffset: 0, endOffset: 5, content: 'kept' }],
		};

		await expect(importHighlightsFromJson('{"not":"an array"}')).rejects.toThrow();
		await expect(importHighlightsFromJson(file([{ timestamp: '2026-01-01T00:00:00.000Z' }]))).rejects.toThrow();
		await expect(importHighlightsFromJson('not json at all')).rejects.toThrow();

		expect(highlightsFor('https://example.com/page').map(h => h.content)).toEqual(['kept']);
	});
});
