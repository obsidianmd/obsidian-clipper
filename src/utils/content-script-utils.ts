import browser from './browser-polyfill';

export async function ensureContentScriptLoaded(tabId: number): Promise<void> {
	try {
		// First, check if the content script is already loaded
		await browser.tabs.sendMessage(tabId, { action: "ping" });
		// If we get here, the content script is already loaded
		return;
	} catch (error) {
		// If we get here, the content script is not loaded, so we need to inject it
		try {
			await browser.scripting.executeScript({
				target: { tabId: tabId },
				files: ['content.js']
			});
			
			// Wait for the content script to initialize
			await new Promise<void>((resolve, reject) => {
				const listener = (
					message: unknown,
					sender: browser.Runtime.MessageSender,
					sendResponse: (response?: any) => void
				): true | undefined => {
					if (
						typeof message === 'object' &&
						message !== null &&
						'action' in message &&
						message.action === "contentScriptLoaded" &&
						sender.tab?.id === tabId
					) {
						browser.runtime.onMessage.removeListener(listener);
						resolve();
						return true;
					}
					return undefined;
				};
				browser.runtime.onMessage.addListener(listener);

				// Set a timeout in case the content script doesn't load
				setTimeout(() => {
					browser.runtime.onMessage.removeListener(listener);
					reject(new Error("Content script load timeout"));
				}, 5000);
			});
		} catch (injectionError) {
			console.error(`Failed to inject content script into tab ${tabId}: ${injectionError instanceof Error ? injectionError.message : 'Unknown error'}`);
			throw new Error(`Failed to inject content script: ${injectionError instanceof Error ? injectionError.message : 'Unknown error'}`);
		}
	}
}