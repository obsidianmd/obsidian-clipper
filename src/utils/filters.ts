import { FilterFunction } from '../types/types';
import { debugLog } from './debug';
import { blockquote } from './filters/blockquote';
import { camel } from './filters/camel';
import { capitalize } from './filters/capitalize';
import { callout } from './filters/callout';
import { date } from './filters/date';
import { first } from './filters/first';
import { footnote } from './filters/footnote';
import { image } from './filters/image';
import { join } from './filters/join';
import { kebab } from './filters/kebab';
import { last } from './filters/last';
import { list } from './filters/list';
import { lower } from './filters/lower';
import { markdown } from './filters/markdown';
import { object } from './filters/object';
import { pascal } from './filters/pascal';
import { replace } from './filters/replace';
import { slice } from './filters/slice';
import { snake } from './filters/snake';
import { split } from './filters/split';
import { strip_attr } from './filters/strip_attr';
import { strip_md } from './filters/strip_md';
import { table } from './filters/table';
import { trim } from './filters/trim';
import { title } from './filters/title';
import { upper } from './filters/upper';
import { wikilink } from './filters/wikilink';
import { template } from './filters/template';
import { map } from './filters/map';
import { strip_tags } from './filters/strip_tags';

export const filters: { [key: string]: FilterFunction } = {
	blockquote,
	camel,
	capitalize,
	callout,
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
	slice,
	snake,
	split,
	strip_attr,
	strip_md,
	strip_tags,
	table,
	template,
	trim,
	title,
	upper,
	wikilink,
};

export function applyFilters(value: string | any[], filterNames: string[]): string {
	let processedValue = value;

	const result = filterNames.reduce((result, filterName) => {
		const [name, ...params] = parseFilterString(filterName);
		debugLog('Filters', `Applying filter: ${name}, Params:`, params);

		const filter = filters[name];
		if (filter) {
			const stringInput = typeof result === 'string' ? result : JSON.stringify(result);
			const output = filter(stringInput, params.length === 1 ? params[0] : params.join(','));
			
			debugLog('Filters', `Filter ${name} output:`, output);

			if (typeof output === 'string' && (output.startsWith('[') || output.startsWith('{'))) {
				try {
					return JSON.parse(output);
				} catch {
					return output;
				}
			}
			return output;
		} else {
			console.error(`Invalid filter: ${name}`);
			debugLog('Filters', `Available filters:`, Object.keys(filters));
			return result;
		}
	}, processedValue);

	return typeof result === 'string' ? result : JSON.stringify(result);
}

function parseFilterString(filterString: string): string[] {
	// Remove outer quotes if present
	filterString = filterString.replace(/^['"](.*)['"]$/, '$1');

	const parts: string[] = [];
	let current = '';
	let depth = 0;
	let inQuote = false;

	for (let i = 0; i < filterString.length; i++) {
		const char = filterString[i];

		if (char === '"' && filterString[i - 1] !== '\\') {
			inQuote = !inQuote;
		}

		if (!inQuote) {
			if (char === '(') depth++;
			if (char === ')') depth--;
		}

		if (char === ':' && depth === 0 && !inQuote && parts.length === 0) {
			parts.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}

	if (current) {
		parts.push(current.trim());
	}

	// If only one part, split it into name and parameters
	if (parts.length === 1) {
		const match = parts[0].match(/^(\w+)\s*\((.*)\)$/);
		if (match) {
			return [match[1], match[2]];
		}
	}

	return parts;
}