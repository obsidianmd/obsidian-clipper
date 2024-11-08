import { applyFilters } from '../filters';

export async function processSchema(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const [, fullSchemaKey] = match.match(/{{schema:(.*?)}}/) || [];
	const [schemaKey, ...filterParts] = fullSchemaKey.split('|');
	const filtersString = filterParts.join('|');

	let schemaValue = '';

	// Parse the schema key to handle @Type format
	const typeMatch = schemaKey.match(/^@([^:]+):(.+)$/);
	const isTyped = !!typeMatch;
	const type = typeMatch ? typeMatch[1] : '';
	const propertyPath = typeMatch ? typeMatch[2] : schemaKey;

	// First try to get the value directly
	schemaValue = getSchemaValue(variables, type, propertyPath);

	// If no value found, try to find it in @graph
	if (!schemaValue) {
		schemaValue = getGraphValue(variables, type, propertyPath);
	}

	return applyFilters(schemaValue, filtersString, currentUrl);
}

function getSchemaValue(variables: { [key: string]: string }, type: string, propertyPath: string): string {
	// Check if we're dealing with a nested array access
	const nestedArrayMatch = propertyPath.match(/(.*?)\[(\*|\d+)\](.*)/);
	if (nestedArrayMatch) {
		const [, arrayKey, indexOrStar, remainingPath] = nestedArrayMatch;

		// Find matching schema based on type if specified
		const matchingKey = findMatchingSchemaKey(variables, type, arrayKey);
		if (!matchingKey) return '';

		try {
			const arrayValue = JSON.parse(variables[matchingKey] || '[]');
			if (Array.isArray(arrayValue)) {
				if (indexOrStar === '*') {
					return JSON.stringify(arrayValue.map(item => getNestedProperty(item, remainingPath.slice(1))).filter(Boolean));
				} else {
					const index = parseInt(indexOrStar, 10);
					return arrayValue[index] ? getNestedProperty(arrayValue[index], remainingPath.slice(1)) : '';
				}
			}
		} catch (error) {
			console.error('Error processing array schema:', error);
			return '';
		}
	} else {
		// Find matching schema based on type if specified
		const matchingKey = findMatchingSchemaKey(variables, type, propertyPath);
		if (matchingKey) {
			try {
				const value = JSON.parse(variables[matchingKey]);
				return getNestedProperty(value, propertyPath) || variables[matchingKey] || '';
			} catch {
				return variables[matchingKey] || '';
			}
		}
	}
	return '';
}

function getGraphValue(variables: { [key: string]: string }, type: string, propertyPath: string): string {
	// Look for @graph data in the variables
	const graphData = Object.entries(variables).find(([key, value]) => {
		try {
			const parsed = JSON.parse(value);
			return parsed['@graph'] && Array.isArray(parsed['@graph']);
		} catch {
			return false;
		}
	});

	if (!graphData) return '';

	try {
		const [, graphJson] = graphData;
		const parsed = JSON.parse(graphJson);
		const graphItems = parsed['@graph'];

		// Find the first item that matches the desired type
		const matchingItem = graphItems.find((item: any) => {
			if (!type) return true; // If no type specified, match first item
			if (typeof item['@type'] === 'string') {
				return item['@type'] === type;
			} else if (Array.isArray(item['@type'])) {
				return item['@type'].includes(type);
			}
			return false;
		});

		if (!matchingItem) return '';

		// Handle array access in property path
		const nestedArrayMatch = propertyPath.match(/(.*?)\[(\*|\d+)\](.*)/);
		if (nestedArrayMatch) {
			const [, arrayKey, indexOrStar, remainingPath] = nestedArrayMatch;
			const arrayValue = getNestedProperty(matchingItem, arrayKey);
			
			if (Array.isArray(arrayValue)) {
				if (indexOrStar === '*') {
					return JSON.stringify(arrayValue.map(item => getNestedProperty(item, remainingPath.slice(1))).filter(Boolean));
				} else {
					const index = parseInt(indexOrStar, 10);
					return arrayValue[index] ? getNestedProperty(arrayValue[index], remainingPath.slice(1)) : '';
				}
			}
		}

		// Get the nested property
		return getNestedProperty(matchingItem, propertyPath) || '';
	} catch (error) {
		console.error('Error processing @graph data:', error);
		return '';
	}
}

function findMatchingSchemaKey(variables: { [key: string]: string }, type: string, propertyPath: string): string {
	if (type) {
		// If type is specified, look for exact match first
		const exactKey = `{{schema:@${type}:${propertyPath}}}`;
		if (variables[exactKey]) return exactKey;
	}

	// Look for matching key based on type and property
	return Object.keys(variables).find(key => {
		if (!key.startsWith('{{schema:')) return false;
		
		try {
			const value = JSON.parse(variables[key]);
			if (type) {
				// If type is specified, check if it matches
				const itemType = value['@type'];
				const matchesType = typeof itemType === 'string' 
					? itemType === type 
					: Array.isArray(itemType) && itemType.includes(type);
				
				return matchesType && hasProperty(value, propertyPath);
			} else {
				// If no type specified, just check if property exists
				return hasProperty(value, propertyPath);
			}
		} catch {
			return false;
		}
	}) || '';
}

function hasProperty(obj: any, path: string): boolean {
	try {
		return getNestedProperty(obj, path) !== undefined;
	} catch {
		return false;
	}
}

function getNestedProperty(obj: any, path: string): any {
	if (!path) return obj;
	return path.split('.').reduce((prev, curr) => prev && prev[curr], obj);
}