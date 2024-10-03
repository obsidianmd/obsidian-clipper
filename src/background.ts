import browser from './utils/browser-polyfill';
import { ensureContentScriptLoaded } from './utils/content-script-utils';
import { detectBrowser } from './utils/browser-detection';
import { updateCurrentActiveTab } from './utils/active-tab-manager';

let sidePanelOpenWindows: Set<number> = new Set();
let isHighlighterMode = false;

browser.action.onClicked.addListener((tab) => {
	if (tab.id) {
		browser.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['content.js']
		});
	}
});

browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
	if (request.action === "extractContent" && sender.tab && sender.tab.id) {
		browser.tabs.sendMessage(sender.tab.id, request).then(sendResponse);
		return true;
	}

	if (request.action === "ensureContentScriptLoaded" && request.tabId) {
		ensureContentScriptLoaded(request.tabId).then(sendResponse);
		return true;
	}

	if (request.action === "sidePanelOpened") {
		if (sender.tab && sender.tab.windowId) {
			sidePanelOpenWindows.add(sender.tab.windowId);
			updateCurrentActiveTab(sender.tab.windowId);
		}
	}

	if (request.action === "sidePanelClosed") {
		if (sender.tab && sender.tab.windowId) {
			sidePanelOpenWindows.delete(sender.tab.windowId);
		}
	}

	return true;
});

browser.commands.onCommand.addListener((command, tab) => {
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
	if (command === "toggle_highlighter" && tab && tab.id) {
		toggleHighlighterMode(tab.id);
	}
});

async function createContextMenu() {
	browser.contextMenus.create({
		id: "open-obsidian-clipper",
		title: "Clip this page",
		contexts: ["page", "selection"]
	});

	browser.contextMenus.create({
		id: "toggle-highlighter",
		title: "Highlight this page",
		contexts: ["page"]
	});

	browser.contextMenus.create({
		id: "highlight-selection",
		title: "Highlight this",
		contexts: ["selection"]
	});

	browser.contextMenus.create({
		id: "clear-highlights",
		title: "Clear highlights",
		contexts: ["page"]
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
	} else if (info.menuItemId === "toggle-highlighter" && tab && tab.id) {
		toggleHighlighterMode(tab.id);
	} else if (info.menuItemId === "highlight-selection" && tab && tab.id) {
		highlightSelection(tab.id);
	} else if (info.menuItemId === "clear-highlights" && tab && tab.id) {
		clearHighlights(tab.id);
	} else if (info.menuItemId === 'open-side-panel' && tab && tab.id && tab.windowId) {
		chrome.sidePanel.open({ tabId: tab.id });
		sidePanelOpenWindows.add(tab.windowId);
		ensureContentScriptLoaded(tab.id);
	}
});

browser.runtime.onInstalled.addListener(() => {
	createContextMenu();
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
	}
}


function toggleHighlighterMode(tabId: number) {
	isHighlighterMode = !isHighlighterMode;
	browser.tabs.sendMessage(tabId, { action: "toggleHighlighter", isActive: isHighlighterMode });
}

function highlightSelection(tabId: number) {
	isHighlighterMode = true;
	browser.tabs.sendMessage(tabId, { action: "highlightSelection", isActive: isHighlighterMode });
}

function clearHighlights(tabId: number) {
	browser.tabs.sendMessage(tabId, { action: "clearHighlights" });
}

// Initialize the tab listeners
setupTabListeners();
