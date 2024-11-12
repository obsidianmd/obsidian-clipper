import browser from './browser-polyfill';
import { detectBrowser } from './browser-detection';

export interface SaveFileOptions {
	content: string;
	fileName: string;
	mimeType?: string;
	tabId?: number;
	onError?: (error: Error) => void;
}

export function base64EncodeUnicode(str: string): string {
	const utf8Bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, 
		(match, p1) => String.fromCharCode(parseInt(p1, 16))
	);
	return btoa(utf8Bytes);
}

export async function saveFile({
	content,
	fileName,
	mimeType = 'text/markdown',
	tabId,
	onError
}: SaveFileOptions): Promise<void> {
	try {
		const browserType = await detectBrowser();
		const isSafariBrowser = ['safari', 'mobile-safari', 'ipad-os'].includes(browserType);
		
		if (!tabId) {
			throw new Error('Tab ID is required for saving files');
		}

		if (isSafariBrowser) {
			// Use data URI approach for Safari
			const dataUri = `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
			await browser.scripting.executeScript({
				target: { tabId },
				func: (fileName: string, dataUri: string) => {
					const a = document.createElement('a');
					a.href = dataUri;
					a.download = fileName;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
				},
				args: [fileName, dataUri]
			});
		} else {
			// Use base64 approach for other browsers
			await browser.scripting.executeScript({
				target: { tabId },
				func: (fileName: string, content: string, mimeType: string) => {
					const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = fileName;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				},
				args: [fileName, content, mimeType]
			});
		}
	} catch (error) {
		console.error('Failed to save file:', error);
		if (onError) {
			onError(error as Error);
		}
	}
} 