chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.action === "getPageContent") {
		sendResponse({content: document.documentElement.outerHTML});
	}
});