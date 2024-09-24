import browser from './browser-polyfill';

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
	console.log(`Ensuring content script is loaded for tab ${tabId}`);
	return new Promise<void>((resolve, reject) => {
		browser.tabs.sendMessage(tabId, { action: "ping" }).then((response) => {
			console.log(`Content script already loaded for tab ${tabId}`);
			resolve();
		}).catch(() => {
			// Content script is not loaded, inject it
			console.log(`Injecting content script into tab ${tabId}`);
			browser.scripting.executeScript({
				target: { tabId: tabId },
				files: ['content.js']
			}).then(() => {
				// Wait a bit to ensure the script is fully loaded
				setTimeout(() => {
					console.log(`Content script injected into tab ${tabId}`);
					resolve();
				}, 100);
			}).catch((error) => {
				console.error(`Failed to inject content script into tab ${tabId}: ${error.message}`);
				reject(new Error(`Failed to inject content script: ${error.message}`));
			});
		});
	});
}
