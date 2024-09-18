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
import { image } from './filters/image';
import { join } from './filters/join';
import { kebab } from './filters/kebab';
import { last } from './filters/last';
import { list } from './filters/list';
import { lower } from './filters/lower';
import { map } from './filters/map';
import { markdown } from './filters/markdown';
import { object } from './filters/object';
import { pascal } from './filters/pascal';
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
import { upper } from './filters/upper';
import { wikilink } from './filters/wikilink';

export const filters: { [key: string]: FilterFunction } = {
	blockquote,
	callout,
	camel,
	capitalize,
	date_modify,
	date,
	first,
	footnote,
	image,
	join,
	kebab,
	last,
	list,
	lower,
	map,
	markdown,
	object,
	pascal,
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
	upper,
	wikilink
};

function parseFilterString(filterString: string): string[] {
	// Remove outer quotes if present
	filterString = filterString.replace(/^['"](.*)['"]$/, '$1');

	const parts: string[] = [];
	let current = '';
	let depth = 0;
	let inQuote = false;

	// Iterate through each character in the filterString
	for (let i = 0; i < filterString.length; i++) {
		const char = filterString[i];

		// Toggle quote state if we encounter an unescaped quote
		if (char === '"' && filterString[i - 1] !== '\\') {
			inQuote = !inQuote;
		}

		// Track parentheses depth when not inside quotes
		if (!inQuote) {
			if (char === '(') depth++;
			if (char === ')') depth--;
		}

		// If we encounter a colon at depth 0 and not in quotes, and it's the first colon
		if (char === ':' && depth === 0 && !inQuote && parts.length === 0) {
			// Add the current accumulated string as a part (filter name)
			parts.push(current.trim());
			current = ''; // Reset current
		} else {
			// Otherwise, add the character to the current string
			current += char;
		}
	}

	// Add any remaining characters as the last part
	if (current) {
		parts.push(current.trim());
	}

	// If we have parameters, split them by the pipe character
	if (parts.length > 1) {
		const [filterName, ...params] = parts;
		const splitParams = params.join(':').split('|').map(param => param.trim());
		return [filterName, ...splitParams];
	}

	// If only one part is found, check if it's a function-like syntax
	if (parts.length === 1) {
		const match = parts[0].match(/^(\w+)\s*\((.*)\)$/);
		if (match) {
			// If it matches, split the parameters by pipe and return
			const params = match[2].split('|').map(param => param.trim());
			return [match[1], ...params];
		}
	}

	return parts;
}

export function applyFilters(value: string | any[], filterString: string, currentUrl?: string): string {
	let processedValue = value;

	// Split the filter string into individual filter names
	const filterNames = filterString.split('|').filter(Boolean);

	// Reduce through all filter names, applying each filter sequentially
	const result = filterNames.reduce((result, filterName) => {
			// Parse the filter string into name and parameters
			const [name, ...params] = parseFilterString(filterName);
			debugLog('Filters', `Applying filter: ${name}, Params:`, params);

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
				const output = filter(stringInput, ...params);
				
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