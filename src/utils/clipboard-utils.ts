import browser from './browser-polyfill';

/**
 * Checks if the current context is inside an iframe
 */
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
	try {
		// First try the standard Clipboard API
		await navigator.clipboard.writeText(text);
		console.log('Successfully copied to clipboard using standard API');
		return true;
	} catch (clipboardError) {
		const inIframe = isInIframe();
		console.log(`Standard clipboard API failed${inIframe ? ' (running in iframe)' : ''}, trying content script fallback:`, clipboardError);
		
		try {
			// Try using the content script fallback (works in iframe contexts)
			const response = await browser.runtime.sendMessage({
				action: 'copy-to-clipboard',
				text: text
			}) as { success: boolean; error?: string } | undefined;
			
			if (response && response.success) {
				console.log('Successfully copied to clipboard using content script fallback');
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
}

/**
 * Attempts to copy text to clipboard with user feedback.
 * Shows success/error messages and provides visual feedback.
 * 
 * @param text - The text to copy to clipboard
 * @param successMessage - Message to show on success (optional)
 * @param errorMessage - Message to show on error (optional)
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function copyToClipboardWithFeedback(
	text: string, 
	successMessage?: string, 
	errorMessage?: string
): Promise<boolean> {
	const success = await copyToClipboard(text);
	
	if (success && successMessage) {
		console.log(successMessage);
	} else if (!success && errorMessage) {
		console.error(errorMessage);
	}
	
	return success;
}
