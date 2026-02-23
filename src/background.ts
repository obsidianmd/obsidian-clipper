import browser from 'webextension-polyfill';
import { updateCurrentActiveTab, isValidUrl, isBlankPage } from './utils/active-tab-manager';
import { TextHighlightData } from './utils/highlighter';
import { debounce } from './utils/debounce';

let sidePanelOpenWindows: Set<number> = new Set();
let highlighterModeState: { [tabId: number]: boolean } = {};
let hasHighlights = false;
let isContextMenuCreating = false;
let popupPorts: { [tabId: number]: browser.Runtime.Port } = {};

async function ensureContentScriptLoadedInBackground(tabId: number): Promise<void> {
	try {
		// First, get the tab information
		const tab = await browser.tabs.get(tabId);

		// Check if the URL is valid before proceeding
		if (!tab.url || !isValidUrl(tab.url)) {
			console.log(`Skipping content script injection for invalid URL: ${tab.url}`);
			throw new Error(`Cannot inject content script into invalid URL: ${tab.url}`);
		}

		// Attempt to send a message to the content script
		await browser.tabs.sendMessage(tabId, { action: "ping" });
	} catch (error) {
		// If the error is about invalid URL, re-throw it
		if (error instanceof Error && error.message.includes('invalid URL')) {
			throw error;
		}
		
		// If the message fails, the content script is not loaded, so inject it
		console.log('Content script not loaded, injecting...');
		try {
			// Try using the scripting API (Chrome)
			if (browser.scripting) {
				await browser.scripting.executeScript({
					target: { tabId: tabId },
					files: ['content.js']
				});
			} else {
				// Fallback to tabs.executeScript (Firefox)
				await browser.tabs.executeScript(tabId, {
					file: 'content.js'
				});
			}
		} catch (injectError) {
			console.error('Failed to inject content script:', injectError);
			throw injectError;
		}
	}
}

function getHighlighterModeForTab(tabId: number): boolean {
	return highlighterModeState[tabId] ?? false;
}

async function openHighlightsSidePanel(tabId: number, windowId: number): Promise<void> {
	const sidePanelApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.sidePanel;
	if (!sidePanelApi || typeof sidePanelApi.open !== 'function') {
		throw new Error('Side panel API unavailable');
	}

	// open() must happen immediately in the user-gesture call stack.
	sidePanelApi.open({ tabId });
	sidePanelOpenWindows.add(windowId);
	await ensureContentScriptLoadedInBackground(tabId);
}

async function initialize() {
	try {
		// Set up tab listeners
		await setupTabListeners();

		browser.tabs.onRemoved.addListener((tabId) => {
			delete highlighterModeState[tabId];
		});
		
		// Initialize context menu
		await debouncedUpdateContextMenu(-1);
		
		console.log('Background script initialized successfully');
	} catch (error) {
		console.error('Error initializing background script:', error);
	}
}

// Check if a popup is open for a given tab
function isPopupOpen(tabId: number): boolean {
	return popupPorts.hasOwnProperty(tabId);
}

browser.runtime.onConnect.addListener((port) => {
	if (port.name === 'popup') {
		const tabId = port.sender?.tab?.id;
		if (tabId) {
			popupPorts[tabId] = port;
			port.onDisconnect.addListener(() => {
				delete popupPorts[tabId];
			});
		}
	}
});

async function sendMessageToPopup(tabId: number, message: any): Promise<void> {
	if (isPopupOpen(tabId)) {
		try {
			await popupPorts[tabId].postMessage(message);
		} catch (error) {
			console.warn(`Error sending message to popup for tab ${tabId}:`, error);
		}
	}
}



browser.runtime.onMessage.addListener((request: unknown, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void): true | undefined => {
	if (typeof request === 'object' && request !== null) {
		const typedRequest = request as {
			action: string;
			isActive?: boolean;
			hasHighlights?: boolean;
			tabId?: number;
			text?: string;
			highlightId?: string;
			origin?: 'panel' | 'page';
		};
		
		if (typedRequest.action === 'copy-to-clipboard' && typedRequest.text) {
			// Use content script to copy to clipboard
			browser.tabs.query({active: true, currentWindow: true}).then(async (tabs) => {
				const currentTab = tabs[0];
				if (currentTab && currentTab.id) {
					try {
						const response = await browser.tabs.sendMessage(currentTab.id, {
							action: 'copy-text-to-clipboard',
							text: typedRequest.text
						});
						if ((response as any) && (response as any).success) {
							sendResponse({success: true});
						} else {
							sendResponse({success: false, error: 'Failed to copy from content script'});
						}
					} catch (err) {
						sendResponse({ success: false, error: (err as Error).message });
					}
				} else {
					sendResponse({success: false, error: 'No active tab found'});
				}
			});
			return true;
		}

		if (typedRequest.action === "extractContent" && sender.tab && sender.tab.id) {
			browser.tabs.sendMessage(sender.tab.id, request).then(sendResponse);
			return true;
		}

		if (typedRequest.action === "ensureContentScriptLoaded") {
			const tabId = typedRequest.tabId || sender.tab?.id;
			if (tabId) {
				ensureContentScriptLoadedInBackground(tabId)
					.then(() => sendResponse({ success: true }))
					.catch((error) => sendResponse({ 
						success: false, 
						error: error instanceof Error ? error.message : String(error) 
					}));
				return true;
			} else {
				sendResponse({ success: false, error: 'No tab ID provided' });
				return true;
			}
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
			const tabId = sender.tab.id;
			if (tabId) {
				highlighterModeState[tabId] = typedRequest.isActive;
				sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: typedRequest.isActive });
				debouncedUpdateContextMenu(tabId);
			}
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
			const tabId = typedRequest.tabId || sender.tab?.id;
			if (tabId) {
				sendResponse({ isActive: getHighlighterModeForTab(tabId) });
			} else {
				sendResponse({ isActive: false });
			}
			return true;
		}

			if (typedRequest.action === "toggleHighlighterMode" && typedRequest.tabId) {
				toggleHighlighterMode(typedRequest.tabId)
					.then(newMode => sendResponse({ success: true, isActive: newMode }))
					.catch(error => sendResponse({ success: false, error: error.message }));
				return true;
			}

			if (typedRequest.action === "openHighlightsSidePanel") {
				const senderTab = sender.tab;
				if (senderTab?.id && senderTab.windowId) {
					openHighlightsSidePanel(senderTab.id, senderTab.windowId)
						.then(() => sendResponse({ success: true }))
						.catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
					return true;
				}

				browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
					const activeTab = tabs[0];
					if (!activeTab?.id || activeTab.windowId === undefined) {
						sendResponse({ success: false, error: 'No active tab found' });
						return;
					}

					try {
						await openHighlightsSidePanel(activeTab.id, activeTab.windowId);
						sendResponse({ success: true });
					} catch (error) {
						sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
					}
				});
				return true;
			}

			if (typedRequest.action === "selectHighlightById") {
				const tabId = typedRequest.tabId;
				const highlightId = typedRequest.highlightId;
				if (!tabId || !highlightId) {
					sendResponse({ success: false, error: 'Missing tabId or highlightId' });
					return true;
				}

				ensureContentScriptLoadedInBackground(tabId)
					.then(() => browser.tabs.sendMessage(tabId, {
						action: "selectHighlightById",
						highlightId,
						origin: "panel"
					}))
					.then((response) => {
						if (response && typeof response === 'object' && 'success' in response) {
							sendResponse(response);
							return;
						}
						sendResponse({ success: true });
					})
					.catch((error) => {
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : String(error)
						});
					});
				return true;
			}

			if (typedRequest.action === "highlightSelectedInPage" && sender.tab?.id && typedRequest.highlightId) {
				browser.runtime.sendMessage({
					action: "highlightSelected",
					tabId: sender.tab.id,
					highlightId: typedRequest.highlightId,
					origin: "page"
				}).catch((error) => {
					console.warn('Failed to sync selected highlight to panel:', error);
				});
			}

		if (typedRequest.action === "openPopup") {
			browser.action.openPopup()
				.then(() => {
					sendResponse({ success: true });
				})
				.catch((error: unknown) => {
					console.error('Error opening popup in background script:', error);
					sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
				});
			return true;
		}

		if (typedRequest.action === "toggleReaderMode" && typedRequest.tabId) {
			injectReaderScript(typedRequest.tabId).then(() => {
				browser.tabs.sendMessage(typedRequest.tabId!, { action: "toggleReaderMode" })
					.then(sendResponse);
			});
			return true;
		}

		if (typedRequest.action === "getActiveTabAndToggleIframe") {
			browser.tabs.query({active: true, currentWindow: true}).then(async (tabs) => {
				const currentTab = tabs[0];
				if (currentTab && currentTab.id) {
					try {
						// Check if the URL is valid before trying to inject content script
						if (!currentTab.url || !isValidUrl(currentTab.url) || isBlankPage(currentTab.url)) {
							sendResponse({success: false, error: 'Cannot open iframe on this page'});
							return;
						}

						// Ensure content script is loaded first
						await ensureContentScriptLoadedInBackground(currentTab.id);
						await browser.tabs.sendMessage(currentTab.id, { action: "toggle-iframe" });
						sendResponse({success: true});
					} catch (error) {
						console.error('Error sending toggle-iframe message:', error);
						sendResponse({success: false, error: error instanceof Error ? error.message : String(error)});
					}
				} else {
					sendResponse({success: false, error: 'No active tab found'});
				}
			});
			return true;
		}

		if (typedRequest.action === "getActiveTab") {
			browser.tabs.query({active: true, currentWindow: true}).then(async (tabs) => {
				let currentTab = tabs[0];
				// Fallback for when currentWindow has no tabs (e.g., debugging popup in DevTools)
				if (!currentTab || !currentTab.id) {
					const allActiveTabs = await browser.tabs.query({active: true});
					currentTab = allActiveTabs.find(tab =>
						tab.id && tab.url && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith('moz-extension://')
					) || allActiveTabs[0];
				}
				if (currentTab && currentTab.id) {
					sendResponse({tabId: currentTab.id});
				} else {
					sendResponse({error: 'No active tab found'});
				}
			});
			return true;
		}

		if (typedRequest.action === "openOptionsPage") {
			try {
				if (typeof browser.runtime.openOptionsPage === 'function') {
					// Chrome way
					browser.runtime.openOptionsPage();
				} else {
					// Firefox way
					browser.tabs.create({
						url: browser.runtime.getURL('settings.html')
					});
				}
				sendResponse({success: true});
			} catch (error) {
				console.error('Error opening options page:', error);
				sendResponse({success: false, error: error instanceof Error ? error.message : String(error)});
			}
			return true;
		}

		if (typedRequest.action === "getTabInfo") {
			browser.tabs.get(typedRequest.tabId as number).then((tab) => {
				sendResponse({
					success: true,
					tab: {
						id: tab.id,
						url: tab.url
					}
				});
			}).catch((error) => {
				console.error('Error getting tab info:', error);
				sendResponse({
					success: false,
					error: error instanceof Error ? error.message : String(error)
				});
			});
			return true;
		}

		if (typedRequest.action === "sendMessageToTab") {
			const tabId = (typedRequest as any).tabId;
			const message = (typedRequest as any).message;
			if (tabId && message) {
				// Ensure content script is loaded before sending message
				ensureContentScriptLoadedInBackground(tabId).then(() => {
					return browser.tabs.sendMessage(tabId, message);
				}).then((response) => {
					sendResponse(response);
				}).catch((error) => {
					console.error('Error sending message to tab:', error);
					sendResponse({
						success: false,
						error: error instanceof Error ? error.message : String(error)
					});
				});
				return true;
			} else {
				sendResponse({
					success: false,
					error: 'Missing tabId or message'
				});
				return true;
			}
		}

		if (typedRequest.action === "openObsidianUrl") {
			const url = (typedRequest as any).url;
			if (url) {
				browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
					const currentTab = tabs[0];
					if (currentTab && currentTab.id) {
						browser.tabs.update(currentTab.id, { url: url }).then(() => {
							sendResponse({ success: true });
						}).catch((error) => {
							console.error('Error opening Obsidian URL:', error);
							sendResponse({
								success: false,
								error: error instanceof Error ? error.message : String(error)
							});
						});
					} else {
						sendResponse({
							success: false,
							error: 'No active tab found'
						});
					}
				}).catch((error) => {
					console.error('Error querying tabs:', error);
					sendResponse({
						success: false,
						error: error instanceof Error ? error.message : String(error)
					});
				});
				return true;
			} else {
				sendResponse({
					success: false,
					error: 'Missing URL'
				});
				return true;
			}
		}

		// For other actions that use sendResponse
		if (typedRequest.action === "extractContent" || 
			typedRequest.action === "ensureContentScriptLoaded" ||
			typedRequest.action === "getHighlighterMode" ||
			typedRequest.action === "toggleHighlighterMode" ||
			typedRequest.action === "openObsidianUrl") {
			return true;
		}
	}
	return undefined;
});

browser.commands.onCommand.addListener(async (command, tab) => {
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
		await ensureContentScriptLoadedInBackground(tab.id);
		await toggleHighlighterMode(tab.id, { captureSelectionOnEnable: true });
	}
	if (command === "copy_to_clipboard" && tab && tab.id) {
		await browser.tabs.sendMessage(tab.id, { action: "copyToClipboard" });
	}
	if (command === "toggle_reader" && tab && tab.id) {
		await ensureContentScriptLoadedInBackground(tab.id);
		await injectReaderScript(tab.id);
		await browser.tabs.sendMessage(tab.id, { action: "toggleReaderMode" });
	}
});

const debouncedUpdateContextMenu = debounce(async (tabId: number) => {
	if (isContextMenuCreating) {
		return;
	}
	isContextMenuCreating = true;

	try {
		await browser.contextMenus.removeAll();

		let currentTabId = tabId;
		if (currentTabId === -1) {
			const tabs = await browser.tabs.query({ active: true, currentWindow: true });
			if (tabs.length > 0) {
				currentTabId = tabs[0].id!;
			}
		}

		const isHighlighterMode = getHighlighterModeForTab(currentTabId);

		const menuItems: {
			id: string;
			title: string;
			contexts: browser.Menus.ContextType[];
		}[] = [
				{
					id: "open-obsidian-clipper",
					title: "Save this page",
					contexts: ["page", "selection", "image", "video", "audio"]
				},
				{
					id: 'copy-markdown-to-clipboard',
					title: browser.i18n.getMessage('copyToClipboard'),
					contexts: ["page", "selection"]
				},
				// {
				// 	id: "toggle-reader",
				// 	title: "Reading view",
				// 	contexts: ["page", "selection"]
				// },
				{
					id: isHighlighterMode ? "exit-highlighter" : "enter-highlighter",
					title: isHighlighterMode ? "Exit highlighter" : "Highlight this page",
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
				},
				{
					id: 'open-embedded',
					title: browser.i18n.getMessage('openEmbedded'),
					contexts: ["page", "selection"]
				}
			];

		const sidePanelApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome?.sidePanel;
		if (sidePanelApi && typeof sidePanelApi.open === 'function') {
			menuItems.push({
				id: 'open-side-panel',
				title: browser.i18n.getMessage('openSidePanel'),
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
	// } else if (info.menuItemId === "toggle-reader" && tab && tab.id) {
	// 	await ensureContentScriptLoadedInBackground(tab.id);
	// 	await injectReaderScript(tab.id);
	// 	await browser.tabs.sendMessage(tab.id, { action: "toggleReaderMode" });
		} else if (info.menuItemId === 'open-embedded' && tab && tab.id) {
			await ensureContentScriptLoadedInBackground(tab.id);
			await browser.tabs.sendMessage(tab.id, { action: "toggle-iframe" });
		} else if (info.menuItemId === 'open-side-panel' && tab && tab.id && tab.windowId) {
			await openHighlightsSidePanel(tab.id, tab.windowId);
		} else if (info.menuItemId === 'copy-markdown-to-clipboard' && tab && tab.id) {
			await ensureContentScriptLoadedInBackground(tab.id);
			await browser.tabs.sendMessage(tab.id, { action: "copyMarkdownToClipboard" });
		}
});

browser.runtime.onInstalled.addListener(() => {
	debouncedUpdateContextMenu(-1); // Use a dummy tabId for initial creation
});

async function isSidePanelOpen(windowId: number): Promise<boolean> {
	return sidePanelOpenWindows.has(windowId);
}

async function setupTabListeners() {
	browser.tabs.onActivated.addListener(handleTabChange);
	browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
		if (changeInfo.status === 'complete') {
			handleTabChange({ tabId, windowId: tab.windowId });
		}
	});
}

const debouncedPaintHighlights = debounce(async (tabId: number) => {
	if (!getHighlighterModeForTab(tabId)) {
		await setHighlighterMode(tabId, false);
	}
	await paintHighlights(tabId);
}, 250);

async function handleTabChange(activeInfo: { tabId: number; windowId?: number }) {
	if (activeInfo.windowId === undefined) {
		return;
	}

	updateCurrentActiveTab(activeInfo.windowId);
	if (await isSidePanelOpen(activeInfo.windowId)) {
		await debouncedPaintHighlights(activeInfo.tabId);
	}
}

async function paintHighlights(tabId: number) {
	try {
		const tab = await browser.tabs.get(tabId);
		if (!tab || !tab.url || !isValidUrl(tab.url) || isBlankPage(tab.url)) {
			return;
		}

		await ensureContentScriptLoadedInBackground(tabId);
		await browser.tabs.sendMessage(tabId, { action: "paintHighlights" });

	} catch (error) {
		console.error('Error painting highlights:', error);
	}
}

async function setHighlighterMode(tabId: number, activate: boolean) {
	try {
		// First, check if the tab exists
		const tab = await browser.tabs.get(tabId);
		if (!tab || !tab.url) {
			return;
		}

		// Check if the URL is valid and not a blank page
		if (!isValidUrl(tab.url) || isBlankPage(tab.url)) {
			return;
		}

		// Then, ensure the content script is loaded
		await ensureContentScriptLoadedInBackground(tabId);

		// Now try to send the message
		highlighterModeState[tabId] = activate;
		await browser.tabs.sendMessage(tabId, { action: "setHighlighterMode", isActive: activate });
		debouncedUpdateContextMenu(tabId);
		await sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: activate });

	} catch (error) {
		console.error('Error setting highlighter mode:', error);
		// If there's an error, assume highlighter mode should be off
		highlighterModeState[tabId] = false;
		debouncedUpdateContextMenu(tabId);
		await sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: false });
	}
}

async function toggleHighlighterMode(
	tabId: number,
	options: { captureSelectionOnEnable?: boolean } = {}
): Promise<boolean> {
	try {
		const currentMode = getHighlighterModeForTab(tabId);
		const newMode = !currentMode;
		highlighterModeState[tabId] = newMode;
		await browser.tabs.sendMessage(tabId, { action: "setHighlighterMode", isActive: newMode });
		if (newMode && options.captureSelectionOnEnable) {
			await browser.tabs.sendMessage(tabId, { action: "highlightSelection", isActive: true });
		}
		debouncedUpdateContextMenu(tabId);
		await sendMessageToPopup(tabId, { action: "updatePopupHighlighterUI", isActive: newMode });
		return newMode;
	} catch (error) {
		console.error('Error toggling highlighter mode:', error);
		throw error;
	}
}

async function highlightSelection(tabId: number, info: browser.Menus.OnClickData) {
	highlighterModeState[tabId] = true;
	
	const highlightData: Partial<TextHighlightData> = {
		id: Date.now().toString(),
		type: 'text',
		content: info.selectionText || '',
	};

	await browser.tabs.sendMessage(tabId, { 
		action: "highlightSelection", 
		isActive: true,
		highlightData,
	});
	hasHighlights = true;
	debouncedUpdateContextMenu(tabId);
}

async function highlightElement(tabId: number, info: browser.Menus.OnClickData) {
	highlighterModeState[tabId] = true;

	await browser.tabs.sendMessage(tabId, { 
		action: "highlightElement", 
		isActive: true,
		targetElementInfo: {
			mediaType: info.mediaType === 'image' ? 'img' : info.mediaType,
			srcUrl: info.srcUrl,
			pageUrl: info.pageUrl
		}
	});
	hasHighlights = true;
	debouncedUpdateContextMenu(tabId);
}

async function injectReaderScript(tabId: number) {
	try {
		await browser.scripting.insertCSS({
			target: { tabId },
			files: ['reader.css']
		});

		// Inject scripts in sequence for all browsers
		await browser.scripting.executeScript({
			target: { tabId },
			files: ['browser-polyfill.min.js']
		});
		await browser.scripting.executeScript({
			target: { tabId },
			files: ['reader-script.js']
		});

		return true;
	} catch (error) {
		console.error('Error injecting reader script:', error);
		return false;
	}
}

// Initialize the extension
initialize().catch(error => {
	console.error('Failed to initialize background script:', error);
});
