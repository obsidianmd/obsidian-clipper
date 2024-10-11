import { applyFilters } from '../filters';

export async function processSchema(match: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const [, fullSchemaKey] = match.match(/{{schema:(.*?)}}/) || [];
	const [schemaKey, ...filterParts] = fullSchemaKey.split('|');
	const filtersString = filterParts.join('|');

	let schemaValue: any = variables[`{{schema:${schemaKey}}}`];

	if (schemaValue === undefined) {
		console.error(`Schema value not found for key: ${schemaKey}`);
		return match;
	}

	console.log(`Raw schema value for ${schemaKey}:`, schemaValue);

	if (typeof schemaValue === 'string') {
		try {
			schemaValue = JSON.parse(schemaValue);
		} catch (error) {
			console.error('Error parsing schema JSON:', error);
			console.log('Returning raw schema value');
			return applyFilters(schemaValue, filtersString, currentUrl);
		}
	}

	console.log(`Parsed schema value for ${schemaKey}:`, schemaValue);

	// If schemaValue is an object or array, stringify it
	if (typeof schemaValue === 'object') {
		schemaValue = JSON.stringify(schemaValue);
	}

	return applyFilters(schemaValue, filtersString, currentUrl);
}
