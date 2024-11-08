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
	// Find matching schema based on type if specified
	const matchingKey = findMatchingSchemaKey(variables, type, propertyPath);
	if (!matchingKey) return '';

	try {
		const value = JSON.parse(variables[matchingKey]);
		return extractValueFromPath(value, propertyPath) || '';
	} catch (error) {
		console.error('Error processing schema value:', error);
		return variables[matchingKey] || '';
	}
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

		return extractValueFromPath(matchingItem, propertyPath) || '';
	} catch (error) {
		console.error('Error processing @graph data:', error);
		return '';
	}
}

function extractValueFromPath(obj: any, path: string): string {
	try {
		const parts = path.split('.');
		let current = obj;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const arrayMatch = part.match(/^(.*?)\[(\*|\d+)\]$/);

			if (arrayMatch) {
				const [, arrayKey, indexOrStar] = arrayMatch;
				const array = arrayKey ? current[arrayKey] : current;

				if (!Array.isArray(array)) return '';

				if (indexOrStar === '*') {
					// Get remaining path parts
					const remainingPath = parts.slice(i + 1).join('.');
					if (!remainingPath) {
						return JSON.stringify(array);
					}
					// Map remaining path over array items
					const results = array.map(item => {
						try {
							return extractValueFromPath(item, remainingPath);
						} catch {
							return null;
						}
					}).filter(Boolean);
					return JSON.stringify(results);
				} else {
					const index = parseInt(indexOrStar, 10);
					if (!array[index]) return '';
					current = array[index];
				}
			} else {
				if (!current[part]) return '';
				current = current[part];
			}
		}

		if (typeof current === 'object') {
			return JSON.stringify(current);
		}
		return String(current);
	} catch (error) {
		console.error('Error extracting value from path:', error);
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
				
				// For array paths, check the base property
				const basePath = propertyPath.split('[')[0];
				return matchesType && hasProperty(value, basePath);
			} else {
				// For array paths, check the base property
				const basePath = propertyPath.split('[')[0];
				return hasProperty(value, basePath);
			}
		} catch {
			return false;
		}
	}) || '';
}

function hasProperty(obj: any, path: string): boolean {
	if (!path) return true;
	try {
		return path.split('.').reduce((prev, curr) => prev && prev[curr], obj) !== undefined;
	} catch {
		return false;
	}
}