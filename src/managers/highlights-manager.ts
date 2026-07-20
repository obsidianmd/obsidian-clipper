import browser from '../utils/browser-polyfill';
import { detectBrowser } from '../utils/browser-detection';
import { AnyHighlightData, StoredData, TextHighlightData, collapseGroupsForExport, normalizeUrl } from '../utils/highlighter';
import { showImportModal } from '../utils/import-modal';
import dayjs from 'dayjs';
import { getMessage } from '../utils/i18n';

type HighlightsStorage = Record<string, StoredData>;

export async function exportHighlights(): Promise<void> {
	try {
		const result = await browser.storage.local.get('highlights');
		const allHighlights = result.highlights || {};

		const exportData = Object.entries(allHighlights).map(([url, data]) => ({
			url,
			highlights: collapseGroupsForExport(data.highlights as AnyHighlightData[]),
		}));

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
	highlights: ImportedHighlight[];
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
		const { url, highlights } = page as Partial<ImportedPage>;
		if (typeof url !== 'string' || !url.trim()) {
			throw new Error(`Entry ${pageIndex} is missing a url`);
		}
		if (!Array.isArray(highlights)) {
			throw new Error(`Entry ${pageIndex} is missing a highlights array`);
		}

		return {
			url,
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

// Highlight ids double as their creation time, so the exported timestamp maps
// straight back to one. A file written by hand may omit it, in which case the
// highlight is treated as new.
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

// Merge imported highlights into what's already stored — an import never
// removes existing highlights.
//
// The export format is lossy: it keeps text, timestamp and notes but drops the
// xpath and character offsets that anchor a highlight to the DOM. That is
// recoverable, because renderTextHighlight re-anchors by text whenever the
// xpath fails to resolve, so imported highlights are stored with an empty xpath
// and find their place the next time the page is opened.
export async function importHighlightsFromJson(json: string): Promise<void> {
	const pages = parseImportedHighlights(json);

	const result = await browser.storage.local.get('highlights') as { highlights?: HighlightsStorage };
	const allHighlights: HighlightsStorage = result.highlights || {};
	let importedCount = 0;

	for (const page of pages) {
		const url = normalizeUrl(page.url);
		const existing = allHighlights[url];
		// Highlights saved before URLs were normalized still sit under the raw URL
		// until their page is next opened, and the export writes that raw key
		// verbatim. Fold such an entry in here, or re-importing an export of those
		// highlights would miss them all and duplicate the page under two keys.
		const legacy = page.url !== url ? allHighlights[page.url] : undefined;
		const merged: AnyHighlightData[] = [...(existing?.highlights ?? [])];

		// Fold the pre-normalization entry in. A highlight can legitimately appear
		// under both keys, so match on content rather than stacking them up, and
		// keep whichever copy still has a real xpath — an imported copy has none
		// and would have to re-anchor by text.
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
		// collapses two highlights of identical text on the same page, which is
		// the better trade for keeping repeat imports from stacking up.
		const seenContent = new Set(merged.map(highlight => highlight.content));
		const usedIds = new Set(merged.map(highlight => highlight.id));
		// A highlight's own content can contain a blank line, which would survive
		// the export and be mistaken for a group separator below. Comparing against
		// what these highlights would themselves export as catches that case, and
		// makes "re-importing an unmodified export changes nothing" true by
		// construction rather than by coincidence.
		const seenEntries = new Set(collapseGroupsForExport(merged).map(entry => entry.text));

		for (const entry of page.highlights) {
			if (seenEntries.has(entry.text)) continue;

			// A group of highlights is exported as a single entry with its members
			// joined by a blank line. Split them back apart so each part re-anchors
			// independently, and keep them grouped via a shared groupId.
			const parts = entry.text.split('\n\n').filter(part => part.length > 0);
			// The export records one timestamp per group, so later members are
			// offset from it to keep the group in its original order.
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
					// Notes are merged across a group on export, so they go back on
					// the first member.
					...(index === 0 && entry.notes?.length ? { notes: entry.notes } : {}),
				};

				merged.push(highlight);
				importedCount++;
			});
		}

		if (merged.length > 0) {
			allHighlights[url] = { highlights: merged, url, title: existing?.title ?? legacy?.title };
			// Having folded the pre-normalization entry in, retire its key the same
			// way loadHighlights would have.
			if (legacy) delete allHighlights[page.url];
		}
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
