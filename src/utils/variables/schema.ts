import { applyFilters } from '../filters';

function splitListString(str: string): string[] {
	return str
		// Split on numbered items (1. 2. etc) or bullet points (- * •)
		.split(/(?=\d+\.|[-*•]\s)/)
		.map(item => item
			// Remove list markers
			.replace(/^(?:\d+\.|[-*•])\s*/, '')
			.trim()
		)
		.filter(item => item.length > 0);
}

export async function processSchema(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const [, fullSchemaKey] = match.match(/{{schema:(.*?)}}/) || [];
	const [schemaKey, ...filterParts] = fullSchemaKey.split('|');
	const filtersString = filterParts.join('|');

	let schemaValue = '';

	// Check if we're dealing with a nested array access
	const nestedArrayMatch = schemaKey.match(/(.*?)\[(\*|\d+)\](.*)/);
	if (nestedArrayMatch) {
		const [, arrayKey, indexOrStar, propertyKey] = nestedArrayMatch;

		// Handle shorthand notation for nested arrays
		let fullArrayKey = arrayKey;
		if (!arrayKey.includes('@')) {
			const matchingKey = Object.keys(variables).find(key => key.includes('@') && key.endsWith(`:${arrayKey}}}`));
			if (matchingKey) {
				fullArrayKey = matchingKey.replace('{{schema:', '').replace('}}', '');
			}
		}

		try {
			const rawValue = variables[`{{schema:${fullArrayKey}}}`] || '[]';
			
			// Check if the raw value looks like any kind of list
			if (rawValue.trim().match(/^(?:\d+\.|[-*•]\s)/m)) {
				const list = splitListString(rawValue);
				if (indexOrStar === '*') {
					schemaValue = JSON.stringify(list);
				} else {
					const index = parseInt(indexOrStar, 10);
					schemaValue = list[index] || '';
				}
			} else {
				// Handle as JSON
				const arrayValue = JSON.parse(rawValue);
				if (Array.isArray(arrayValue)) {
					if (indexOrStar === '*') {
						schemaValue = JSON.stringify(arrayValue.map(item => getNestedProperty(item, propertyKey.slice(1))).filter(Boolean));
					} else {
						const index = parseInt(indexOrStar, 10);
						schemaValue = arrayValue[index] ? getNestedProperty(arrayValue[index], propertyKey.slice(1)) : '';
					}
				}
			}
		} catch (error) {
			console.error('Error processing schema array:', error);
			console.error('Raw value:', variables[`{{schema:${fullArrayKey}}}`]);
			return '';
		}
	} else {
		// Handle non-array schemas
		if (!schemaKey.includes('@')) {
			const matchingKey = Object.keys(variables).find(key => key.includes('@') && key.endsWith(`:${schemaKey}}}`));
			if (matchingKey) {
				schemaValue = variables[matchingKey];
			}
		}
		// If no matching shorthand found or it's a full key
		if (!schemaValue) {
			schemaValue = variables[`{{schema:${schemaKey}}}`] || '';
		}
	}

	return applyFilters(schemaValue, filtersString, currentUrl);
}

function getNestedProperty(obj: any, path: string): any {
	return path.split('.').reduce((prev, curr) => prev && prev[curr], obj);
}