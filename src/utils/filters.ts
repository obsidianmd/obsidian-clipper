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

		const [start, end] = param.split(',').map(p => parseInt(p.trim(), 10));
		if (isNaN(start)) {
			console.error('Invalid start parameter for slice filter');
			return str;
		}

		let arrayValue;
		try {
			arrayValue = JSON.parse(str);
		} catch (error) {
			arrayValue = str;
		}

		let result;
		if (Array.isArray(arrayValue)) {
			result = JSON.stringify(arrayValue.slice(start, isNaN(end) ? undefined : end));
		} else if (typeof arrayValue === 'string') {
			result = arrayValue.slice(start, isNaN(end) ? undefined : end);
		} else {
			result = str;
		}
		return result;
	},
};

export function applyFilters(value: string, filterNames: string[]): string {
	console.log('Applying filters. Initial value:', value);
	console.log('Filters to apply:', filterNames);

	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	return filterNames.reduce((result, filterName) => {
		const [name, param] = filterName.split(':');
		const filter = filters[name];
		const output = filter ? filter(result, param) : result;
		return output;
	}, processedValue);
}