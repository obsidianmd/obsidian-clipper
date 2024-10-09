import browser from './browser-polyfill';
import { isValidUrl } from './active-tab-manager';

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
	try {
		// First, get the tab information
		const tab = await browser.tabs.get(tabId);

		// Check if the URL is valid before proceeding
		if (!tab.url || !isValidUrl(tab.url)) {
			console.log(`Skipping content script injection for invalid URL: ${tab.url}`);
			return;
		}

		// Attempt to send a message to the content script
		await browser.tabs.sendMessage(tabId, { action: "ping" });
	} catch (error) {
		// If the message fails, the content script is not loaded, so inject it
		console.log('Content script not loaded, injecting...');
		await browser.scripting.executeScript({
			target: { tabId: tabId },
			files: ['content.js']
		});
	}
}