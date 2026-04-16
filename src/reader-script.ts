import { Reader } from './utils/reader';
import { setRenderContext } from './utils/highlighter';
import browser from './utils/browser-polyfill';

// Identify this bundle's highlighter module instance as the reader-script
// context, so its storage-change listener owns live rendering while reader
// mode is active (content.js's instance stays 'content' by default).
setRenderContext('reader-script');

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
			// When deactivating, respond before restore triggers a page reload
			if (document.documentElement.classList.contains('obsidian-reader-active')) {
				sendResponse({ success: true, isActive: false });
				Reader.toggle(document);
				return;
			}
			(async () => {
				try {
					const isActive = await Reader.toggle(document);
					document.documentElement.classList.toggle('obsidian-reader-active', isActive);
					browser.runtime.sendMessage({ action: "readerModeChanged", isActive });
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