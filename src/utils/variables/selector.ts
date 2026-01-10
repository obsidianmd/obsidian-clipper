import browser from '../browser-polyfill';
import { applyFilters } from '../filters';
import { debugLog } from '../debug';

/**
 * Resolve a selector and return the raw content (array or string).
 * Used by the renderer for for loops and conditionals.
 */
export async function resolveSelector(tabId: number, selectorExpr: string): Promise<any> {
	// Parse the selector expression (selector:... or selectorHtml:...)
	// Format: selector:cssSelector or selectorHtml:cssSelector
	// May include attribute selector: selector:cssSelector?attr
	const selectorRegex = /^(selector|selectorHtml):(.*?)(?:\?(.*))?$/;
	const matches = selectorExpr.match(selectorRegex);
	if (!matches) {
		console.error('Invalid selector format:', selectorExpr);
		return undefined;
	}

	const [, selectorType, rawSelector, attribute] = matches;
	const extractHtml = selectorType === 'selectorHtml';

	// Unescape any escaped quotes in the selector
	const selector = rawSelector.replace(/\\"/g, '"');

	try {
		const response = await browser.tabs.sendMessage(tabId, {
			action: "extractContent",
			selector: selector,
			attribute: attribute,
			extractHtml: extractHtml
		}) as { content: string | string[] };

		// Return the raw content (could be array or string)
		return response ? response.content : undefined;
	} catch (error) {
		console.error('Error extracting content by selector:', error, { selector, attribute, extractHtml });
		return undefined;
	}
}

export async function processSelector(tabId: number, match: string, currentUrl: string): Promise<string> {
	const selectorRegex = /{{(selector|selectorHtml):(.*?)(?:\?(.*?))?(?:\|(.*?))?}}/;
	const matches = match.match(selectorRegex);
	if (!matches) {
		console.error('Invalid selector format:', match);
		return match;
	}

	const [, selectorType, rawSelector, attribute, filtersString] = matches;
	const extractHtml = selectorType === 'selectorHtml';

	// Unescape any escaped quotes in the selector
	const selector = rawSelector.replace(/\\"/g, '"');

	try {
		const response = await browser.tabs.sendMessage(tabId, { 
			action: "extractContent", 
			selector: selector,
			attribute: attribute,
			extractHtml: extractHtml
		}) as { content: string };

		let content = response ? response.content : '';
	
		// Convert content to string if it's an array
		const contentString = Array.isArray(content) ? JSON.stringify(content) : content;
	
		debugLog('ContentExtractor', 'Applying filters:', { selector, filterString: filtersString });
		const filteredContent = applyFilters(contentString, filtersString, currentUrl);
	
		return filteredContent;
	} catch (error) {
		console.error('Error extracting content by selector:', error, { selector, attribute, extractHtml });
		return '';
	}
}
