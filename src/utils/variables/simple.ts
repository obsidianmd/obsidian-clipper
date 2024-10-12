import { applyFilters } from '../filters';

// Function to process a simple variable (without special prefixes)
export async function processSimpleVariable(variableString: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const [variableName, ...filterParts] = variableString.split('|').map(part => part.trim());
	let value = variables[`{{${variableName}}}`] || '';
	const filtersString = filterParts.join('|');
	return applyFilters(value, filtersString, currentUrl);
}