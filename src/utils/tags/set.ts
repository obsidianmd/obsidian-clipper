import { processVariables } from '../template-compiler';
import { evaluateExpression } from '../expression-evaluator';

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

	// Handle expressions with filters (e.g., content|length, title|upper):
	// defer to variable processor, which returns a string
	if (expression.includes('|')) {
		// Create a temporary template to process the expression with filters
		const tempTemplate = `{{${expression}}}`;
		const processed = await processVariables(0, tempTemplate, variables, currentUrl);
		return processed;
	}

	// General expression evaluation (supports parentheses, comparisons, not/and/or)
	return await evaluateExpression(expression, variables, currentUrl);
}
