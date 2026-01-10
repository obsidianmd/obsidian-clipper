import { applyFilters } from '../filters';
import { resolveVariable, resolveVariableAsync, valueToString, ResolverContext } from '../resolver';
import { createParserState, processCharacter } from '../parser-utils';

// Process {% set variable = expression %} tags
export async function processSetStatement(
	tabId: number,
	match: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<string> {
	const [, variableName, expression] = match;

	// Evaluate the expression and assign to variables
	const value = await evaluateSetExpression(tabId, expression, variables, currentUrl);
	variables[variableName] = value;

	// Set tags produce no output
	return '';
}

// Evaluate an expression that may include filters
async function evaluateSetExpression(
	tabId: number,
	expression: string,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<any> {
	const trimmed = expression.trim();

	// Split by pipe to separate value from filters
	const parts = splitByPipe(trimmed);
	const valuePart = parts[0].trim();
	const filterParts = parts.slice(1);

	// Resolve the base value using the unified resolver
	// Use async resolver for selector support
	let value: any;
	if (valuePart.startsWith('selector:') || valuePart.startsWith('selectorHtml:')) {
		const context: ResolverContext = { variables, tabId };
		value = await resolveVariableAsync(valuePart, context);
	} else {
		value = resolveVariable(valuePart, variables);
	}

	// Apply filters if present
	if (filterParts.length > 0) {
		const filtersString = filterParts.join('|');
		const stringValue = valueToString(value);
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

// Split expression by pipe, respecting quotes and parentheses
// Uses shared parser-utils state machine
function splitByPipe(expression: string): string[] {
	const parts: string[] = [];
	const state = createParserState();

	for (let i = 0; i < expression.length; i++) {
		const char = expression[i];

		// Split on pipe when not in quotes, regex, or nested structures
		if (char === '|' && !state.inQuote && !state.inRegex &&
			state.curlyDepth === 0 && state.parenDepth === 0) {
			parts.push(state.current.trim());
			state.current = '';
		} else {
			processCharacter(char, state);
		}
	}

	if (state.current) {
		parts.push(state.current.trim());
	}

	return parts;
}
