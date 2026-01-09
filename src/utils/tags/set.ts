import { applyFilters } from '../filters';
import { resolveValue } from '../expression-evaluator';

// Process {% set variable = expression %} tags
export async function processSetStatement(
	match: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<string> {
	const [, variableName, expression] = match;

	// Evaluate the expression and assign to variables
	const value = await evaluateSetExpression(expression, variables, currentUrl);
	variables[variableName] = value;

	// Set tags produce no output
	return '';
}

// Evaluate an expression that may include filters
async function evaluateSetExpression(
	expression: string,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<any> {
	const trimmed = expression.trim();

	// Split by pipe to separate value from filters
	// Need to be careful not to split inside quotes
	const parts = splitExpressionAndFilters(trimmed);
	const valuePart = parts[0].trim();
	const filterParts = parts.slice(1);

	// Resolve the base value using the expression evaluator
	// This handles literals, variables with {{}} wrapper, and nested paths
	let value = resolveValue(valuePart, { variables });

	// Apply filters if present
	if (filterParts.length > 0) {
		const filtersString = filterParts.join('|');
		const stringValue = value === undefined || value === null
			? ''
			: typeof value === 'object'
				? JSON.stringify(value)
				: String(value);
		const filtered = applyFilters(stringValue, filtersString, currentUrl);

		// Try to parse back to original type if it looks like JSON
		try {
			return JSON.parse(filtered);
		} catch {
			return filtered;
		}
	}

	return value;
}

// Split expression into value and filter parts, respecting quotes
function splitExpressionAndFilters(expression: string): string[] {
	const parts: string[] = [];
	let current = '';
	let inQuote = false;
	let quoteChar = '';
	let parenDepth = 0;

	for (let i = 0; i < expression.length; i++) {
		const char = expression[i];
		const prevChar = i > 0 ? expression[i - 1] : '';

		// Handle escape sequences
		if (prevChar === '\\') {
			current += char;
			continue;
		}

		// Track quotes
		if ((char === '"' || char === "'") && !inQuote) {
			inQuote = true;
			quoteChar = char;
			current += char;
			continue;
		}
		if (char === quoteChar && inQuote) {
			inQuote = false;
			quoteChar = '';
			current += char;
			continue;
		}

		// Track parentheses
		if (char === '(' && !inQuote) parenDepth++;
		if (char === ')' && !inQuote) parenDepth--;

		// Split on pipe when not in quotes or parentheses
		if (char === '|' && !inQuote && parenDepth === 0) {
			parts.push(current);
			current = '';
			continue;
		}

		current += char;
	}

	if (current) {
		parts.push(current);
	}

	return parts;
}
