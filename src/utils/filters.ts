import dayjs from 'dayjs';

export type FilterFunction = (value: string, param?: string) => string;

export const filters: { [key: string]: FilterFunction } = {
	list: (str: string, param?: string) => {
		try {
			const arrayValue = JSON.parse(str);
			if (Array.isArray(arrayValue)) {
				const isOrdered = param === 'ordered';
				return arrayValue.map((item, index) => 
					isOrdered ? `${index + 1}. ${item}` : `- ${item}`
				).join('\n');
			}
		} catch (error) {
			console.error('Error parsing JSON for list filter:', error);
		}
		return str;
	},
	camel: (str: string) => str
		.replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) => 
			index === 0 ? letter.toLowerCase() : letter.toUpperCase()
		)
		.replace(/[\s_-]+/g, ''),
	kebab: (str: string) => str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.toLowerCase(),
	pascal: (str: string) => str
		.replace(/[\s_-]+(.)/g, (_, c) => c.toUpperCase())
		.replace(/^(.)/, c => c.toUpperCase()),
	snake: (str: string) => str
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.replace(/[\s-]+/g, '_')
		.toLowerCase(),
	wikilink: (str: string): string => {
		if (!str.trim()) {
			return '';
		}
		if (str.startsWith('[') && str.endsWith(']')) {
			try {
				const arrayValue = JSON.parse(str);
				if (Array.isArray(arrayValue)) {
					return arrayValue.map(item => item.trim() ? `[[${item}]]` : '').filter(Boolean).join(', ');
				}
			} catch (error) {
				console.error('wikilink error:', error);
			}
		}
		return `[[${str}]]`;
	},
	slice: (str: string, param?: string): string => {
		if (!param) {
			console.error('Slice filter requires parameters');
			return str;
		}

		const [start, end] = param.split(',').map(p => p.trim()).map(p => {
			if (p === '') return undefined;
			const num = parseInt(p, 10);
			return isNaN(num) ? undefined : num;
		});

		let value;
		try {
			value = JSON.parse(str);
		} catch (error) {
			console.error('Error parsing JSON in slice filter:', error);
			value = str;
		}

		if (Array.isArray(value)) {
			const slicedArray = value.slice(start, end);
			if (slicedArray.length === 1) {
				return slicedArray[0].toString();
			}
			return JSON.stringify(slicedArray);
		} else {
			const slicedString = str.slice(start, end);
			return slicedString;
		}
	},
	split: (str: string, param?: string): string => {
		if (!param) {
			console.error('Split filter requires a separator parameter');
			return JSON.stringify([str]);
		}

		// Remove quotes from the param if present
		param = param.replace(/^["']|["']$/g, '');

		// If param is a single character, use it directly
		const separator = param.length === 1 ? param : new RegExp(param);

		// Split operation
		const result = str.split(separator);

		return JSON.stringify(result);
	},
	join: (str: string, param?: string): string => {
		let array;
		try {
			array = JSON.parse(str);
		} catch (error) {
			console.error('Error parsing JSON in join filter:', error);
			return str;
		}

		if (Array.isArray(array)) {
			return array.join(param || ',');
		}
		return str;
	},
	date: (str: string, format?: string): string => {
		const date = dayjs(str);
		if (!date.isValid()) {
			console.error('Invalid date for date filter:', str);
			return str;
		}
		return format ? date.format(format) : date.format();
	},
	trim: (str: string): string => {
		return str.trim();
	},
	first: (str: string): string => {
		try {
			const array = JSON.parse(str);
			if (Array.isArray(array) && array.length > 0) {
				return array[0].toString();
			}
		} catch (error) {
			console.error('Error parsing JSON in first filter:', error);
		}
		return str;
	},
	last: (str: string): string => {
		try {
			const array = JSON.parse(str);
			if (Array.isArray(array) && array.length > 0) {
				return array[array.length - 1].toString();
			}
		} catch (error) {
			console.error('Error parsing JSON in last filter:', error);
		}
		return str;
	},
	capitalize: (str: string): string => {
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	},
	lower: (str: string): string => {
		return str.toLowerCase();
	},
	title: (str: string): string => {
		return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
	},
	upper: (str: string): string => {
		return str.toUpperCase();
	},
};

export function applyFilters(value: string, filterNames: string[]): string {
	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	const result = filterNames.reduce((result, filterName) => {
		const filterRegex = /(\w+)(?::(.+)|"(.+)")?/;
		const match = filterName.match(filterRegex);

		if (match) {
			const [, name, param1, param2] = match;
			const cleanParam = (param1 || param2) ? (param1 || param2).replace(/^["']|["']$/g, '') : undefined;

			const filter = filters[name];
			if (filter) {
				const output = filter(result, cleanParam);
				return output;
			}
		} else {
			console.error(`Invalid filter format: ${filterName}`);
		}

		return result;
	}, processedValue);

	return result;
}