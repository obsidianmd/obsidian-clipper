import browser from './utils/browser-polyfill';
import { ensureContentScriptLoaded } from './utils/content-script-utils';
import { detectBrowser } from './utils/browser-detection';
import { updateCurrentActiveTab } from './utils/active-tab-manager';

let sidePanelOpenWindows: Set<number> = new Set();

browser.action.onClicked.addListener((tab) => {
	if (tab.id) {
		browser.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['content.js']
		});
	}
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	console.log('Received message:', request);
	if (request.action === "extractContent" && sender.tab && sender.tab.id) {
		// if (!sender.tab.windowId || !sidePanelOpenWindows.has(sender.tab.windowId)) {
		// 	sendResponse();
			// return true;
		// }

		browser.tabs.sendMessage(sender.tab.id, request)
			.then(() => {
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

async function createContextMenu() {
	browser.contextMenus.create({
		id: "open-obsidian-clipper",
		title: "Clip this page",
		contexts: ["page", "selection"]
	});

	const browserType = await detectBrowser();
	if (browserType === 'chrome') {
		browser.contextMenus.create({
			id: 'open-side-panel',
			title: 'Open side panel',
			contexts: ["page", "selection"]
		});
	}
}

browser.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "open-obsidian-clipper") {
		browser.action.openPopup();
	} else if (info.menuItemId === 'open-side-panel' && tab && tab.id && tab.windowId) {
		chrome.sidePanel.open({ tabId: tab.id });
		sidePanelOpenWindows.add(tab.windowId);
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
				path: 'side-panel.html',
				enabled: true
			});
			if (sender.tab.windowId) {
				sidePanelOpenWindows.add(sender.tab.windowId);
			}
			await ensureContentScriptLoaded(sender.tab.id);
			updateCurrentActiveTab(sender.tab.windowId);
		} else if (message.action === "ensureContentScriptLoaded" && message.tabId) {
			await ensureContentScriptLoaded(message.tabId);
		} else if (message.action === "sidePanelOpened") {
			if (sender.tab && sender.tab.windowId) {
				sidePanelOpenWindows.add(sender.tab.windowId);
				updateCurrentActiveTab(sender.tab.windowId);
			}
		} else if (message.action === "sidePanelClosed") {
			if (sender.tab && sender.tab.windowId) {
				sidePanelOpenWindows.delete(sender.tab.windowId);
			}
		}
	};

	handleMessage().then(() => sendResponse({ success: true })).catch(error => {
		console.error('Error handling message:', error);
		sendResponse({ success: false, error: error.message });
	});

	return true;
});

async function isSidePanelOpen(windowId: number): Promise<boolean> {
	return sidePanelOpenWindows.has(windowId);
}

async function setupTabListeners() {
	const browserType = await detectBrowser();
	if (['chrome', 'brave', 'edge'].includes(browserType)) {
		// Call this function when a tab is activated
		browser.tabs.onActivated.addListener(async (activeInfo) => {
			if (await isSidePanelOpen(activeInfo.windowId)) {
				updateCurrentActiveTab(activeInfo.windowId);
			}
		});

		// Call this function when a tab is updated
		browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
			if (changeInfo.status === 'complete' && tab.active && tab.windowId && await isSidePanelOpen(tab.windowId)) {
				updateCurrentActiveTab(tab.windowId);
			}
		});

		// Update for window focus changes
		browser.windows.onFocusChanged.addListener(async (windowId) => {
			if (windowId !== browser.windows.WINDOW_ID_NONE && await isSidePanelOpen(windowId)) {
				updateCurrentActiveTab(windowId);
			}
		});
	}
}

// Initialize the tab listeners
setupTabListeners();
