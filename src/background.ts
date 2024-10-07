import browser from './utils/browser-polyfill';
import { ensureContentScriptLoaded } from './utils/content-script-utils';
import { detectBrowser } from './utils/browser-detection';
import { updateCurrentActiveTab } from './utils/active-tab-manager';
import { TextHighlightData } from './utils/highlighter';
import { debounce } from './utils/debounce';

let sidePanelOpenWindows: Set<number> = new Set();
let isHighlighterMode = false;
let hasHighlights = false;
let isContextMenuCreating = false;

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
			browser.runtime.sendMessage({ action: "updatePopupHighlighterUI", isActive: isHighlighterMode });
			debouncedUpdateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "highlightsCleared" && sender.tab) {
			hasHighlights = false;
			debouncedUpdateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "updateHasHighlights" && sender.tab && typedRequest.hasHighlights !== undefined) {
			hasHighlights = typedRequest.hasHighlights;
			debouncedUpdateContextMenu(sender.tab.id!);
		}

		if (typedRequest.action === "getHighlighterMode") {
			sendResponse({ isActive: isHighlighterMode });
		}

		if (typedRequest.action === "toggleHighlighterMode" && typedRequest.tabId) {
			toggleHighlighterMode(typedRequest.tabId);
			sendResponse({ success: true });
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

const debouncedUpdateContextMenu = debounce(async (tabId: number) => {
	if (isContextMenuCreating) {
		return;
	}
	isContextMenuCreating = true;

	try {
		await browser.contextMenus.removeAll();

		const menuItems: {
			id: string;
			title: string;
			contexts: browser.Menus.ContextType[];
		}[] = [
				{
					id: "open-obsidian-clipper",
					title: "Clip this page",
					contexts: ["page", "selection", "image", "video", "audio"]
				},
				{
					id: isHighlighterMode ? "exit-highlighter" : "enter-highlighter",
					title: isHighlighterMode ? "Exit highlighter mode" : "Highlight this page",
					contexts: ["page","image", "video", "audio"]
				},
				{
					id: "highlight-selection",
					title: "Add to highlights",
					contexts: ["selection"]
				},
				{
					id: "highlight-element",
					title: "Add to highlights",
					contexts: ["image", "video", "audio"]
				}
			];

			const browserType = await detectBrowser();
		if (browserType === 'chrome') {
			menuItems.push({
				id: 'open-side-panel',
				title: 'Open side panel',
				contexts: ["page", "selection"]
			});
		}

		for (const item of menuItems) {
			await browser.contextMenus.create(item);
		}
	} catch (error) {
		console.error('Error updating context menu:', error);
	} finally {
		isContextMenuCreating = false;
	}
}, 100); // 100ms debounce time

browser.contextMenus.onClicked.addListener(async (info, tab) => {
	if (info.menuItemId === "open-obsidian-clipper") {
		browser.action.openPopup();
	} else if (info.menuItemId === "enter-highlighter" && tab && tab.id) {
		await setHighlighterMode(tab.id, true);
	} else if (info.menuItemId === "exit-highlighter" && tab && tab.id) {
		await setHighlighterMode(tab.id, false);
	} else if (info.menuItemId === "highlight-selection" && tab && tab.id) {
		await highlightSelection(tab.id, info);
	} else if (info.menuItemId === "highlight-element" && tab && tab.id) {
		await highlightElement(tab.id, info);
	} else if (info.menuItemId === 'open-side-panel' && tab && tab.id && tab.windowId) {
		chrome.sidePanel.open({ tabId: tab.id });
		sidePanelOpenWindows.add(tab.windowId);
		await ensureContentScriptLoaded(tab.id);
	}
});

browser.runtime.onInstalled.addListener(() => {
	debouncedUpdateContextMenu(-1); // Use a dummy tabId for initial creation
});

async function isSidePanelOpen(windowId: number): Promise<boolean> {
	return sidePanelOpenWindows.has(windowId);
}

async function setupTabListeners() {
	const browserType = await detectBrowser();
	if (['chrome', 'brave', 'edge'].includes(browserType)) {

		browser.tabs.onActivated.addListener(async (activeInfo) => {
			if (await isSidePanelOpen(activeInfo.windowId)) {
				updateCurrentActiveTab(activeInfo.windowId);
				if (isHighlighterMode) {
					await setHighlighterMode(activeInfo.tabId, true);
				}
			}
		});

		browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
			if (changeInfo.status === 'complete' && tab.active && tab.windowId && await isSidePanelOpen(tab.windowId)) {
				updateCurrentActiveTab(tab.windowId);
				if (isHighlighterMode) {
					await setHighlighterMode(tabId, true);
				}
			}
		});
	}
}

async function setHighlighterMode(tabId: number, activate: boolean) {
	try {
		// First, check if the tab exists
		const tab = await browser.tabs.get(tabId);
		if (!tab) {
			console.error('Tab does not exist:', tabId);
			return;
		}

		// Then, ensure the content script is loaded
		await ensureContentScriptLoaded(tabId);

		// Now try to send the message
		isHighlighterMode = activate;
		await browser.storage.local.set({ isHighlighterMode: activate });
		await browser.tabs.sendMessage(tabId, { action: "setHighlighterMode", isActive: activate });
		debouncedUpdateContextMenu(tabId);
		browser.runtime.sendMessage({ action: "updatePopupHighlighterUI", isActive: activate });

		// Store the highlighter mode state
		await browser.storage.local.set({ isHighlighterMode: activate });
	} catch (error) {
		console.error('Error setting highlighter mode:', error);
		// If there's still an error, the tab might have been closed or navigated away
		// In this case, we should update our state accordingly
		isHighlighterMode = false;
		await browser.storage.local.set({ isHighlighterMode: false });
		debouncedUpdateContextMenu(tabId);
		browser.runtime.sendMessage({ action: "updatePopupHighlighterUI", isActive: false });
		await browser.storage.local.set({ isHighlighterMode: false });
	}
}

async function toggleHighlighterMode(tabId: number) {
	const result = await browser.storage.local.get('isHighlighterMode');
	const currentMode = result.isHighlighterMode;
	await browser.storage.local.set({ isHighlighterMode: !currentMode });
	await setHighlighterMode(tabId, !currentMode);
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
	debouncedUpdateContextMenu(tabId);
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
	debouncedUpdateContextMenu(tabId);
}

// Initialize the tab listeners
setupTabListeners();

// Initialize the global highlighter state when the extension starts
browser.storage.local.get('isHighlighterMode').then((result: { isHighlighterMode?: boolean }) => {
	isHighlighterMode = result.isHighlighterMode ?? false;
});