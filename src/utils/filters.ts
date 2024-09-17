import { FilterFunction } from '../types/types';
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

export function applyFilters(value: string | any[], filterNames: string[], url?: string): string {
	let processedValue = value;

	const result = filterNames.reduce((result, filterName) => {
		const [name, ...params] = filterName.split(':');
		const param = params.join(':'); // Rejoin in case the param contained colons

		const filter = filters[name];
		if (filter) {
			// Ensure the input to the filter is always a string
			const stringInput = typeof result === 'string' ? result : JSON.stringify(result);
			// Pass the URL to the markdown filter, use param for others
			const output = name === 'markdown' ? filter(stringInput, url) : filter(stringInput, param);
			
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
			console.error(`Invalid filter: ${name}`);
			return result;
		}
	}, processedValue);

	// Ensure the final result is always a string
	return typeof result === 'string' ? result : JSON.stringify(result);
}