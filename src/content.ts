interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: { [key: string]: string };
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request.action === "getPageContent") {
		let selectedHtml = '';
		const selection = window.getSelection();
		
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			const clonedSelection = range.cloneContents();
			const div = document.createElement('div');
			div.appendChild(clonedSelection);
			selectedHtml = div.innerHTML;
		}

		const extractedContent: { [key: string]: string } = {
			title: document.title,
			url: window.location.href,
			// Add more default extractions here
		};

		const response: ContentResponse = {
			content: document.documentElement.outerHTML,
			selectedHtml: selectedHtml,
			extractedContent: extractedContent
		};

		sendResponse(response);
	} else if (request.action === "extractContent") {
		const content = extractContentBySelector(request.selector);
		sendResponse({ content: content });
	}
	return true;
});

function extractContentBySelector(selector: string): string {
	const element = document.querySelector(selector);
	return element ? element.textContent?.trim() || '' : '';
}