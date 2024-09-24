import browser from './utils/browser-polyfill';
import { ensureContentScriptLoaded } from './utils/content-script-utils';
import { detectBrowser } from './utils/browser-detection';

let sidePanelOpenWindows: Set<number> = new Set();
let currentActiveTabId: number | undefined;
let currentWindowId: number | undefined;

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
		if (!sender.tab.windowId || !sidePanelOpenWindows.has(sender.tab.windowId)) {
			sendResponse();
			return true;
		}

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

function updateCurrentActiveTab(windowId: number) {
	browser.tabs.query({ active: true, windowId: windowId }).then((tabs) => {
		if (tabs[0] && tabs[0].id && tabs[0].url) {
			currentActiveTabId = tabs[0].id;
			currentWindowId = windowId;
			if (sidePanelOpenWindows.has(windowId)) {
				browser.runtime.sendMessage({ 
					action: "activeTabChanged", 
					tabId: currentActiveTabId,
					url: tabs[0].url,
					isValidUrl: isValidUrl(tabs[0].url),
					isBlankPage: isBlankPage(tabs[0].url)
				});
			}
		}
	});
}

// Call this function when a tab is activated
browser.tabs.onActivated.addListener((activeInfo) => {
	updateCurrentActiveTab(activeInfo.windowId);
});

// Call this function when a tab is updated
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete' && tab.active && tab.windowId) {
		updateCurrentActiveTab(tab.windowId);
	}
});

// Update for window focus changes
browser.windows.onFocusChanged.addListener((windowId) => {
	if (windowId !== browser.windows.WINDOW_ID_NONE) {
		updateCurrentActiveTab(windowId);
	}
});

// Modify the existing message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const handleMessage = async () => {
		if (message.action === "getCurrentActiveTab") {
			sendResponse({ tabId: currentActiveTabId });
		} else if (message.type === 'open_side_panel' && sender.tab && sender.tab.id) {
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

function isValidUrl(url: string): boolean {
	return url.startsWith('http://') || url.startsWith('https://');
}

function isBlankPage(url: string): boolean {
	return url === 'about:blank' || url === 'chrome://newtab/' || url === 'edge://newtab/';
}
