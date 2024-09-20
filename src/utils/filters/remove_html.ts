import { debugLog } from '../debug';

export const remove_html = (html: string, params: string = ''): string => {
	debugLog('RemoveHTML', 'Input:', { html, params });

	// Remove outer parentheses if present
	params = params.replace(/^\((.*)\)$/, '$1');

	// Remove any surrounding quotes (both single and double) and unescape internal quotes
	params = params.replace(/^(['"])(.*)\1$/, '$2').replace(/\\(['"])/g, '$1');

	// Split by comma, but respect both single and double quoted strings
	const elementsToRemove = params.split(/,(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/)
		.map(elem => elem.trim())
		.filter(Boolean);

	debugLog('RemoveHTML', 'Elements to remove:', elementsToRemove);

	// If no elements specified, return the original HTML
	if (elementsToRemove.length === 0) {
		return html;
	}

	// Create a temporary DOM element
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = html;

	elementsToRemove.forEach(elem => {
		let elements: NodeListOf<Element> | HTMLCollectionOf<Element>;
		if (elem.startsWith('.')) {
			// Class selector
			elements = tempDiv.querySelectorAll(`[class*="${elem.slice(1)}"]`);
		} else if (elem.startsWith('#')) {
			// ID selector
			elements = tempDiv.querySelectorAll(`[id="${elem.slice(1)}"]`);
		} else {
			// Tag selector
			elements = tempDiv.getElementsByTagName(elem);
		}

		// Convert HTMLCollection to Array if necessary
		Array.from(elements).forEach(el => el.parentNode?.removeChild(el));
	});

	const result = tempDiv.innerHTML;
	debugLog('RemoveHTML', 'Output:', result);

	return result;
};