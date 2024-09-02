chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.action === "getPageContent") {
		let selectedHtml = '';
		const selection = window.getSelection();
		
		if (selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			const clonedSelection = range.cloneContents();
			const div = document.createElement('div');
			div.appendChild(clonedSelection);
			selectedHtml = div.innerHTML;
		}

		sendResponse({
			content: document.documentElement.outerHTML,
			selectedHtml: selectedHtml
		});
	}
});