import { applyFilters } from '../filters';
import { resolveVariable, valueToString } from '../resolver';

// Function to process a simple variable (without special prefixes)
export async function processSimpleVariable(variableString: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const [variablePath, ...filterParts] = variableString.split('|').map(part => part.trim());

	// Use unified resolver for variable lookup
	const value = resolveVariable(variablePath, variables);

	// Convert to string for filter processing
	const stringValue = valueToString(value);

	const filtersString = filterParts.join('|');
	return applyFilters(stringValue, filtersString, currentUrl);
}
