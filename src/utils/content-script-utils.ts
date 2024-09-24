import browser from './browser-polyfill';

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		browser.tabs.sendMessage(tabId, { action: "ping" }).then((response) => {
			resolve();
		}).catch(() => {
			// Content script is not loaded, inject it
			browser.scripting.executeScript({
				target: { tabId: tabId },
				files: ['content.js']
			}).then(() => {
				// Wait a bit to ensure the script is fully loaded
				setTimeout(() => {
					resolve();
				}, 100);
			}).catch((error) => {
				console.error(`Failed to inject content script into tab ${tabId}: ${error.message}`);
				reject(new Error(`Failed to inject content script: ${error.message}`));
			});
		});
	});
}
