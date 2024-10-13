import { applyFilters } from '../filters';

// Function to process a simple variable (without special prefixes)
export async function processSimpleVariable(variableString: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const [variablePath, ...filterParts] = variableString.split('|').map(part => part.trim());
	let value: any;

	// Check if it's a simple key or a nested path
	if (variablePath.includes('.') || variablePath.includes('[')) {
		value = getNestedValue(variables, variablePath);
	} else {
		// If it has curly braces
		value = variables[`{{${variablePath}}}`];
		// If not found, try without the curly braces
		if (value === undefined) {
			value = variables[variablePath];
		}
	}

	// Convert value to string, handling undefined and null
	const stringValue = value === undefined || value === null
		? ''
		: typeof value === 'object'
			? JSON.stringify(value)
			: String(value);

	const filtersString = filterParts.join('|');
	return applyFilters(stringValue, filtersString, currentUrl);
}

// Helper function to get nested value from an object
function getNestedValue(obj: any, path: string): any {
	const keys = path.split('.');
	return keys.reduce((value, key) => {
		if (value === undefined) return undefined;
		if (key.includes('[') && key.includes(']')) {
			const [arrayKey, indexStr] = key.split(/[\[\]]/);
			const index = parseInt(indexStr, 10);
			return value[arrayKey] && Array.isArray(value[arrayKey]) ? value[arrayKey][index] : undefined;
		}
		return value[key];
	}, obj);
}
