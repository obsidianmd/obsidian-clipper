import { processSchema } from '../variables/schema';
import { processVariables } from '../template-compiler';

export async function processVariableAssignment(
	match: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<void> {
	const [fullMatch, variableName, valueExpression] = match;

	console.log(`Setting variable: ${variableName} = ${valueExpression}`);

	try {
		// Evaluate the value expression
		const value = await evaluateAssignmentValue(valueExpression.trim(), variables, currentUrl);

		// Set the variable in the variables object
		variables[variableName] = value;

		console.log(`Variable ${variableName} set to:`, value);
	} catch (error) {
		console.error(`Error setting variable ${variableName}:`, error);
		// Set to undefined if evaluation fails
		variables[variableName] = undefined;
	}
}

async function evaluateAssignmentValue(
	expression: string,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<any> {
	expression = expression.trim();

	// Handle quoted strings
	if ((expression.startsWith('"') && expression.endsWith('"')) ||
		(expression.startsWith("'") && expression.endsWith("'"))) {
		return expression.slice(1, -1);
	}

	// Handle numbers
	if (!isNaN(Number(expression))) {
		return Number(expression);
	}

	// Handle boolean literals
	if (expression === 'true') return true;
	if (expression === 'false') return false;

	// Handle schema variables
	if (expression.startsWith('schema:')) {
		const schemaValue = await processSchema(`{{${expression}}}`, variables, currentUrl);
		try {
			return JSON.parse(schemaValue);
		} catch (error) {
			console.error(`Error parsing schema result for ${expression}:`, error);
			return null;
		}
	}

	// Handle expressions with filters (e.g., content|length, title|upper)
	if (expression.includes('|')) {
		// Create a temporary template to process the expression with filters
		const tempTemplate = `{{${expression}}}`;
		const processed = await processVariables(0, tempTemplate, variables, currentUrl);
		return processed;
	}

	// Handle nested properties like "variable.property"
	if (expression.includes('.')) {
		const value = expression.split('.').reduce((obj: any, key: string) => {
			if (obj && typeof obj === 'object' && key in obj) {
				return obj[key];
			}
			console.error(`Cannot access property ${key} of`, obj);
			return undefined;
		}, variables);
		return value;
	}

	// Handle simple variable references
	if (variables.hasOwnProperty(expression)) {
		return variables[expression];
	}

	// If nothing matches, return the expression as a string literal
	console.warn(`Treating "${expression}" as string literal in assignment`);
	return expression;
}
