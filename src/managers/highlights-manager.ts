import browser from '../utils/browser-polyfill';
import { detectBrowser } from '../utils/browser-detection';
import { AnyHighlightData } from '../utils/highlighter';
import dayjs from 'dayjs';
import { getMessage } from '../utils/i18n';

export async function exportHighlights(): Promise<void> {
	try {
		const result = await browser.storage.local.get('highlights');
		const allHighlights = result.highlights || {};

		const exportData = Object.entries(allHighlights).map(([url, data]) => ({
			url,
			// Mirror template metadata shape so manual export matches clipping output.
			highlights: (data.highlights as AnyHighlightData[]).map(highlight => ({
				text: highlight.content,
				// Timestamp comes from explicit persisted metadata (createdAt).
				timestamp: (typeof highlight.createdAt === 'number' && Number.isFinite(highlight.createdAt) && highlight.createdAt > 0)
					? dayjs(highlight.createdAt).toISOString()
					: undefined,
				color: highlight.color,
				notes: highlight.notes,
				comment: highlight.notes && highlight.notes.length > 0 ? highlight.notes[0] : undefined
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
		alert(getMessage('failedToExportHighlights'));
	}
}
