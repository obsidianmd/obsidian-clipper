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

		const [start, end] = param.split(',').map(p => p.trim()).map(p => p === '' ? undefined : parseInt(p, 10));
		if (start === undefined || (start !== undefined && isNaN(start))) {
			console.error('Invalid start parameter for slice filter');
			return str;
		}
		// Check if the string is a valid JSON array
		if (str.startsWith('[') && str.endsWith(']')) {
			try {
				const value = JSON.parse(str);
				if (Array.isArray(value)) {
					const result = JSON.stringify(value.slice(start, end));
					return result;
				}
			} catch (error) {
			}
		}

		// If it's not a JSON array or parsing failed, treat it as a regular string
		const result = str.slice(start, end);
		return result;
	},
};

export function applyFilters(value: string, filterNames: string[]): string {
	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	return filterNames.reduce((result, filterName) => {
		const [name, param] = filterName.split(':');
		const filter = filters[name];
		const output = filter ? filter(result, param) : result;
		return output;
	}, processedValue);
}