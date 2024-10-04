import browser from './utils/browser-polyfill';
import { ensureContentScriptLoaded } from './utils/content-script-utils';
import { detectBrowser } from './utils/browser-detection';
import { updateCurrentActiveTab } from './utils/active-tab-manager';
import { AnyHighlightData, ElementHighlightData, TextHighlightData } from './utils/highlighter';

let sidePanelOpenWindows: Set<number> = new Set();
let isHighlighterMode = false;
let hasHighlights = false;

browser.action.onClicked.addListener((tab) => {
	if (tab.id) {
		browser.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['content.js']
		});
	}
});

browser.runtime.onMessage.addListener((request: unknown, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void) => {
	if (typeof request === 'object' && request !== null) {
		const typedRequest = request as { action: string; isActive?: boolean; hasHighlights?: boolean; tabId?: number };
		
		if (typedRequest.action === "extractContent" && sender.tab && sender.tab.id) {
			browser.tabs.sendMessage(sender.tab.id, request).then(sendResponse);
			return true;
		}

		if (typedRequest.action === "ensureContentScriptLoaded" && typedRequest.tabId) {
			ensureContentScriptLoaded(typedRequest.tabId).then(sendResponse);
			return true;
		}

		if (typedRequest.action === "sidePanelOpened") {
			if (sender.tab && sender.tab.windowId) {
				sidePanelOpenWindows.add(sender.tab.windowId);
				updateCurrentActiveTab(sender.tab.windowId);
			}
		}

		if (typedRequest.action === "sidePanelClosed") {
			if (sender.tab && sender.tab.windowId) {
				sidePanelOpenWindows.delete(sender.tab.windowId);
			}
		}

		if (typedRequest.action === "highlighterModeChanged" && sender.tab && typedRequest.isActive !== undefined) {
			isHighlighterMode = typedRequest.isActive;
			updateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "highlightsCleared" && sender.tab) {
			hasHighlights = false;
			updateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "updateHighlightsState" && sender.tab && typedRequest.hasHighlights !== undefined) {
			hasHighlights = typedRequest.hasHighlights;
			updateContextMenu(sender.tab.id!);
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
		toggleHighlighterMode(tab.id, !isHighlighterMode);
	}
});

async function createContextMenu() {
	browser.contextMenus.create({
		id: "open-obsidian-clipper",
		title: "Clip this page",
		contexts: ["page", "selection", "image", "video", "audio"]
	});

	const browserType = await detectBrowser();
	if (browserType === 'chrome') {
		browser.contextMenus.create({
			id: 'open-side-panel',
			title: 'Open side panel',
			contexts: ["page", "selection"]
		});
	}

	browser.contextMenus.create({
		id: "toggle-highlighter",
		title: "Highlight this page",
		contexts: ["page"]
	});

	browser.contextMenus.create({
		id: "highlight-selection",
		title: "Add to highlights",
		contexts: ["selection"]
	});

	browser.contextMenus.create({
		id: "highlight-element",
		title: "Add to highlights",
		contexts: ["image", "video", "audio"]
	});

	browser.contextMenus.create({
		id: "clear-highlights",
		title: "Clear highlights",
		contexts: ["page","selection"]
	});

}

async function updateContextMenu(tabId: number) {
	await browser.contextMenus.removeAll();

	browser.contextMenus.create({
		id: "open-obsidian-clipper",
		title: "Clip this page",
		contexts: ["page", "selection", "image", "video", "audio"]
	});

	const browserType = await detectBrowser();
	if (browserType === 'chrome') {
		browser.contextMenus.create({
			id: 'open-side-panel',
			title: 'Open side panel',
			contexts: ["page", "selection"]
		});
	}

	if (isHighlighterMode) {
		browser.contextMenus.create({
			id: "exit-highlighter",
			title: "Exit highlighter mode",
			contexts: ["page"]
		});
	} else {
		browser.contextMenus.create({
			id: "enter-highlighter",
			title: "Highlight this page",
			contexts: ["page"]
		});
	}

	browser.contextMenus.create({
		id: "highlight-selection",
		title: "Add to highlights",
		contexts: ["selection"]
	});

	browser.contextMenus.create({
		id: "highlight-element",
		title: "Add to highlights",
		contexts: ["image", "video", "audio"]
	});

	if (hasHighlights) {
		browser.contextMenus.create({
			id: "clear-highlights",
			title: "Clear highlights",
			contexts: ["page", "selection"]
		});
	}
}

browser.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "open-obsidian-clipper") {
		browser.action.openPopup();
	} else if (info.menuItemId === "enter-highlighter" && tab && tab.id) {
		toggleHighlighterMode(tab.id, true);
	} else if (info.menuItemId === "exit-highlighter" && tab && tab.id) {
		toggleHighlighterMode(tab.id, false);
	} else if (info.menuItemId === "highlight-selection" && tab && tab.id) {
		highlightSelection(tab.id, info);
	} else if (info.menuItemId === "highlight-element" && tab && tab.id) {
		highlightElement(tab.id, info);
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

function toggleHighlighterMode(tabId: number, activate: boolean) {
	browser.tabs.sendMessage(tabId, { action: "toggleHighlighter", isActive: activate });
}

async function highlightSelection(tabId: number, info: browser.Menus.OnClickData) {
	isHighlighterMode = true;
	
	const highlightData: Partial<TextHighlightData> = {
		id: Date.now().toString(),
		type: 'text',
		content: info.selectionText || '',
	};

	await browser.tabs.sendMessage(tabId, { 
		action: "highlightSelection", 
		isActive: isHighlighterMode,
		highlightData,
	});
	hasHighlights = true;
	updateContextMenu(tabId);
}

async function highlightElement(tabId: number, info: browser.Menus.OnClickData) {
	isHighlighterMode = true;

	await browser.tabs.sendMessage(tabId, { 
		action: "highlightElement", 
		isActive: isHighlighterMode,
		targetElementInfo: {
			mediaType: info.mediaType === 'image' ? 'img' : info.mediaType,
			srcUrl: info.srcUrl,
			pageUrl: info.pageUrl
		}
	});
	hasHighlights = true;
	updateContextMenu(tabId);
}

function clearHighlights(tabId: number) {
	browser.tabs.sendMessage(tabId, { action: "clearHighlights" });
}

// Initialize the tab listeners
setupTabListeners();
