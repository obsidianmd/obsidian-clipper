import browser from './utils/browser-polyfill';

async function injectContentScript(tabId: number) {
	try {
		await browser.scripting.executeScript({
			target: { tabId: tabId },
			files: ['content.js']
		});
	} catch (error) {
		console.error('Error injecting content script:', error);
	}
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "ensureContentScriptLoaded") {
		injectContentScript(request.tabId).then(() => {
			sendResponse();
		}).catch((error) => {
			console.error('Error in ensureContentScriptLoaded:', error);
			sendResponse();
		});
		return true;
	}

	if (request.action === "getPageContent") {
		browser.tabs.sendMessage(request.tabId, request).then(sendResponse);
		return true;
	}

	// ... other message listeners ...
});

browser.action.onClicked.addListener((tab) => {
	if (tab.id) {
		browser.tabs.sendMessage(tab.id, { action: "ping" });
	}
});

browser.commands.onCommand.addListener((command) => {
	if (command === 'quick_clip') {
		browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
			if (tabs[0]?.id) {
				browser.action.openPopup();
				setTimeout(() => {
					browser.runtime.sendMessage({action: "triggerQuickClip"}).then((response) => {
						if (browser.runtime.lastError) {
							console.error("Failed to send quick clip message:", browser.runtime.lastError);
						} else {
							console.log("Quick clip triggered successfully");
						}
					});
				}, 500);
			}
		});
	}
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "getPageContent") {
		browser.tabs.sendMessage(request.tabId, request).then(sendResponse);
		return true;
	}
});

browser.runtime.onInstalled.addListener(() => {
	browser.action.onClicked.addListener((tab) => {
		if (tab.id) {
			browser.tabs.sendMessage(tab.id, { action: "ping" });
		}
	});
});