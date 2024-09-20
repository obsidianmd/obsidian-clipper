import browser from './utils/browser-polyfill';

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
		browser.tabs.sendMessage(sender.tab.id, request).then(sendResponse);
		return true;
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

function createContextMenu() {
	browser.contextMenus.create({
		id: "open-obsidian-clipper",
		title: "Add to Obsidian",
		contexts: ["page", "selection"]
	});
}

browser.contextMenus.onClicked.addListener((info, tab) => {
	if (info.menuItemId === "open-obsidian-clipper") {
		browser.action.openPopup();
	}
});

browser.runtime.onInstalled.addListener(() => {
	createContextMenu();
});
