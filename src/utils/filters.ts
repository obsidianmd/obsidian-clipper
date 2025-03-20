import { FilterFunction } from '../types/types';
import { debugLog } from './debug';
import { createParserState, processCharacter } from './parser-utils';

import { blockquote } from './filters/blockquote';
import { calc } from './filters/calc';
import { callout } from './filters/callout';
import { camel } from './filters/camel';
import { capitalize } from './filters/capitalize';
import { date } from './filters/date';
import { date_modify } from './filters/date_modify';
import { first } from './filters/first';
import { footnote } from './filters/footnote';
import { fragment_link } from './filters/fragment_link';
import { html_to_json } from './filters/html_to_json';
import { image } from './filters/image';
import { join } from './filters/join';
import { kebab } from './filters/kebab';
import { last } from './filters/last';
import { list } from './filters/list';
import { link } from './filters/link';
import { length } from './filters/length';
import { lower } from './filters/lower';
import { map } from './filters/map';
import { markdown } from './filters/markdown';
import { merge } from './filters/merge';
import { nth } from './filters/nth';
import { number_format } from './filters/number_format';
import { object } from './filters/object';
import { pascal } from './filters/pascal';
import { reverse } from './filters/reverse';
import { remove_attr } from './filters/remove_attr';
import { remove_html } from './filters/remove_html';
import { remove_tags } from './filters/remove_tags';
import { replace } from './filters/replace';
import { replace_tags } from './filters/replace_tags';
import { round } from './filters/round';
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
import { unique } from './filters/unique';
import { upper } from './filters/upper';
import { wikilink } from './filters/wikilink';
import { duration } from './filters/duration';

export const filters: { [key: string]: FilterFunction } = {
	blockquote,
	calc,
	callout,
	camel,
	capitalize,
	date_modify,
	date,
	duration,
	first,
	footnote,
	fragment_link,
	html_to_json,
	image,
	join,
	kebab,
	last,
	length,
	link,
	list,
	lower,
	map,
	markdown,
	merge,
	number_format,
	nth,
	object,
	pascal,
	reverse,
	remove_attr,
	remove_html,
	remove_tags,
	replace,
	replace_tags,
	round,
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
	unique,
	upper,
	wikilink
};

// Split individual filters
function splitFilterString(filterString: string): string[] {
	const filters: string[] = [];
	const state = createParserState();

	// Remove all spaces before and after | that are not within quotes or parentheses
	filterString = filterString.replace(/\s*\|\s*(?=(?:[^"'()]*["'][^"'()]*["'])*[^"'()]*$)/g, '|');

	// Iterate through each character in the filterString
	for (let i = 0; i < filterString.length; i++) {
		const char = filterString[i];

		// Split filters on pipe character when not in quotes, regex, or parentheses
		if (char === '|' && !state.inQuote && !state.inRegex && 
			state.curlyDepth === 0 && state.parenDepth === 0) {
			filters.push(state.current.trim());
			state.current = '';
		} else {
			// For any other character, add it to the current filter
			processCharacter(char, state);
		}
	}

	if (state.current) {
		filters.push(state.current.trim());
	}

	return filters;
}

// Parse the filter into name and parameters
function parseFilterString(filterString: string): string[] {
	const parts: string[] = [];
	const state = createParserState();

	// Iterate through each character in the filterString
	for (let i = 0; i < filterString.length; i++) {
		const char = filterString[i];

		if (char === ':' && !state.inQuote && !state.inRegex && 
			state.parenDepth === 0 && parts.length === 0) {
			parts.push(state.current.trim());
			state.current = '';
		} else {
			processCharacter(char, state);
		}
	}

	if (state.current) {
		parts.push(state.current.trim());
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

				// Special case for fragment filter: use currentUrl if no params provided
				if (name === 'fragment_link' && currentUrl) {
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
