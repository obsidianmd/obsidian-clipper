import browser from '../utils/browser-polyfill';
import { detectBrowser } from '../utils/browser-detection';
import { AnyHighlightData, StoredData, TextHighlightData, TextQuoteAnchor, buildExportedPage, collapseGroupsForExport, normalizeUrl } from '../utils/highlighter';
import { showImportModal } from '../utils/import-modal';
import dayjs from 'dayjs';
import { getMessage } from '../utils/i18n';

type HighlightsStorage = Record<string, StoredData>;

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
		const { id, type, xpath, content, notes, groupId } = record as Record<string, unknown>;
		if (typeof id !== 'string' || !id) throw new Error(`${where} is missing an id`);
		if (type !== 'text' && type !== 'element') throw new Error(`${where} has an unknown type`);
		if (typeof xpath !== 'string') throw new Error(`${where} is missing an xpath`);
		if (typeof content !== 'string' || !content) throw new Error(`${where} is missing content`);
		if (notes !== undefined && (!Array.isArray(notes) || notes.some(note => typeof note !== 'string'))) {
			throw new Error(`${where} has invalid notes`);
		}
		if (groupId !== undefined && typeof groupId !== 'string') {
			throw new Error(`${where} has an invalid groupId`);
		}

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
				const { text, timestamp, notes } = highlight as Partial<ImportedHighlight>;
				if (typeof text !== 'string' || !text) {
					throw new Error(`Highlight ${index} of entry ${pageIndex} is missing text`);
				}
				if (timestamp !== undefined && typeof timestamp !== 'string') {
					throw new Error(`Highlight ${index} of entry ${pageIndex} has an invalid timestamp`);
				}
				if (notes !== undefined && (!Array.isArray(notes) || notes.some(note => typeof note !== 'string'))) {
					throw new Error(`Highlight ${index} of entry ${pageIndex} has invalid notes`);
				}
				return { text, timestamp, notes };
			}),
		};
	});
}

// Highlight ids double as their creation time, so a timestamp maps back to one.
// A hand written file may omit it, in which case the highlight counts as new.
function timestampToMs(timestamp: string | undefined): number {
	const parsed = timestamp ? dayjs(timestamp) : null;
	return parsed && parsed.isValid() ? parsed.valueOf() : Date.now();
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

// Merge imported highlights into what's already stored, never removing any.
export async function importHighlightsFromJson(json: string): Promise<void> {
	const pages = parseImportedHighlights(json);

	const result = await browser.storage.local.get('highlights') as { highlights?: HighlightsStorage };
	const allHighlights: HighlightsStorage = result.highlights || {};
	let importedCount = 0;

	for (const page of pages) {
		const url = normalizeUrl(page.url);
		const existing = allHighlights[url];
		// Highlights saved before URLs were normalized sit under the raw key until
		// their page is next opened, and exports write that key verbatim. Fold such
		// an entry in, or re-importing would miss it and split the page across two
		// keys. The same highlight can appear under both, so match on content and
		// keep whichever copy still has an xpath.
		const legacy = page.url !== url ? allHighlights[page.url] : undefined;
		const merged: AnyHighlightData[] = [...(existing?.highlights ?? [])];

		const positionByContent = new Map<string, number>();
		merged.forEach((highlight, index) => {
			if (!positionByContent.has(highlight.content)) positionByContent.set(highlight.content, index);
		});
		for (const highlight of legacy?.highlights ?? []) {
			const at = positionByContent.get(highlight.content);
			if (at === undefined) {
				positionByContent.set(highlight.content, merged.length);
				merged.push(highlight);
			} else if (!merged[at].xpath && highlight.xpath) {
				merged[at] = highlight;
			}
		}

		// Dedupe on content so re-importing the same file is a no-op. This also
		// collapses two highlights of identical text on one page.
		const seenContent = new Set(merged.map(highlight => highlight.content));
		const usedIds = new Set(merged.map(highlight => highlight.id));
		// Content can itself contain a blank line, which the text fallback below
		// would mistake for a group separator. Comparing against what these
		// highlights would export as catches that.
		const seenEntries = new Set(collapseGroupsForExport(merged).map(entry => entry.text));

		const writePage = () => {
			if (merged.length === 0) return;
			// A title already on record wins. The imported one only fills an empty title.
			allHighlights[url] = { highlights: merged, url, title: existing?.title ?? legacy?.title ?? page.title };
			if (legacy) delete allHighlights[page.url];
		};

		// Full records restore the page exactly. Files written before the format
		// carried `data` fall through to re-anchoring by text below.
		if (page.data) {
			for (const record of page.data) {
				if (seenContent.has(record.content)) continue;
				seenContent.add(record.content);
				merged.push({ ...record, id: reserveId(Number(record.id) || Date.now(), usedIds) });
				importedCount++;
			}

			writePage();
			continue;
		}

		for (const entry of page.highlights) {
			if (seenEntries.has(entry.text)) continue;

			// A group exports as one entry with its members joined by a blank line.
			// Split them apart so each re-anchors on its own, still grouped. One
			// timestamp covers the group, so later members offset from it to keep
			// their order.
			const parts = entry.text.split('\n\n').filter(part => part.length > 0);
			const baseMs = timestampToMs(entry.timestamp);
			const ids = parts.map((_, index) => reserveId(baseMs + index, usedIds));
			const groupId = parts.length > 1 ? `import-${ids[0]}` : undefined;

			parts.forEach((part, index) => {
				if (seenContent.has(part)) return;
				seenContent.add(part);

				const highlight: TextHighlightData = {
					id: ids[index],
					type: 'text',
					xpath: '',
					startOffset: 0,
					endOffset: 0,
					content: part,
					...(groupId ? { groupId } : {}),
					// Notes merge across a group on export, so they go back on the first.
					...(index === 0 && entry.notes?.length ? { notes: entry.notes } : {}),
				};

				merged.push(highlight);
				importedCount++;
			});
		}

		writePage();
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
