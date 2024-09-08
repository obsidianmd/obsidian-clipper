chrome.action.onClicked.addListener((tab) => {
	if (tab.id) {
		chrome.scripting.executeScript({
			target: { tabId: tab.id },
			files: ['content.js']
		});
	}
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === "extractContent" && sender.tab && sender.tab.id) {
		chrome.tabs.sendMessage(sender.tab.id, request, sendResponse);
		return true;
	}
});

chrome.commands.onCommand.addListener((command) => {
	if (command === 'quick_clip') {
		chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
			if (tabs[0].id) {
				chrome.action.openPopup(() => {
					// Wait for the popup to be ready
					setTimeout(() => {
						chrome.runtime.sendMessage({action: "triggerQuickClip"}, (response) => {
							if (chrome.runtime.lastError) {
								console.error("Failed to send quick clip message:", chrome.runtime.lastError);
							} else {
								console.log("Quick clip triggered successfully");
							}
						});
					}, 500);
				});
			}
		});
	}
});
