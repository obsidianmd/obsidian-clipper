import { Reader } from './utils/reader';
import browser from './utils/browser-polyfill';

// Initialize reader mode
(function() {
	// Check if the script has already been initialized
	if (window.hasOwnProperty('obsidianReaderInitialized')) {
		return;  // Exit if already initialized
	}

	// Mark as initialized
	(window as any).obsidianReaderInitialized = true;

	// Listen for messages from the content script
	browser.runtime.onMessage.addListener((request: any, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void) => {
		if (request.action === "toggleReaderMode") {
			(async () => {
				try {
					const isActive = await Reader.toggle(document);
					document.documentElement.classList.toggle('obsidian-reader-active', isActive);
					sendResponse({ success: true, isActive });
				} catch (error: unknown) {
					console.error('Error toggling reader mode:', error);
					sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
				}
			})();
			return true;
		}
	});
})(); 