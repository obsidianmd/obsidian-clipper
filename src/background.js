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
		return true; // Indicates that the response is asynchronous
	}
});
