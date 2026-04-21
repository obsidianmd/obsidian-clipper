import browser from './browser-polyfill';

function isInIframe(): boolean {
	try {
		return window.self !== window.top;
	} catch (e) {
		// If we can't access window.top due to cross-origin restrictions, we're likely in an iframe
		return true;
	}
}

/**
 * Attempts to copy text to clipboard using multiple fallback methods.
 * This is particularly useful in iframe contexts where the standard Clipboard API may be blocked.
 *
 * @param text - The text to copy to clipboard
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	// Skip the standard Clipboard API in iframes — the browser logs a
	// permissions-policy violation to the console just by calling it,
	// even before the promise rejects.
	if (!isInIframe()) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Fall through to content script fallback
		}
	}

	try {
		const response = await browser.runtime.sendMessage({
			action: 'copy-to-clipboard',
			text: text
		}) as { success: boolean; error?: string } | undefined;

		if (response && response.success) {
			return true;
		} else {
			console.error('Content script clipboard fallback failed:', response?.error);
			return false;
		}
	} catch (contentScriptError) {
		console.error('All clipboard methods failed:', contentScriptError);
		return false;
	}
}