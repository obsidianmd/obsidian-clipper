interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: { [key: string]: string };
	schemaOrgData: any;
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

		const extractedContent: { [key: string]: string } = {};

		const schemaOrgData = extractSchemaOrgData();

		const response: ContentResponse = {
			content: document.documentElement.outerHTML,
			selectedHtml: selectedHtml,
			extractedContent: extractedContent,
			schemaOrgData: schemaOrgData
		};

		sendResponse(response);
	} else if (request.action === "extractContent") {
		const content = extractContentBySelector(request.selector);
		sendResponse({ content: content, schemaOrgData: extractSchemaOrgData() });
	}
	return true;
});

function extractContentBySelector(selector: string): string | string[] {
	const elements = document.querySelectorAll(selector);
	
	if (elements.length > 1) {
		return Array.from(elements).map(el => el.textContent?.trim() || '');
	} else if (elements.length === 1) {
		return elements[0].textContent?.trim() || '';
	} else {
		return '';
	}
}

function extractSchemaOrgData(): any {
	const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
	const schemaData: any[] = [];

	schemaScripts.forEach(script => {
		let jsonContent = script.textContent || '';
		
		try {
			// Consolidated regex to clean up the JSON content
			jsonContent = jsonContent
				.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '') // Remove multi-line and single-line comments
				.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1') // Remove CDATA wrapper
				.replace(/^\s*(\*\/|\/\*)\s*|\s*(\*\/|\/\*)\s*$/g, '') // Remove any remaining comment markers at start or end
				.trim();
			
			const jsonData = JSON.parse(jsonContent);
			schemaData.push(jsonData);
		} catch (error) {
			console.error('Error parsing schema.org data:', error);
			console.error('Problematic JSON content:', jsonContent);
		}
	});

	return schemaData;
}