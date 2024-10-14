import { FilterFunction } from '../types/types';
import { debugLog } from './debug';

import { blockquote } from './filters/blockquote';
import { callout } from './filters/callout';
import { camel } from './filters/camel';
import { capitalize } from './filters/capitalize';
import { date } from './filters/date';
import { date_modify } from './filters/date_modify';
import { first } from './filters/first';
import { footnote } from './filters/footnote';
import { html_to_json } from './filters/html_to_json';
import { image } from './filters/image';
import { join } from './filters/join';
import { kebab } from './filters/kebab';
import { last } from './filters/last';
import { list } from './filters/list';
import { link } from './filters/link';
import { lower } from './filters/lower';
import { map } from './filters/map';
import { markdown } from './filters/markdown';
import { object } from './filters/object';
import { pascal } from './filters/pascal';
import { remove_html } from './filters/remove_html';
import { replace } from './filters/replace';
import { safe_name } from './filters/safe_name';
import { slice } from './filters/slice';
import { snake } from './filters/snake';
import { split } from './filters/split';
import { strip_attr } from './filters/strip_attr';
import { strip_md } from './filters/strip_md';
import { strip_tags } from './filters/strip_tags';
import { table } from './filters/table';
import { template } from './filters/template';
import { title } from './filters/title';
import { trim } from './filters/trim';
import { uncamel } from './filters/uncamel';
import { unescape } from './filters/unescape';
import { upper } from './filters/upper';
import { wikilink } from './filters/wikilink';
import { fragment } from './filters/fragment';

export const filters: { [key: string]: FilterFunction } = {
	blockquote,
	callout,
	camel,
	capitalize,
	date_modify,
	date,
	first,
	footnote,
	html_to_json,
	image,
	join,
	kebab,
	last,
	link,
	list,
	lower,
	map,
	markdown,
	object,
	pascal,
	remove_html,
	replace,
	safe_name,
	slice,
	snake,
	split,
	strip_attr,
	strip_md,
	strip_tags,
	stripmd: strip_md, // an alias for strip_md
	table,
	template,
	title,
	trim,
	uncamel,
	unescape,
	upper,
	wikilink,
	fragment
};

// Split the individual filter names
function splitFilterString(filterString: string): string[] {
	const filters: string[] = [];
	let current = '';
	let inQuote = false;
	let quoteType = '';
	let escapeNext = false;
	let depth = 0;

	// Remove all spaces before and after | that are not within quotes or parentheses
	filterString = filterString.replace(/\s*\|\s*(?=(?:[^"'()]*["'][^"'()]*["'])*[^"'()]*$)/g, '|');

	// Iterate through each character in the filterString
	for (let i = 0; i < filterString.length; i++) {
		const char = filterString[i];

		if (escapeNext) {
			// If the previous character was a backslash, add this character as-is
			current += char;
			escapeNext = false;
		} else if (char === '\\') {
			// If this is a backslash, set escapeNext flag to true
			current += char;
			escapeNext = true;
		} else if ((char === '"' || char === "'") && !escapeNext) {
			// If this is an unescaped quote, toggle the inQuote flag
			if (!inQuote) {
				inQuote = true;
				quoteType = char;
			} else if (char === quoteType) {
				inQuote = false;
				quoteType = '';
			}
			current += char;
		} else if (char === '(' && !inQuote) {
			// If this is an opening parenthesis outside of quotes, increase depth
			current += char;
			depth++;
		} else if (char === ')' && !inQuote) {
			// If this is a closing parenthesis outside of quotes, decrease depth
			current += char;
			depth--;
		} else if (char === '|' && !inQuote && depth === 0) {
			// If this is a pipe character outside of quotes and parentheses,
			// it's a filter separator. Add the current filter and reset.
			filters.push(current.trim());
			current = '';
		} else {
			// For any other character, simply add it to the current filter
			current += char;
		}
	}

	// Add the last filter if there's anything left in current
	if (current) {
		filters.push(current.trim());
	}

	return filters;
}

// Parse the filter into name and parameters
function parseFilterString(filterString: string): string[] {
	// Remove outer quotes if present (both single and double quotes)
	filterString = filterString.replace(/^(['"])(.*)\1$/, '$2');

	// Remove all spaces before and after : that are not within quotes or parentheses
	filterString = filterString.replace(/\s*:\s*(?=(?:[^"'()]*["'][^"'()]*["'])*[^"'()]*$)/g, ':');

	const parts: string[] = [];
	let current = '';
	let depth = 0;
	let inQuote = false;
	let quoteType = '';
	let escapeNext = false;

	// Iterate through each character in the filterString
	for (let i = 0; i < filterString.length; i++) {
		const char = filterString[i];

		if (escapeNext) {
			current += char;
			escapeNext = false;
		} else if (char === '\\') {
			current += char;
			escapeNext = true;
		} else if ((char === '"' || char === "'") && !escapeNext) {
			if (!inQuote) {
				inQuote = true;
				quoteType = char;
			} else if (char === quoteType) {
				inQuote = false;
				quoteType = '';
			}
			current += char;
		} else if (!inQuote) {
			if (char === '(') depth++;
			if (char === ')') depth--;
			
			if (char === ':' && depth === 0 && parts.length === 0) {
				parts.push(current.trim());
				current = '';
			} else {
				current += char;
			}
		} else {
			current += char;
		}
	}

	if (current) {
		parts.push(current.trim());
	}

	// Special handling for replace filter
	if (parts[0] === 'replace' && parts.length > 1) {
		const replacePart = parts.slice(1).join(':');
		// Check if it's wrapped in parentheses and remove them if so
		const cleanedReplacePart = replacePart.replace(/^\((.*)\)$/, '$1');
		return [parts[0], cleanedReplacePart];
	}

	return parts;
}

export function applyFilters(value: string | any[], filterString: string, currentUrl?: string): string {
	debugLog('Filters', 'applyFilters called with:', { value, filterString, currentUrl });

	if (!filterString) {
		debugLog('Filters', 'Empty filter string, returning original value');
		return typeof value === 'string' ? value : JSON.stringify(value);
	}

	let processedValue = value;

	// Split the filter string into individual filter names, accounting for escaped pipes and quotes
	const filterNames = splitFilterString(filterString);
	debugLog('Filters', 'Split filter string:', filterNames);

	// Reduce through all filter names, applying each filter sequentially
	const result = filterNames.reduce((result, filterName) => {
			// Parse the filter string into name and parameters
			const [name, ...params] = parseFilterString(filterName);
			debugLog('Filters', `Parsed filter: ${name}, Params:`, params);

			// Get the filter function from the filters object
			const filter = filters[name];
			if (filter) {
				// Convert the input to a string if it's not already
				const stringInput = typeof result === 'string' ? result : JSON.stringify(result);
				
				// Special case for markdown filter: use currentUrl if no params provided
				if (name === 'markdown' && params.length === 0 && currentUrl) {
					params.push(currentUrl);
				}
				
				// Apply the filter and get the output
				const output = filter(stringInput, params.join(':'));
				
				debugLog('Filters', `Filter ${name} output:`, output);

				// If the output is a string that looks like JSON, try to parse it
				if (typeof output === 'string' && (output.startsWith('[') || output.startsWith('{'))) {
					try {
						return JSON.parse(output);
					} catch {
						return output;
					}
				}
				return output;
			} else {
				// If the filter doesn't exist, log an error and return the unmodified result
				console.error(`Invalid filter: ${name}`);
				debugLog('Filters', `Available filters:`, Object.keys(filters));
				return result;
			}
		}, processedValue);

	// Ensure the final result is a string
	return typeof result === 'string' ? result : JSON.stringify(result);
}
