export type FilterFunction = (value: string, param?: string) => string;

export const filters: { [key: string]: FilterFunction } = {
	list: (str: string) => {
		try {
			const arrayValue = JSON.parse(str);
			if (Array.isArray(arrayValue)) {
				return arrayValue.map(item => `- ${item}`).join('\n');
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
		if (str.startsWith('[') && str.endsWith(']')) {
			try {
				const arrayValue = JSON.parse(str);
				if (Array.isArray(arrayValue)) {
					return arrayValue.map(item => `[[${item}]]`).join(', ');
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
			return JSON.stringify(slicedArray);
		} else {
			return str.slice(start, end);
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
};

export function applyFilters(value: string, filterNames: string[]): string {
	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	const result = filterNames.reduce((result, filterName) => {

		// Match filter name and parameters, including quoted parameters and no colon
		const filterRegex = /(\w+)(?::(.+)|"(.+)")?/;
		const match = filterName.match(filterRegex);

		if (match) {
			const [, name, param1, param2] = match;
			// Use param2 if param1 is undefined (case with no colon)
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