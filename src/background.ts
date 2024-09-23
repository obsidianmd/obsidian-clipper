import browser from './utils/browser-polyfill';

let isSidePanelOpen = false;

browser.action.onClicked.addListener((tab) => {
	if (tab.id) {
		browser.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['content.js']
		});
	}
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "extractContent" && sender.tab && sender.tab.id) {
		if (!isSidePanelOpen) {
			sendResponse();
			return true;
		}

		browser.tabs.sendMessage(sender.tab.id, request)
			.then(response => {
				sendResponse();
			})
			.catch(error => {
				console.error("Error sending message:", error);
				sendResponse();
			});

		return true; // Indicates that we will send a response asynchronously
	}
});

browser.commands.onCommand.addListener((command) => {
	if (command === 'quick_clip') {
		browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
			if (tabs[0]?.id) {
				browser.action.openPopup();
				setTimeout(() => {
					browser.runtime.sendMessage({action: "triggerQuickClip"})
						.catch(error => console.error("Failed to send quick clip message:", error));
				}, 500);
			}
		});
	}
});

function createContextMenu() {
	browser.contextMenus.create({
		id: "open-obsidian-clipper",
		title: "Add to Obsidian",
		contexts: ["page", "selection"]
	});
	browser.contextMenus.create({
		id: 'openSidePanel',
		title: 'Open side panel',
		contexts: ["page", "selection"]
	});
}

browser.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "open-obsidian-clipper") {
		browser.action.openPopup();
	} else if (info.menuItemId === 'openSidePanel' && tab && tab.id) {
		chrome.sidePanel.open({ tabId: tab.id });
		isSidePanelOpen = true;
		ensureContentScriptLoaded(tab.id);
	}
});

browser.runtime.onInstalled.addListener(() => {
	createContextMenu();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const handleMessage = async () => {
		if (message.type === 'open_side_panel' && sender.tab && sender.tab.id) {
			await chrome.sidePanel.open({ tabId: sender.tab.id });
			await chrome.sidePanel.setOptions({
				tabId: sender.tab.id,
				path: 'sidebar.html',
				enabled: true
			});
			isSidePanelOpen = true;
			await ensureContentScriptLoaded(sender.tab.id);
		} else if (message.action === "ensureContentScriptLoaded" && message.tabId) {
			await ensureContentScriptLoaded(message.tabId);
		} else if (message.action === "sidePanelOpened") {
			isSidePanelOpen = true;
		} else if (message.action === "sidePanelClosed") {
			isSidePanelOpen = false;
		}
	};

	handleMessage().then(() => sendResponse({ success: true })).catch(error => {
		console.error('Error handling message:', error);
		sendResponse({ success: false, error: error.message });
	});

	return true;
});

function ensureContentScriptLoaded(tabId: number) {
	return new Promise<void>((resolve, reject) => {
		chrome.tabs.sendMessage(tabId, { action: "ping" }, response => {
			if (chrome.runtime.lastError) {
				// Content script is not loaded, inject it
				chrome.scripting.executeScript({
					target: { tabId: tabId },
					files: ['content.js']
				}, () => {
					if (chrome.runtime.lastError) {
						reject(chrome.runtime.lastError);
					} else {
						resolve();
					}
				});
			} else {
				resolve();
			}
		});
	});
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete' && isSidePanelOpen) {
		browser.runtime.sendMessage({ action: "tabUrlChanged", tabId: tabId })
			.catch(error => console.error("Error sending tabUrlChanged message:", error));
	}
});

// Remove the onVisibilityChanged listener
// chrome.sidePanel.onVisibilityChanged.addListener(({ visible }) => {
// 	isSidePanelOpen = visible;
// });