import browser from '../utils/browser-polyfill';
import { detectBrowser } from '../utils/browser-detection';
import { AnyHighlightData, HighlightsStorage, TextQuoteAnchor, buildExportedPage, collapseGroupsForExport, expandExportedEntries, normalizeUrl, reconcileLegacyUrlKey } from '../utils/highlighter';
import { showImportModal } from '../utils/import-modal';
import dayjs from 'dayjs';
import { getMessage } from '../utils/i18n';

export async function exportHighlights(): Promise<void> {
	try {
		const result = await browser.storage.local.get('highlights') as { highlights?: HighlightsStorage };
		const allHighlights: HighlightsStorage = result.highlights || {};

		const exportData = Object.entries(allHighlights).map(([url, data]) =>
			buildExportedPage(url, data.highlights, data.title));

		const jsonContent = JSON.stringify(exportData, null, 2);
		const blob = new Blob([jsonContent], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const browserType = await detectBrowser();
		const timestamp = dayjs().format('YYYYMMDDHHmm');
		const fileName = `obsidian-web-clipper-highlights-${timestamp}.json`;

		if (browserType === 'safari' || browserType === 'mobile-safari') {
			if (navigator.share) {
				try {
					await navigator.share({
						files: [new File([blob], fileName, { type: 'application/json' })],
						title: 'Exported Obsidian Web Clipper Highlights',
						text: 'Here are your exported highlights from Obsidian Web Clipper.'
					});
				} catch (error) {
					console.error('Error sharing:', error);
					window.open(url);
				}
			} else {
				window.open(url);
			}
		} else {
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}

		URL.revokeObjectURL(url);
	} catch (error) {
		console.error('Error exporting highlights:', error);
		alert(getMessage('failedToExportHighlights'));
	}
}

interface ImportedHighlight {
	text: string;
	timestamp?: string;
	notes?: string[];
}

interface ImportedPage {
	url: string;
	title?: string;
	highlights: ImportedHighlight[];
	data?: AnyHighlightData[];
}

function parseNotes(value: unknown, where: string): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some(note => typeof note !== 'string')) {
		throw new Error(`${where} has invalid notes`);
	}
	return value as string[];
}

// Validated field by field rather than trusted, since this lands in storage and
// is later fed straight to the renderer.
function parseHighlightRecords(value: unknown, pageIndex: number): AnyHighlightData[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) {
		throw new Error(`Entry ${pageIndex} has an invalid data array`);
	}

	return value.map((record: unknown, index: number): AnyHighlightData => {
		const where = `Record ${index} of entry ${pageIndex}`;
		if (!record || typeof record !== 'object') {
			throw new Error(`${where} is not an object`);
		}
		const { id, type, xpath, content, groupId } = record as Record<string, unknown>;
		if (typeof id !== 'string' || !id) throw new Error(`${where} is missing an id`);
		if (type !== 'text' && type !== 'element') throw new Error(`${where} has an unknown type`);
		if (typeof xpath !== 'string') throw new Error(`${where} is missing an xpath`);
		if (typeof content !== 'string' || !content) throw new Error(`${where} is missing content`);
		if (groupId !== undefined && typeof groupId !== 'string') {
			throw new Error(`${where} has an invalid groupId`);
		}
		const notes = parseNotes((record as Record<string, unknown>).notes, where);

		const base = { id, xpath, content, ...(notes ? { notes } : {}), ...(groupId ? { groupId } : {}) };
		if (type === 'element') return { ...base, type };

		const { startOffset, endOffset, textQuote } = record as Record<string, unknown>;
		if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
			throw new Error(`${where} is missing text offsets`);
		}
		return {
			...base,
			type,
			startOffset,
			endOffset,
			...(isTextQuoteAnchor(textQuote) ? { textQuote } : {}),
		};
	});
}

function isTextQuoteAnchor(value: unknown): value is TextQuoteAnchor {
	if (!value || typeof value !== 'object') return false;
	const { prefix, suffix } = value as Record<string, unknown>;
	return typeof prefix === 'string' && typeof suffix === 'string';
}

// Validate up front and throw on the first problem, so a malformed file is
// rejected before anything is written to storage rather than applied halfway.
function parseImportedHighlights(json: string): ImportedPage[] {
	const parsed = JSON.parse(json);
	if (!Array.isArray(parsed)) {
		throw new Error('Expected the file to contain an array of pages');
	}

	return parsed.map((page: unknown, pageIndex: number): ImportedPage => {
		if (!page || typeof page !== 'object') {
			throw new Error(`Entry ${pageIndex} is not an object`);
		}
		const { url, title, highlights, data } = page as Partial<ImportedPage>;
		if (typeof url !== 'string' || !url.trim()) {
			throw new Error(`Entry ${pageIndex} is missing a url`);
		}
		if (title !== undefined && typeof title !== 'string') {
			throw new Error(`Entry ${pageIndex} has an invalid title`);
		}
		if (!Array.isArray(highlights)) {
			throw new Error(`Entry ${pageIndex} is missing a highlights array`);
		}

		return {
			url,
			title,
			data: parseHighlightRecords(data, pageIndex),
			highlights: highlights.map((highlight: unknown, index: number): ImportedHighlight => {
				if (!highlight || typeof highlight !== 'object') {
					throw new Error(`Highlight ${index} of entry ${pageIndex} is not an object`);
				}
				const where = `Highlight ${index} of entry ${pageIndex}`;
				const { text, timestamp, notes } = highlight as Partial<ImportedHighlight>;
				if (typeof text !== 'string' || !text) throw new Error(`${where} is missing text`);
				if (timestamp !== undefined && typeof timestamp !== 'string') {
					throw new Error(`${where} has an invalid timestamp`);
				}
				return { text, timestamp, notes: parseNotes(notes, where) };
			}),
		};
	});
}

// Ids must be unique within a page, so a taken one is bumped by a millisecond.
function reserveId(ms: number, usedIds: Set<string>): string {
	let candidate = ms;
	while (usedIds.has(String(candidate))) {
		candidate++;
	}
	const id = String(candidate);
	usedIds.add(id);
	return id;
}

// Merge one page of an import into the store, returning how many were added.
function mergePage(page: ImportedPage, allHighlights: HighlightsStorage): number {
	// Exports write the raw key verbatim, so an un-normalized entry has to be
	// folded in first or this would miss it and split the page across two keys.
	reconcileLegacyUrlKey(allHighlights, page.url);

	const url = normalizeUrl(page.url);
	const existing = allHighlights[url];
	const merged: AnyHighlightData[] = [...(existing?.highlights ?? [])];

	// Dedupe on content so re-importing the same file is a no-op. This also
	// collapses two highlights of identical text on one page.
	const seenContent = new Set(merged.map(highlight => highlight.content));
	const usedIds = new Set(merged.map(highlight => highlight.id));

	// Full records restore the page exactly. Older files carry only the readable
	// view, which has to be expanded back into records first.
	let records = page.data;
	if (!records) {
		// Content can itself contain a blank line, which the expansion would
		// mistake for a group separator. Comparing against what these highlights
		// would export as catches that.
		const seenEntries = new Set(collapseGroupsForExport(merged).map(entry => entry.text));
		records = expandExportedEntries(page.highlights.filter(entry => !seenEntries.has(entry.text)));
	}

	let added = 0;
	for (const record of records) {
		if (seenContent.has(record.content)) continue;
		seenContent.add(record.content);
		merged.push({ ...record, id: reserveId(Number(record.id) || Date.now(), usedIds) });
		added++;
	}

	if (merged.length > 0) {
		// A title already on record wins. The imported one only fills an empty title.
		allHighlights[url] = { highlights: merged, url, title: existing?.title ?? page.title };
	}
	return added;
}

// Merge imported highlights into what's already stored, never removing any.
export async function importHighlightsFromJson(json: string): Promise<void> {
	const pages = parseImportedHighlights(json);

	const result = await browser.storage.local.get('highlights') as { highlights?: HighlightsStorage };
	const allHighlights: HighlightsStorage = result.highlights || {};

	let importedCount = 0;
	for (const page of pages) {
		importedCount += mergePage(page, allHighlights);
	}

	await browser.storage.local.set({ highlights: allHighlights });
	alert(getMessage('highlightsImportSuccess', String(importedCount)));
}

export function importHighlights(): void {
	showImportModal(
		'import-modal',
		importHighlightsFromJson,
		'.json',
		false,
		'importHighlights'
	);
}
