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
import { stripmd } from './filters/stripmd';
import { table } from './filters/table';
import { trim } from './filters/trim';
import { title } from './filters/title';
import { upper } from './filters/upper';
import { wikilink } from './filters/wikilink';
import { template } from './filters/template';
import { map } from './filters/map';

import { FilterFunction } from '../types/filters';

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
	stripmd,
	table,
	template,
	trim,
	title,
	upper,
	wikilink
};

export function applyFilters(value: string, filterNames: string[], url?: string): string {
	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	const result = filterNames.reduce((result, filterName) => {
		const [name, ...params] = filterName.split(':');
		const param = params.join(':'); // Rejoin in case the param contained colons

		const filter = filters[name];
		if (filter) {
			// Pass the URL to the markdown filter, use param for others
			const output = name === 'markdown' ? filter(result, url) : filter(result, param);
			return output;
		} else {
			console.error(`Invalid filter: ${name}`);
			return result;
		}
	}, processedValue);

	return result;
}