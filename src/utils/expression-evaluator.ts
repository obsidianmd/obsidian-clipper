// Expression evaluator for template conditionals
// Supports comparison operators (==, !=, >, <, >=, <=, contains)
// and logical operators (and/&&, or/||, not/!)

export interface EvaluationContext {
	variables: { [key: string]: any };
}

type ComparisonOperator = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';

// Token types for parsing
type TokenType = 'value' | 'comparison' | 'and' | 'or' | 'not' | 'lparen' | 'rparen';

interface Token {
	type: TokenType;
	value: string;
}

// Main entry point: evaluate a condition string
export function evaluateCondition(condition: string, context: EvaluationContext): boolean {
	const trimmed = condition.trim();
	if (!trimmed) return false;

	try {
		const tokens = tokenize(trimmed);
		const result = parseExpression(tokens, context);
		return evaluateTruthiness(result);
	} catch (error) {
		console.error(`Error evaluating condition "${condition}":`, error);
		return false;
	}
}

// Tokenize the condition string
function tokenize(condition: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < condition.length) {
		// Skip whitespace
		if (/\s/.test(condition[i])) {
			i++;
			continue;
		}

		// Parentheses
		if (condition[i] === '(') {
			tokens.push({ type: 'lparen', value: '(' });
			i++;
			continue;
		}
		if (condition[i] === ')') {
			tokens.push({ type: 'rparen', value: ')' });
			i++;
			continue;
		}

		// Comparison operators (must check multi-char first)
		if (condition.slice(i, i + 2) === '==' ||
			condition.slice(i, i + 2) === '!=' ||
			condition.slice(i, i + 2) === '>=' ||
			condition.slice(i, i + 2) === '<=') {
			tokens.push({ type: 'comparison', value: condition.slice(i, i + 2) });
			i += 2;
			continue;
		}
		if (condition[i] === '>' || condition[i] === '<') {
			tokens.push({ type: 'comparison', value: condition[i] });
			i++;
			continue;
		}

		// Logical operators (symbolic)
		if (condition.slice(i, i + 2) === '&&') {
			tokens.push({ type: 'and', value: '&&' });
			i += 2;
			continue;
		}
		if (condition.slice(i, i + 2) === '||') {
			tokens.push({ type: 'or', value: '||' });
			i += 2;
			continue;
		}
		if (condition[i] === '!' && condition[i + 1] !== '=') {
			tokens.push({ type: 'not', value: '!' });
			i++;
			continue;
		}

		// String literals (single or double quotes)
		if (condition[i] === '"' || condition[i] === "'") {
			const quote = condition[i];
			let value = quote;
			i++;
			while (i < condition.length && condition[i] !== quote) {
				if (condition[i] === '\\' && i + 1 < condition.length) {
					value += condition[i] + condition[i + 1];
					i += 2;
				} else {
					value += condition[i];
					i++;
				}
			}
			value += quote;
			i++; // Skip closing quote
			tokens.push({ type: 'value', value });
			continue;
		}

		// Words (variables, keywords, numbers)
		let word = '';
		while (i < condition.length &&
			   /[a-zA-Z0-9_.\[\]\-]/.test(condition[i])) {
			word += condition[i];
			i++;
		}

		if (word) {
			// Check for keyword operators
			const lowerWord = word.toLowerCase();
			if (lowerWord === 'and') {
				tokens.push({ type: 'and', value: 'and' });
			} else if (lowerWord === 'or') {
				tokens.push({ type: 'or', value: 'or' });
			} else if (lowerWord === 'not') {
				tokens.push({ type: 'not', value: 'not' });
			} else if (lowerWord === 'contains') {
				tokens.push({ type: 'comparison', value: 'contains' });
			} else {
				tokens.push({ type: 'value', value: word });
			}
			continue;
		}

		// Unknown character, skip
		i++;
	}

	return tokens;
}

// Parse expression with operator precedence
// Precedence (lowest to highest): or, and, not, comparison, value
function parseExpression(tokens: Token[], context: EvaluationContext): any {
	return parseOr(tokens, context, { index: 0 });
}

interface ParseState {
	index: number;
}

function parseOr(tokens: Token[], context: EvaluationContext, state: ParseState): any {
	let left = parseAnd(tokens, context, state);

	while (state.index < tokens.length && tokens[state.index]?.type === 'or') {
		state.index++; // consume 'or'
		const right = parseAnd(tokens, context, state);
		left = evaluateTruthiness(left) || evaluateTruthiness(right);
	}

	return left;
}

function parseAnd(tokens: Token[], context: EvaluationContext, state: ParseState): any {
	let left = parseNot(tokens, context, state);

	while (state.index < tokens.length && tokens[state.index]?.type === 'and') {
		state.index++; // consume 'and'
		const right = parseNot(tokens, context, state);
		left = evaluateTruthiness(left) && evaluateTruthiness(right);
	}

	return left;
}

function parseNot(tokens: Token[], context: EvaluationContext, state: ParseState): any {
	if (state.index < tokens.length && tokens[state.index]?.type === 'not') {
		state.index++; // consume 'not'
		const value = parseNot(tokens, context, state);
		return !evaluateTruthiness(value);
	}

	return parseComparison(tokens, context, state);
}

function parseComparison(tokens: Token[], context: EvaluationContext, state: ParseState): any {
	const left = parsePrimary(tokens, context, state);

	if (state.index < tokens.length && tokens[state.index]?.type === 'comparison') {
		const operator = tokens[state.index].value as ComparisonOperator;
		state.index++; // consume operator
		const right = parsePrimary(tokens, context, state);
		return compareValues(left, operator, right);
	}

	return left;
}

function parsePrimary(tokens: Token[], context: EvaluationContext, state: ParseState): any {
	const token = tokens[state.index];

	if (!token) {
		return undefined;
	}

	// Parenthesized expression
	if (token.type === 'lparen') {
		state.index++; // consume '('
		const result = parseOr(tokens, context, state);
		if (tokens[state.index]?.type === 'rparen') {
			state.index++; // consume ')'
		}
		return result;
	}

	// Value
	if (token.type === 'value') {
		state.index++;
		return resolveValue(token.value, context);
	}

	return undefined;
}

// Resolve a value token to its actual value
export function resolveValue(operand: string, context: EvaluationContext): any {
	const trimmed = operand.trim();

	// String literal (single or double quotes)
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		// Handle escape sequences
		return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
	}

	// Number literal
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
		return parseFloat(trimmed);
	}

	// Boolean literal
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;

	// Null/undefined literal
	if (trimmed === 'null') return null;
	if (trimmed === 'undefined') return undefined;

	// Variable reference - resolve from context

	// Handle schema: prefix - look up as {{schema:key}}
	if (trimmed.startsWith('schema:')) {
		const schemaKey = trimmed; // e.g., "schema:@type" or "schema:author"

		// Try direct lookup first
		let value = context.variables[`{{${schemaKey}}}`];
		if (value !== undefined) {
			return value;
		}

		// Try shorthand notation (without @type prefix)
		// e.g., schema:author might be stored as {{schema:Article:author}}
		const shortKey = schemaKey.replace('schema:', '');
		if (!shortKey.includes('@')) {
			const matchingKey = Object.keys(context.variables).find(key =>
				key.includes('@') && key.endsWith(`:${shortKey}}}`));
			if (matchingKey) {
				return context.variables[matchingKey];
			}
		}

		return undefined;
	}

	// Try with {{}} wrapper first (how variables are stored), then plain key
	if (!trimmed.includes('.') && !trimmed.includes('[')) {
		const wrappedValue = context.variables[`{{${trimmed}}}`];
		if (wrappedValue !== undefined) {
			return wrappedValue;
		}
	}

	return getNestedValue(context.variables, trimmed);
}

// Get nested value from object using dot notation and bracket notation
export function getNestedValue(obj: any, path: string): any {
	if (!path) return undefined;

	const keys = path.split('.');
	return keys.reduce((value, key) => {
		if (value === undefined || value === null) return undefined;

		// Handle bracket notation for array access
		if (key.includes('[') && key.includes(']')) {
			const match = key.match(/^([^\[]*)\[([^\]]+)\]/);
			if (match) {
				const [, arrayKey, indexStr] = match;
				const baseValue = arrayKey ? value[arrayKey] : value;
				if (Array.isArray(baseValue)) {
					const index = parseInt(indexStr, 10);
					return baseValue[index];
				}
				return undefined;
			}
		}

		return value[key];
	}, obj);
}

// Compare two values with the given operator
export function compareValues(left: any, operator: ComparisonOperator, right: any): boolean {
	// Handle contains separately since it has different null handling
	if (operator === 'contains') {
		if (left === undefined || left === null) return false;
		if (right === undefined || right === null) return false;

		// Array contains
		if (Array.isArray(left)) {
			return left.some(item => {
				if (typeof item === 'string' && typeof right === 'string') {
					return item.toLowerCase() === right.toLowerCase();
				}
				return item == right;
			});
		}

		// String contains (case-insensitive)
		if (typeof left === 'string') {
			const searchValue = typeof right === 'string' ? right : String(right);
			return left.toLowerCase().includes(searchValue.toLowerCase());
		}

		return false;
	}

	// Handle null/undefined for other operators
	const l = left === undefined || left === null ? '' : left;
	const r = right === undefined || right === null ? '' : right;

	switch (operator) {
		case '==': return l == r;  // Loose equality for type coercion
		case '!=': return l != r;
		case '>':  return l > r;
		case '<':  return l < r;
		case '>=': return l >= r;
		case '<=': return l <= r;
		default: return false;
	}
}

// Evaluate truthiness of a value
export function evaluateTruthiness(value: any): boolean {
	if (value === undefined || value === null) return false;
	if (value === '') return false;
	if (value === 0) return false;
	if (value === false) return false;
	if (Array.isArray(value) && value.length === 0) return false;
	return true;
}
