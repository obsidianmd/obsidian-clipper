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

		function extractContentBySelector(selector) {
			const element = document.querySelector(selector);
			return element ? element.textContent.trim() : '';
		}

		const extractedContent = {
			title: document.title,
			url: window.location.href,
			// Add more default extractions here
		};

		sendResponse({
			content: document.documentElement.outerHTML,
			selectedHtml: selectedHtml,
			extractedContent: extractedContent,
			extractContentBySelector: extractContentBySelector
		});
	} else if (request.action === "extractContent") {
		const content = extractContentBySelector(request.selector);
		sendResponse({ content: content });
	}
	return true;
});

function extractContentBySelector(selector) {
	const element = document.querySelector(selector);
	return element ? element.textContent.trim() : '';
}