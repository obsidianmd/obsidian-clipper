import browser from './browser-polyfill';

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		browser.tabs.get(tabId).then((tab) => {
			if (!tab.url || !isValidUrl(tab.url)) {
				reject(new Error('Invalid URL'));
				return;
			}

			browser.tabs.sendMessage(tabId, { action: "ping" }).then((response) => {
				resolve();
			}).catch(() => {
				// Content script is not loaded, inject it
				browser.scripting.executeScript({
					target: { tabId: tabId },
					files: ['content.js']
				}).then(() => {
					// Wait a bit to ensure the script is fully loaded
					setTimeout(resolve, 100);
				}).catch((error) => {
					reject(new Error(`Failed to inject content script: ${error.message}`));
				});
			});
		}).catch((error) => {
			reject(new Error(browser.runtime.lastError?.message || error.message));
		});
	});
}

function isValidUrl(url: string): boolean {
	return url.startsWith('http://') || url.startsWith('https://');
}