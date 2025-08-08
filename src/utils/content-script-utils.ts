import browser from './browser-polyfill';
import { isValidUrl } from './active-tab-manager';

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
	try {
		// Use the background script to handle content script loading
		const response = await browser.runtime.sendMessage({ 
			action: "ensureContentScriptLoaded", 
			tabId: tabId 
		}) as { success: boolean; error?: string };
		
		if (!response.success) {
			throw new Error(response.error || 'Failed to ensure content script is loaded');
		}
	} catch (error) {
		console.error('Failed to ensure content script is loaded:', error);
		throw error;
	}
}