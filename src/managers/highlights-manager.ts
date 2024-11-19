import browser from '../utils/browser-polyfill';
import { detectBrowser } from '../utils/browser-detection';
import { AnyHighlightData, StoredData } from '../utils/highlighter';
import dayjs from 'dayjs';
import { showImportModal } from '../utils/import-modal';

interface ExportedHighlight {
	text: string;
	timestamp: string;
}

interface ExportedData {
	url: string;
	highlights: ExportedHighlight[];
}

interface HighlightsStorage {
	[url: string]: StoredData;
}

export async function exportHighlights(): Promise<void> {
	try {
		const result = await browser.storage.local.get('highlights');
		const allHighlights = result.highlights || {};

		const exportData = Object.entries(allHighlights).map(([url, data]) => ({
			url,
			highlights: (data.highlights as AnyHighlightData[]).map(highlight => ({
				text: highlight.content,
				timestamp: dayjs(parseInt(highlight.id)).toISOString()
			}))
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
		alert('Failed to export highlights. Please check the console for more details.');
	}
}

export function importHighlights(): void {
	showImportModal(
		'import-modal',
		importHighlightsFromJson,
		'.json',
		'Choose highlights file or drag and drop',
		'Paste highlights JSON here',
		false,
		'Import highlights'
	);
}

async function importHighlightsFromJson(jsonContent: string): Promise<void> {
	try {
		const importedData = JSON.parse(jsonContent) as ExportedData[];
		
		// Validate the imported data structure
		if (!Array.isArray(importedData) || !importedData.every(isValidHighlightData)) {
			throw new Error('Invalid highlights file format');
		}

		// Get current highlights
		const result = await browser.storage.local.get('highlights');
		// Initialize with an empty object that has the correct index signature
		const currentHighlights = (result.highlights || {}) as HighlightsStorage;

		// Merge imported highlights with existing ones
		importedData.forEach(({ url, highlights }) => {
			if (!currentHighlights[url]) {
				currentHighlights[url] = { highlights: [], url };
			}

			// Convert imported highlights to the correct format
			const formattedHighlights = highlights.map(h => ({
				id: new Date(h.timestamp).getTime().toString(),
				content: h.text,
				color: 'yellow', // Default color
				position: {}, // Position will be recalculated when page is visited
				type: 'text' as const,
				xpath: '', // Will be recalculated when page is visited
				startOffset: 0,
				endOffset: h.text.length
			}));

			// Merge while avoiding duplicates based on content
			const existingContents = new Set(currentHighlights[url].highlights.map((h: AnyHighlightData) => h.content));
			formattedHighlights.forEach(highlight => {
				if (!existingContents.has(highlight.content)) {
					currentHighlights[url].highlights.push(highlight);
					existingContents.add(highlight.content);
				}
			});
		});

		// Save merged highlights
		await browser.storage.local.set({ highlights: currentHighlights });
		alert('Highlights imported successfully');
	} catch (error) {
		console.error('Error importing highlights:', error);
		throw new Error('Error importing highlights. Please check the file and try again.');
	}
}

function isValidHighlightData(data: unknown): data is ExportedData {
	return (
		!!data &&
		typeof (data as ExportedData).url === 'string' &&
		Array.isArray((data as ExportedData).highlights) &&
		(data as ExportedData).highlights.every((h: unknown) => 
			!!h &&
			typeof (h as ExportedHighlight).text === 'string' &&
			typeof (h as ExportedHighlight).timestamp === 'string' &&
			!isNaN(Date.parse((h as ExportedHighlight).timestamp))
		)
	);
}
