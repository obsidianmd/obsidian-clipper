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
		
		// Check if the string is a valid JSON array
		if (str.startsWith('[') && str.endsWith(']')) {
			try {
				const value = JSON.parse(str);
				if (Array.isArray(value)) {
					const slicedArray = value.slice(start, end);
					return JSON.stringify(slicedArray);
				}
			} catch (error) {
				console.error('Error parsing JSON in slice filter:', error);
			}
		}

		// If it's not a JSON array or parsing failed, treat it as a regular string
		return str.slice(start, end);
	},
	split: (str: string, param?: string): string => {
		console.log('Split filter input:', str);
		console.log('Split filter param:', param);

		if (!param) {
			console.error('Split filter requires a separator parameter');
			return JSON.stringify([str]);
		}

		// Remove quotes from the param if present
		param = param.replace(/^["']|["']$/g, '');

		// Split the string, preserving the protocol
		const result = str.split(param);

		console.log('Split filter output:', result);
		return JSON.stringify(result);
	},
};

export function applyFilters(value: string, filterNames: string[]): string {
	console.log('applyFilters input:', value);
	console.log('applyFilters filterNames:', filterNames);

	// Ensure value is a string before applying filters
	let processedValue = typeof value === 'string' ? value : JSON.stringify(value);

	const result = filterNames.reduce((result, filterName) => {
		console.log(`Applying filter: ${filterName}`);
		console.log('Input to filter:', result);

		const [name, param] = filterName.split(':');
		const filter = filters[name];
		if (filter) {
			const output = filter(result, param);
			console.log('Filter output:', output);
			return Array.isArray(output) ? JSON.stringify(output) : output;
		}
		return result;
	}, processedValue);

	console.log('applyFilters final output:', result);
	return result;
}