// Template parser for the Web Clipper template engine
// Converts token stream into an Abstract Syntax Tree (AST)
//
// The parser handles:
// - Text content
// - Variable interpolation with filters
// - Logic tags: if/elseif/else/endif, for/endfor, set
// - Expressions with operators and literals

import { Token, TokenType, tokenize, TokenizerResult } from './tokenizer';
import { filterMetadata, validFilterNames } from './filters';

// ============================================================================
// AST Node Types
// ============================================================================

// --- Base Types ---

export interface BaseNode {
	type: string;
	line: number;
	column: number;
}

// --- Top-level Nodes ---

export interface TextNode extends BaseNode {
	type: 'text';
	value: string;
}

export interface VariableNode extends BaseNode {
	type: 'variable';
	expression: Expression;
	trimLeft: boolean;
	trimRight: boolean;
}

export interface IfNode extends BaseNode {
	type: 'if';
	condition: Expression;
	consequent: ASTNode[];
	elseifs: { condition: Expression; body: ASTNode[] }[];
	alternate: ASTNode[] | null;
	trimLeft: boolean;
	trimRight: boolean;
}

export interface ForNode extends BaseNode {
	type: 'for';
	iterator: string;
	iterable: Expression;
	body: ASTNode[];
	trimLeft: boolean;
	trimRight: boolean;
}

export interface SetNode extends BaseNode {
	type: 'set';
	variable: string;
	value: Expression;
	trimLeft: boolean;
	trimRight: boolean;
}

export type ASTNode = TextNode | VariableNode | IfNode | ForNode | SetNode;

// --- Expression Nodes ---

export interface LiteralExpression extends BaseNode {
	type: 'literal';
	value: string | number | boolean | null;
	raw: string;
}

export interface IdentifierExpression extends BaseNode {
	type: 'identifier';
	name: string;
}

export interface BinaryExpression extends BaseNode {
	type: 'binary';
	operator: string;
	left: Expression;
	right: Expression;
}

export interface UnaryExpression extends BaseNode {
	type: 'unary';
	operator: string;
	argument: Expression;
}

export interface FilterExpression extends BaseNode {
	type: 'filter';
	value: Expression;
	name: string;
	args: Expression[];
}

export interface GroupExpression extends BaseNode {
	type: 'group';
	expression: Expression;
}

export interface MemberExpression extends BaseNode {
	type: 'member';
	object: Expression;
	property: Expression;
	computed: true; // Always true for bracket notation
}

export type Expression =
	| LiteralExpression
	| IdentifierExpression
	| BinaryExpression
	| UnaryExpression
	| FilterExpression
	| GroupExpression
	| MemberExpression;

// ============================================================================
// Parser Result
// ============================================================================

export interface ParserError {
	message: string;
	line: number;
	column: number;
}

export interface ParserResult {
	ast: ASTNode[];
	errors: ParserError[];
}

// ============================================================================
// Parser State
// ============================================================================

interface ParserState {
	tokens: Token[];
	pos: number;
	errors: ParserError[];
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse a template string into an AST.
 *
 * @param input The template string to parse
 * @returns ParserResult containing the AST and any errors
 */
export function parse(input: string): ParserResult {
	const tokenizerResult = tokenize(input);

	// Convert tokenizer errors to parser errors
	const errors: ParserError[] = tokenizerResult.errors.map(e => ({
		message: e.message,
		line: e.line,
		column: e.column,
	}));

	const state: ParserState = {
		tokens: tokenizerResult.tokens,
		pos: 0,
		errors,
	};

	const ast = parseTemplate(state);

	return { ast, errors: state.errors };
}

/**
 * Parse tokens directly (for when you already have tokens).
 */
export function parseTokens(tokens: Token[]): ParserResult {
	const state: ParserState = {
		tokens,
		pos: 0,
		errors: [],
	};

	const ast = parseTemplate(state);

	return { ast, errors: state.errors };
}

// ============================================================================
// Template Parsing
// ============================================================================

function parseTemplate(state: ParserState): ASTNode[] {
	const nodes: ASTNode[] = [];

	while (!isAtEnd(state)) {
		const node = parseNode(state);
		if (node) {
			nodes.push(node);
		}
	}

	return nodes;
}

function parseNode(state: ParserState): ASTNode | null {
	const token = peek(state);

	switch (token.type) {
		case 'text':
			return parseText(state);

		case 'variable_start':
			return parseVariable(state);

		case 'tag_start':
			return parseTag(state);

		case 'eof':
			advance(state);
			return null;

		default:
			// Unexpected token - skip and report error
			state.errors.push({
				message: `Unexpected "${token.value}" in template`,
				line: token.line,
				column: token.column,
			});
			advance(state);
			return null;
	}
}

// ============================================================================
// Text Node Parsing
// ============================================================================

function parseText(state: ParserState): TextNode {
	const token = advance(state);
	return {
		type: 'text',
		value: token.value,
		line: token.line,
		column: token.column,
	};
}

// ============================================================================
// Variable Node Parsing
// ============================================================================

function parseVariable(state: ParserState): VariableNode | null {
	const startToken = advance(state); // consume variable_start
	const trimLeft = startToken.trimLeft || false;

	const expression = parseExpression(state);
	if (!expression) {
		state.errors.push({
			message: 'Empty variable - add a variable name between {{ and }}',
			line: startToken.line,
			column: startToken.column,
		});
		skipToEndOfVariable(state);
		return null;
	}

	// Check for multiple consecutive identifiers (likely a prompt without quotes)
	// e.g., {{a summary of the page}} instead of {{"a summary of the page"}}
	if (check(state, 'identifier')) {
		// Count how many identifiers follow
		let extraWords = 0;
		const savedPos = state.pos;
		while (check(state, 'identifier') && extraWords < 10) {
			advance(state);
			extraWords++;
		}
		// Reset position
		state.pos = savedPos;

		if (extraWords > 0) {
			state.errors.push({
				message: 'Unknown variable. If this is a prompt, wrap it in quotes: {{"your prompt here"}}',
				line: startToken.line,
				column: startToken.column,
			});
			// Skip to end of variable to avoid cascading errors
			skipToEndOfVariable(state);
			return null;
		}
	}

	// Consume variable_end
	let trimRight = false;
	if (check(state, 'variable_end')) {
		const endToken = advance(state);
		trimRight = endToken.trimRight || false;
	} else {
		state.errors.push({
			message: 'Missing closing }}',
			line: peek(state).line,
			column: peek(state).column,
		});
	}

	return {
		type: 'variable',
		expression,
		trimLeft,
		trimRight,
		line: startToken.line,
		column: startToken.column,
	};
}

// ============================================================================
// Tag Parsing
// ============================================================================

function parseTag(state: ParserState): ASTNode | null {
	const startToken = advance(state); // consume tag_start
	const trimLeft = startToken.trimLeft || false;

	const keywordToken = peek(state);

	switch (keywordToken.type) {
		case 'keyword_if':
			return parseIfStatement(state, startToken, trimLeft);

		case 'keyword_for':
			return parseForStatement(state, startToken, trimLeft);

		case 'keyword_set':
			return parseSetStatement(state, startToken, trimLeft);

		case 'keyword_else':
		case 'keyword_elseif':
		case 'keyword_endif':
		case 'keyword_endfor':
			// These are handled by their parent parsers
			// If we encounter them here, it's an error
			state.errors.push({
				message: `Unexpected {% ${keywordToken.value} %} - no matching opening tag`,
				line: keywordToken.line,
				column: keywordToken.column,
			});
			skipToEndOfTag(state);
			return null;

		default:
			state.errors.push({
				message: `Unknown tag: {% ${keywordToken.value} %}`,
				line: keywordToken.line,
				column: keywordToken.column,
			});
			skipToEndOfTag(state);
			return null;
	}
}

// ============================================================================
// If Statement Parsing
// ============================================================================

function parseIfStatement(state: ParserState, startToken: Token, trimLeft: boolean): IfNode | null {
	advance(state); // consume 'if'

	const condition = parseExpression(state);
	if (!condition) {
		state.errors.push({
			message: '{% if %} requires a condition',
			line: startToken.line,
			column: startToken.column,
		});
		skipToEndOfTag(state);
		return null;
	}

	// Consume tag_end
	let trimRight = false;
	if (check(state, 'tag_end')) {
		trimRight = advance(state).trimRight || false;
	} else {
		state.errors.push({
			message: 'Missing %} to close {% if %}',
			line: peek(state).line,
			column: peek(state).column,
		});
	}

	// Parse consequent body
	const consequent = parseBody(state, ['keyword_elseif', 'keyword_else', 'keyword_endif']);

	// Parse elseif chains
	const elseifs: { condition: Expression; body: ASTNode[] }[] = [];
	while (checkTagKeyword(state, 'keyword_elseif')) {
		consumeTagStart(state);
		advance(state); // consume 'elseif'

		const elseifCondition = parseExpression(state);
		if (!elseifCondition) {
			state.errors.push({
				message: '{% elseif %} requires a condition',
				line: peek(state).line,
				column: peek(state).column,
			});
			skipToEndOfTag(state);
			continue;
		}

		consumeTagEnd(state);
		const elseifBody = parseBody(state, ['keyword_elseif', 'keyword_else', 'keyword_endif']);
		elseifs.push({ condition: elseifCondition, body: elseifBody });
	}

	// Parse else branch
	let alternate: ASTNode[] | null = null;
	if (checkTagKeyword(state, 'keyword_else')) {
		consumeTagStart(state);
		advance(state); // consume 'else'
		consumeTagEnd(state);
		alternate = parseBody(state, ['keyword_endif']);
	}

	// Consume endif
	if (checkTagKeyword(state, 'keyword_endif')) {
		consumeTagStart(state);
		advance(state); // consume 'endif'
		consumeTagEnd(state);
	} else {
		state.errors.push({
			message: 'Missing {% endif %} to close {% if %}',
			line: peek(state).line,
			column: peek(state).column,
		});
	}

	return {
		type: 'if',
		condition,
		consequent,
		elseifs,
		alternate,
		trimLeft,
		trimRight,
		line: startToken.line,
		column: startToken.column,
	};
}

// ============================================================================
// For Statement Parsing
// ============================================================================

function parseForStatement(state: ParserState, startToken: Token, trimLeft: boolean): ForNode | null {
	advance(state); // consume 'for'

	// Parse iterator name
	if (!check(state, 'identifier')) {
		state.errors.push({
			message: '{% for %} requires a variable name, e.g. {% for item in items %}',
			line: peek(state).line,
			column: peek(state).column,
		});
		skipToEndOfTag(state);
		return null;
	}
	const iterator = advance(state).value;

	// Parse 'in' keyword
	if (!check(state, 'keyword_in')) {
		state.errors.push({
			message: '{% for %} requires "in" keyword, e.g. {% for item in items %}',
			line: peek(state).line,
			column: peek(state).column,
		});
		skipToEndOfTag(state);
		return null;
	}
	advance(state); // consume 'in'

	// Parse iterable expression
	const iterable = parseExpression(state);
	if (!iterable) {
		state.errors.push({
			message: '{% for %} requires something to loop over after "in"',
			line: peek(state).line,
			column: peek(state).column,
		});
		skipToEndOfTag(state);
		return null;
	}

	// Consume tag_end
	let trimRight = false;
	if (check(state, 'tag_end')) {
		trimRight = advance(state).trimRight || false;
	} else {
		state.errors.push({
			message: 'Missing %} to close {% for %}',
			line: peek(state).line,
			column: peek(state).column,
		});
	}

	// Parse body
	const body = parseBody(state, ['keyword_endfor']);

	// Consume endfor
	if (checkTagKeyword(state, 'keyword_endfor')) {
		consumeTagStart(state);
		advance(state); // consume 'endfor'
		consumeTagEnd(state);
	} else {
		state.errors.push({
			message: 'Missing {% endfor %} to close {% for %}',
			line: peek(state).line,
			column: peek(state).column,
		});
	}

	return {
		type: 'for',
		iterator,
		iterable,
		body,
		trimLeft,
		trimRight,
		line: startToken.line,
		column: startToken.column,
	};
}

// ============================================================================
// Set Statement Parsing
// ============================================================================

function parseSetStatement(state: ParserState, startToken: Token, trimLeft: boolean): SetNode | null {
	advance(state); // consume 'set'

	// Parse variable name
	if (!check(state, 'identifier')) {
		state.errors.push({
			message: '{% set %} requires a variable name, e.g. {% set name = value %}',
			line: peek(state).line,
			column: peek(state).column,
		});
		skipToEndOfTag(state);
		return null;
	}
	const variable = advance(state).value;

	// Parse '=' operator
	if (!check(state, 'op_assign')) {
		state.errors.push({
			message: '{% set %} requires "=" after variable name',
			line: peek(state).line,
			column: peek(state).column,
		});
		skipToEndOfTag(state);
		return null;
	}
	advance(state); // consume '='

	// Parse value expression
	const value = parseExpression(state);
	if (!value) {
		state.errors.push({
			message: '{% set %} requires a value after "="',
			line: peek(state).line,
			column: peek(state).column,
		});
		skipToEndOfTag(state);
		return null;
	}

	// Consume tag_end
	let trimRight = false;
	if (check(state, 'tag_end')) {
		trimRight = advance(state).trimRight || false;
	} else {
		state.errors.push({
			message: 'Missing %} to close {% set %}',
			line: peek(state).line,
			column: peek(state).column,
		});
	}

	return {
		type: 'set',
		variable,
		value,
		trimLeft,
		trimRight,
		line: startToken.line,
		column: startToken.column,
	};
}

// ============================================================================
// Body Parsing (content between tags)
// ============================================================================

function parseBody(state: ParserState, stopKeywords: TokenType[]): ASTNode[] {
	const nodes: ASTNode[] = [];

	while (!isAtEnd(state)) {
		// Check if we've hit a stop keyword
		if (checkTagKeyword(state, ...stopKeywords)) {
			break;
		}

		const node = parseNode(state);
		if (node) {
			nodes.push(node);
		}
	}

	return nodes;
}

// ============================================================================
// Expression Parsing
// ============================================================================

function parseExpression(state: ParserState): Expression | null {
	return parseNullishExpression(state);
}

// Nullish coalescing has lowest precedence: value ?? fallback
function parseNullishExpression(state: ParserState): Expression | null {
	let left = parseFilterExpression(state);
	if (!left) return null;

	while (check(state, 'op_nullish')) {
		const opToken = advance(state);
		const right = parseFilterExpression(state);
		if (!right) {
			state.errors.push({
				message: 'Missing fallback value after ??',
				line: opToken.line,
				column: opToken.column,
			});
			break;
		}
		left = {
			type: 'binary',
			operator: '??',
			left,
			right,
			line: opToken.line,
			column: opToken.column,
		};
	}

	return left;
}

/**
 * Parse a filter argument that may contain colon-separated parts (for ranges).
 * e.g., "7" or "7:10" or "start:end"
 * Returns a string literal containing the full argument value.
 */
function parseFilterArgument(state: ParserState): Expression | null {
	const startToken = peek(state);

	// Handle simple delimiter tokens that can be used as filter arguments
	// e.g., split:/ or split:-
	if (check(state, 'slash') || check(state, 'star')) {
		const token = advance(state);
		return {
			type: 'literal',
			value: token.value,
			raw: token.value,
			line: token.line,
			column: token.column,
		};
	}

	// Handle bracket patterns like [0-9] as literal regex character classes
	// e.g., split:[0-9] or split:[a-zA-Z]
	if (check(state, 'lbracket')) {
		let value = '';
		let bracketDepth = 0;
		const startLine = peek(state).line;
		const startColumn = peek(state).column;

		// Consume everything from [ to matching ]
		while (!isAtEnd(state)) {
			const token = peek(state);

			if (token.type === 'lbracket') {
				bracketDepth++;
			} else if (token.type === 'rbracket') {
				bracketDepth--;
				if (bracketDepth === 0) {
					value += token.value;
					advance(state);
					break;
				}
			}

			// Stop if we hit pipe or variable_end without closing bracket
			if (bracketDepth === 0 && (token.type === 'pipe' || token.type === 'variable_end' || token.type === 'comma')) {
				break;
			}

			value += token.value;
			advance(state);
		}

		return {
			type: 'literal',
			value: value,
			raw: value,
			line: startLine,
			column: startColumn,
		};
	}

	// Check for arrow function: identifier => expression
	// e.g., map:tweet => ({text: tweet.text})
	if (check(state, 'identifier')) {
		const savedPos = state.pos;
		const idToken = advance(state);

		if (check(state, 'arrow')) {
			// This is an arrow function - consume everything until | or }}
			let value = idToken.value + ' ';
			value += advance(state).value + ' '; // consume '=>'

			// Consume everything until pipe or variable_end, tracking brace/paren depth
			let braceDepth = 0;
			let parenDepth = 0;

			while (!isAtEnd(state)) {
				const token = peek(state);

				// Stop at pipe or variable_end when not inside braces/parens
				if (braceDepth === 0 && parenDepth === 0) {
					if (token.type === 'pipe' || token.type === 'variable_end' || token.type === 'tag_end') {
						break;
					}
				}

				if (token.type === 'lbrace' || token.type === 'lparen') {
					if (token.type === 'lbrace') braceDepth++;
					else parenDepth++;
				} else if (token.type === 'rbrace' || token.type === 'rparen') {
					if (token.type === 'rbrace') braceDepth--;
					else parenDepth--;
					// If we close more than we opened, stop
					if (braceDepth < 0 || parenDepth < 0) break;
				}

				// Preserve quotes around string tokens so the map filter
			// can distinguish string literals from property expressions
			if (token.type === 'string') {
				value += `"${token.value}"`;
			} else {
				value += token.value;
			}
				advance(state);
			}

			return {
				type: 'literal',
				value: value.trim(),
				raw: value.trim(),
				line: startToken.line,
				column: startToken.column,
			};
		}

		// Not an arrow function - restore position
		state.pos = savedPos;
	}

	// Parse the first part
	const first = parsePrimaryExpression(state);
	if (!first) return null;

	// For quoted strings, chain together :string patterns as a single argument
	// e.g., replace:"old":"new" should be one arg "old":"new", not two args
	if (first.type === 'literal' && startToken.type === 'string') {
		// Format string with quotes preserved
		const formatString = (val: any) => `"${val}"`;
		let combined = formatString(first.value);

		// Check if followed by :string pattern - chain them together
		while (check(state, 'colon')) {
			const savedPos = state.pos;
			advance(state); // consume ':'

			if (check(state, 'string')) {
				const next = parsePrimaryExpression(state);
				if (next && next.type === 'literal') {
					combined += ':' + formatString(next.value);
				}
			} else {
				// Not a string after colon, restore position
				state.pos = savedPos;
				break;
			}
		}

		return {
			type: 'literal',
			value: combined,
			raw: combined,
			line: first.line,
			column: first.column,
		};
	}

	// For unquoted values (numbers, identifiers), check for colon-separated continuation
	// e.g., nth:1,2,3,5,7:7 where "7:7" is a range

	// Handle number+identifier patterns like "2n" for nth filter
	// The tokenizer splits "2n" into number "2" and identifier "n"
	if (first.type === 'literal' && startToken.type === 'number' && check(state, 'identifier')) {
		const idToken = peek(state);
		// Only consume single-letter identifiers that follow numbers (like 2n, 3n)
		if (idToken.value.length === 1 && /^[a-z]$/i.test(idToken.value)) {
			advance(state);
			const combined = String(first.value) + idToken.value;
			return {
				type: 'literal',
				value: combined,
				raw: combined,
				line: first.line,
				column: first.column,
			};
		}
	}

	// If there's no colon following, return the original expression to preserve its type
	// This is important for numeric args like slice:3,4 where we need actual numbers
	if (!check(state, 'colon')) {
		return first;
	}

	// Build a string value for colon-separated range notation
	let value = '';
	if (first.type === 'literal') {
		value = String(first.value);
	} else if (first.type === 'identifier') {
		value = first.name;
	} else {
		return first; // Return as-is for other types
	}

	// Consume colons for range notation like 5:7
	while (check(state, 'colon') && !isAtEnd(state)) {
		advance(state); // consume ':'
		value += ':';

		// Parse the next part
		const next = parsePrimaryExpression(state);
		if (next) {
			if (next.type === 'literal') {
				value += String(next.value);
			} else if (next.type === 'identifier') {
				value += next.name;
			}
		} else {
			// No valid expression after colon - might be end of argument
			break;
		}
	}

	// Return as a string literal containing the full colon-separated value
	return {
		type: 'literal',
		value: value,
		raw: value,
		line: startToken.line,
		column: startToken.column,
	};
}

// Filter: value | filter | filter
function parseFilterExpression(state: ParserState): Expression | null {
	let left = parseOrExpression(state);
	if (!left) return null;

	while (check(state, 'pipe')) {
		advance(state); // consume '|'

		if (!check(state, 'identifier')) {
			state.errors.push({
				message: 'Missing filter name after |',
				line: peek(state).line,
				column: peek(state).column,
			});
			break;
		}

		const filterToken = advance(state);
		const args: Expression[] = [];

		// Parse filter arguments: filter:arg or filter:arg1,arg2 or filter:(arg1, arg2)
		if (check(state, 'colon')) {
			advance(state); // consume ':'

			// Check for parenthesized arguments
			if (check(state, 'lparen')) {
				advance(state); // consume '('
				while (!check(state, 'rparen') && !isAtEnd(state)) {
					const arg = parseOrExpression(state);
					if (!arg) break;

					// Chain string:string pairs into a single arg
					// e.g., replace:("old":"new","foo":"bar") → two args: "old":"new" and "foo":"bar"
					if (arg.type === 'literal' && typeof arg.value === 'string' && check(state, 'colon')) {
						const formatStr = (val: any) => `"${val}"`;
						let combined = formatStr(arg.value);
						while (check(state, 'colon')) {
							advance(state); // consume ':'
							const next = parseOrExpression(state);
							if (next && next.type === 'literal' && typeof next.value === 'string') {
								combined += ':' + formatStr(next.value);
							} else {
								break;
							}
						}
						args.push({
							type: 'literal',
							value: combined,
							raw: combined,
							line: arg.line,
							column: arg.column,
						});
					} else {
						args.push(arg);
					}

					if (check(state, 'comma')) {
						advance(state);
					} else {
						break;
					}
				}
				if (check(state, 'rparen')) {
					advance(state); // consume ')'
				}
			} else {
				// Arguments without parentheses
				// Supports: filter:arg, filter:arg1,arg2, filter:"str1":"str2"
				const arg = parseFilterArgument(state);
				if (arg) args.push(arg);
				// Continue parsing comma-separated arguments
				// Note: colons within quoted string pairs (e.g., "old":"new") are
				// handled by parseFilterArgument, not as separators here
				while (check(state, 'comma')) {
					advance(state); // consume ','
					const nextArg = parseFilterArgument(state);
					if (nextArg) args.push(nextArg);
				}
			}
		}

		left = {
			type: 'filter',
			value: left,
			name: filterToken.value,
			args,
			line: filterToken.line,
			column: filterToken.column,
		};
	}

	return left;
}

// Or: left or right, left || right
function parseOrExpression(state: ParserState): Expression | null {
	let left = parseAndExpression(state);
	if (!left) return null;

	while (check(state, 'op_or')) {
		const opToken = advance(state);
		const right = parseAndExpression(state);
		if (!right) {
			state.errors.push({
				message: 'Missing value after "or"',
				line: opToken.line,
				column: opToken.column,
			});
			break;
		}
		left = {
			type: 'binary',
			operator: 'or',
			left,
			right,
			line: opToken.line,
			column: opToken.column,
		};
	}

	return left;
}

// And: left and right, left && right
function parseAndExpression(state: ParserState): Expression | null {
	let left = parseNotExpression(state);
	if (!left) return null;

	while (check(state, 'op_and')) {
		const opToken = advance(state);
		const right = parseNotExpression(state);
		if (!right) {
			state.errors.push({
				message: 'Missing value after "and"',
				line: opToken.line,
				column: opToken.column,
			});
			break;
		}
		left = {
			type: 'binary',
			operator: 'and',
			left,
			right,
			line: opToken.line,
			column: opToken.column,
		};
	}

	return left;
}

// Not: not expr, !expr
function parseNotExpression(state: ParserState): Expression | null {
	if (check(state, 'op_not')) {
		const opToken = advance(state);
		const argument = parseNotExpression(state);
		if (!argument) {
			state.errors.push({
				message: 'Missing value after "not"',
				line: opToken.line,
				column: opToken.column,
			});
			return null;
		}
		return {
			type: 'unary',
			operator: 'not',
			argument,
			line: opToken.line,
			column: opToken.column,
		};
	}

	return parseComparisonExpression(state);
}

// Comparison: ==, !=, >, <, >=, <=, contains
function parseComparisonExpression(state: ParserState): Expression | null {
	let left = parsePostfixExpression(state);
	if (!left) return null;

	const comparisonOps: TokenType[] = ['op_eq', 'op_neq', 'op_gt', 'op_lt', 'op_gte', 'op_lte', 'op_contains'];

	if (comparisonOps.some(op => check(state, op))) {
		const opToken = advance(state);
		const right = parsePostfixExpression(state);
		if (!right) {
			state.errors.push({
				message: `Missing value after "${opToken.value}"`,
				line: opToken.line,
				column: opToken.column,
			});
			return left;
		}

		const operatorMap: Record<string, string> = {
			'op_eq': '==',
			'op_neq': '!=',
			'op_gt': '>',
			'op_lt': '<',
			'op_gte': '>=',
			'op_lte': '<=',
			'op_contains': 'contains',
		};

		return {
			type: 'binary',
			operator: operatorMap[opToken.type] || opToken.value,
			left,
			right,
			line: opToken.line,
			column: opToken.column,
		};
	}

	return left;
}

// Postfix: primary followed by bracket access [index]
function parsePostfixExpression(state: ParserState): Expression | null {
	let left = parsePrimaryExpression(state);
	if (!left) return null;

	// Handle bracket notation: expr[index]
	while (check(state, 'lbracket')) {
		const bracketToken = advance(state); // consume '['

		const property = parseOrExpression(state);
		if (!property) {
			state.errors.push({
				message: 'Empty brackets [] - add an index or key',
				line: bracketToken.line,
				column: bracketToken.column,
			});
			break;
		}

		if (check(state, 'rbracket')) {
			advance(state); // consume ']'
		} else {
			state.errors.push({
				message: 'Missing closing ]',
				line: peek(state).line,
				column: peek(state).column,
			});
		}

		left = {
			type: 'member',
			object: left,
			property,
			computed: true,
			line: bracketToken.line,
			column: bracketToken.column,
		};
	}

	return left;
}

// Primary: literals, identifiers, grouped expressions
function parsePrimaryExpression(state: ParserState): Expression | null {
	const token = peek(state);

	// Grouped expression: (expr)
	if (check(state, 'lparen')) {
		advance(state); // consume '('
		const expr = parseOrExpression(state);
		if (!expr) {
			state.errors.push({
				message: 'Empty parentheses () - add an expression',
				line: token.line,
				column: token.column,
			});
			return null;
		}
		if (check(state, 'rparen')) {
			advance(state); // consume ')'
		} else {
			state.errors.push({
				message: 'Missing closing )',
				line: peek(state).line,
				column: peek(state).column,
			});
		}
		return {
			type: 'group',
			expression: expr,
			line: token.line,
			column: token.column,
		};
	}

	// String literal
	if (check(state, 'string')) {
		const strToken = advance(state);
		return {
			type: 'literal',
			value: strToken.value,
			raw: strToken.value,
			line: strToken.line,
			column: strToken.column,
		};
	}

	// Number literal
	if (check(state, 'number')) {
		const numToken = advance(state);
		return {
			type: 'literal',
			value: parseFloat(numToken.value),
			raw: numToken.value,
			line: numToken.line,
			column: numToken.column,
		};
	}

	// Boolean literal
	if (check(state, 'boolean')) {
		const boolToken = advance(state);
		return {
			type: 'literal',
			value: boolToken.value.toLowerCase() === 'true',
			raw: boolToken.value,
			line: boolToken.line,
			column: boolToken.column,
		};
	}

	// Null literal
	if (check(state, 'null')) {
		const nullToken = advance(state);
		return {
			type: 'literal',
			value: null,
			raw: 'null',
			line: nullToken.line,
			column: nullToken.column,
		};
	}

	// Identifier (may include property access via dots)
	if (check(state, 'identifier')) {
		const idToken = advance(state);
		let name = idToken.value;

		// Handle special prefixes that use colons: selector:, schema:, selectorHtml:
		if (check(state, 'colon')) {
			// Look ahead to see if this is a special prefix
			const colonToken = peek(state);
			advance(state); // consume ':'

			// Build the full identifier including the prefix
			// This handles: schema:[0].prop, selector:div.class, schema:director[*].name, etc.
			let rest = '';
			while (
				check(state, 'identifier') ||
				check(state, 'dot') ||
				check(state, 'colon') ||
				check(state, 'lbracket') ||
				check(state, 'rbracket') ||
				check(state, 'number') ||
				check(state, 'string') ||
				check(state, 'star')
			) {
				rest += advance(state).value;
			}
			name = name + ':' + rest;
		}

		return {
			type: 'identifier',
			name,
			line: idToken.line,
			column: idToken.column,
		};
	}

	// No valid primary expression found
	return null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function peek(state: ParserState): Token {
	return state.tokens[state.pos] || { type: 'eof', value: '', line: 0, column: 0 };
}

function advance(state: ParserState): Token {
	const token = peek(state);
	if (!isAtEnd(state)) {
		state.pos++;
	}
	return token;
}

function check(state: ParserState, type: TokenType): boolean {
	return peek(state).type === type;
}

function isAtEnd(state: ParserState): boolean {
	return peek(state).type === 'eof';
}

function checkTagKeyword(state: ParserState, ...keywords: TokenType[]): boolean {
	// Check if we're at a tag_start followed by one of the keywords
	if (!check(state, 'tag_start')) return false;

	const nextPos = state.pos + 1;
	if (nextPos >= state.tokens.length) return false;

	const nextToken = state.tokens[nextPos];
	return keywords.includes(nextToken.type);
}

function consumeTagStart(state: ParserState): Token | null {
	if (check(state, 'tag_start')) {
		return advance(state);
	}
	return null;
}

function consumeTagEnd(state: ParserState): Token | null {
	if (check(state, 'tag_end')) {
		return advance(state);
	}
	state.errors.push({
		message: 'Missing closing %}',
		line: peek(state).line,
		column: peek(state).column,
	});
	return null;
}

function skipToEndOfTag(state: ParserState): void {
	while (!isAtEnd(state) && !check(state, 'tag_end')) {
		advance(state);
	}
	if (check(state, 'tag_end')) {
		advance(state);
	}
}

function skipToEndOfVariable(state: ParserState): void {
	while (!isAtEnd(state) && !check(state, 'variable_end')) {
		advance(state);
	}
	if (check(state, 'variable_end')) {
		advance(state);
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format an AST node for debugging
 */
export function formatAST(nodes: ASTNode[], indent: number = 0): string {
	const pad = '  '.repeat(indent);
	let result = '';

	for (const node of nodes) {
		switch (node.type) {
			case 'text':
				result += `${pad}Text: ${JSON.stringify(node.value)}\n`;
				break;

			case 'variable':
				result += `${pad}Variable:\n`;
				result += formatExpression(node.expression, indent + 1);
				break;

			case 'if':
				result += `${pad}If:\n`;
				result += `${pad}  Condition:\n`;
				result += formatExpression(node.condition, indent + 2);
				result += `${pad}  Then:\n`;
				result += formatAST(node.consequent, indent + 2);
				for (const elseif of node.elseifs) {
					result += `${pad}  ElseIf:\n`;
					result += formatExpression(elseif.condition, indent + 2);
					result += formatAST(elseif.body, indent + 2);
				}
				if (node.alternate) {
					result += `${pad}  Else:\n`;
					result += formatAST(node.alternate, indent + 2);
				}
				break;

			case 'for':
				result += `${pad}For: ${node.iterator} in\n`;
				result += formatExpression(node.iterable, indent + 1);
				result += `${pad}  Body:\n`;
				result += formatAST(node.body, indent + 2);
				break;

			case 'set':
				result += `${pad}Set: ${node.variable} =\n`;
				result += formatExpression(node.value, indent + 1);
				break;
		}
	}

	return result;
}

function formatExpression(expr: Expression, indent: number): string {
	const pad = '  '.repeat(indent);

	switch (expr.type) {
		case 'literal':
			return `${pad}Literal: ${JSON.stringify(expr.value)}\n`;

		case 'identifier':
			return `${pad}Identifier: ${expr.name}\n`;

		case 'binary':
			return `${pad}Binary: ${expr.operator}\n` +
				formatExpression(expr.left, indent + 1) +
				formatExpression(expr.right, indent + 1);

		case 'unary':
			return `${pad}Unary: ${expr.operator}\n` +
				formatExpression(expr.argument, indent + 1);

		case 'filter':
			let result = `${pad}Filter: ${expr.name}\n`;
			result += `${pad}  Value:\n`;
			result += formatExpression(expr.value, indent + 2);
			if (expr.args.length > 0) {
				result += `${pad}  Args:\n`;
				for (const arg of expr.args) {
					result += formatExpression(arg, indent + 2);
				}
			}
			return result;

		case 'group':
			return `${pad}Group:\n` + formatExpression(expr.expression, indent + 1);

		default:
			return `${pad}Unknown expression\n`;
	}
}

/**
 * Format a parser error with position
 */
export function formatParserError(error: ParserError): string {
	return `Error at line ${error.line}, column ${error.column}: ${error.message}`;
}

// ============================================================================
// Variable Validation
// ============================================================================

/**
 * Known preset variables that are always available
 */
const PRESET_VARIABLES = new Set([
	'author',
	'content',
	'contentHtml',
	'date',
	'description',
	'domain',
	'favicon',
	'fullHtml',
	'highlights',
	'image',
	'published',
	'selection',
	'selectionHtml',
	'site',
	'title',
	'time',
	'url',
	'words',
]);

/**
 * Special variable prefixes that indicate dynamic variables
 */
const SPECIAL_PREFIXES = [
	'schema:',
	'selector:',
	'selectorHtml:',
	'meta:',
];

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= a.length; j++) {
		matrix[0][j] = j;
	}

	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1,
					matrix[i][j - 1] + 1,
					matrix[i - 1][j] + 1
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

/**
 * Find the closest matching preset variable
 */
function findSimilarVariable(name: string): string | null {
	let bestMatch: string | null = null;
	let bestDistance = Infinity;

	for (const preset of PRESET_VARIABLES) {
		const distance = levenshteinDistance(name.toLowerCase(), preset.toLowerCase());
		// Only suggest if the distance is reasonable (less than half the length)
		if (distance < Math.max(name.length, preset.length) / 2 && distance < bestDistance) {
			bestDistance = distance;
			bestMatch = preset;
		}
	}

	return bestMatch;
}

/**
 * Check if a variable name is valid
 */
function isValidVariable(name: string, definedVariables: Set<string>): boolean {
	// Prompt variables start with "
	if (name.startsWith('"')) {
		return true;
	}

	// Special prefix variables
	for (const prefix of SPECIAL_PREFIXES) {
		if (name.startsWith(prefix)) {
			return true;
		}
	}

	// Check if it's a preset variable
	if (PRESET_VARIABLES.has(name)) {
		return true;
	}

	// Check if it's a defined variable (via {% set %})
	if (definedVariables.has(name)) {
		return true;
	}

	// Check for nested property access on known variables (e.g., loop.index)
	const baseName = name.split('.')[0].split('[')[0];
	if (PRESET_VARIABLES.has(baseName) || definedVariables.has(baseName) || baseName === 'loop') {
		return true;
	}

	return false;
}

/**
 * Extract the base variable name from an expression
 */
function getVariableNameFromExpression(expr: Expression): { name: string; line: number; column: number } | null {
	switch (expr.type) {
		case 'identifier':
			return { name: expr.name, line: expr.line, column: expr.column };
		case 'filter':
			return getVariableNameFromExpression(expr.value);
		case 'member':
			return getVariableNameFromExpression(expr.object);
		case 'binary':
			// For nullish coalescing, check the left side
			if (expr.operator === '??') {
				return getVariableNameFromExpression(expr.left);
			}
			return null;
		default:
			return null;
	}
}

/**
 * Reference with its scope - stores defined variables at the point of reference
 */
interface ScopedReference {
	name: string;
	line: number;
	column: number;
	scope: Set<string>;
}

/**
 * Collect all variable references and set definitions from the AST
 */
function collectVariables(
	nodes: ASTNode[],
	definedVariables: Set<string>,
	references: ScopedReference[]
): void {
	for (const node of nodes) {
		switch (node.type) {
			case 'variable': {
				const varInfo = getVariableNameFromExpression(node.expression);
				if (varInfo) {
					references.push({ ...varInfo, scope: new Set(definedVariables) });
				}
				break;
			}
			case 'set':
				// Add to defined variables
				definedVariables.add(node.variable);
				// Also check the value expression
				collectExpression(node.value, definedVariables, references);
				break;
			case 'if':
				collectExpression(node.condition, definedVariables, references);
				collectVariables(node.consequent, definedVariables, references);
				for (const elseif of node.elseifs) {
					collectExpression(elseif.condition, definedVariables, references);
					collectVariables(elseif.body, definedVariables, references);
				}
				if (node.alternate) {
					collectVariables(node.alternate, definedVariables, references);
				}
				break;
			case 'for':
				// The iterator is defined within the loop
				const loopVariables = new Set(definedVariables);
				loopVariables.add(node.iterator);
				loopVariables.add(`${node.iterator}_index`);
				collectExpression(node.iterable, definedVariables, references);
				collectVariables(node.body, loopVariables, references);
				break;
		}
	}
}

/**
 * Collect variable references from an expression
 */
function collectExpression(
	expr: Expression,
	definedVariables: Set<string>,
	references: ScopedReference[]
): void {
	switch (expr.type) {
		case 'identifier': {
			references.push({ name: expr.name, line: expr.line, column: expr.column, scope: new Set(definedVariables) });
			break;
		}
		case 'filter':
			collectExpression(expr.value, definedVariables, references);
			for (const arg of expr.args) {
				collectExpression(arg, definedVariables, references);
			}
			break;
		case 'binary':
			collectExpression(expr.left, definedVariables, references);
			collectExpression(expr.right, definedVariables, references);
			break;
		case 'unary':
			collectExpression(expr.argument, definedVariables, references);
			break;
		case 'member':
			collectExpression(expr.object, definedVariables, references);
			collectExpression(expr.property, definedVariables, references);
			break;
		case 'group':
			collectExpression(expr.expression, definedVariables, references);
			break;
	}
}

/**
 * Validate all variable references in the AST
 */
export function validateVariables(ast: ASTNode[]): ParserError[] {
	const warnings: ParserError[] = [];
	const definedVariables = new Set<string>();
	const references: ScopedReference[] = [];

	// Collect all defined variables and references
	collectVariables(ast, definedVariables, references);

	// Check each reference against its scope
	for (const ref of references) {
		if (!isValidVariable(ref.name, ref.scope)) {
			const similar = findSimilarVariable(ref.name);
			let message = `Unknown variable "${ref.name}"`;
			if (similar) {
				message += `. Did you mean "${similar}"?`;
			}
			warnings.push({
				message,
				line: ref.line,
				column: ref.column,
			});
		}
	}

	return warnings;
}

// ============================================================================
// Filter Validation
// ============================================================================

interface FilterUsage {
	name: string;
	hasArgs: boolean;
	args: Expression[];
	line: number;
	column: number;
}

/**
 * Reconstruct a parameter string from parsed Expression arguments
 */
function expressionToString(expr: Expression): string {
	switch (expr.type) {
		case 'literal':
			if (typeof expr.value === 'string') {
				// Don't double-quote strings that already contain quotes
				// e.g., '"h":"H"' should stay as-is
				if (/^["'].*["']$/.test(expr.value) || expr.value.includes('":"') || expr.value.includes("':'")) {
					return expr.value;
				}
				// Don't quote arrow function expressions (e.g., map:item => item.name)
				if (/\s*\w+\s*=>/.test(expr.value)) {
					return expr.value;
				}
				// Don't quote simple values like "2n", "3:4", etc.
				// Only quote strings with spaces or special chars that need protection
				if (/^[\w.:+\-*/]+$/.test(expr.value)) {
					return expr.value;
				}
				return `"${expr.value}"`;
			}
			return String(expr.value);
		case 'identifier':
			return expr.name;
		case 'filter':
			const base = expressionToString(expr.value);
			const filterArgs = expr.args.map(expressionToString).join(':');
			return filterArgs ? `${base}|${expr.name}:${filterArgs}` : `${base}|${expr.name}`;
		case 'binary':
			return `${expressionToString(expr.left)} ${expr.operator} ${expressionToString(expr.right)}`;
		case 'unary':
			return `${expr.operator} ${expressionToString(expr.argument)}`;
		case 'group':
			return `(${expressionToString(expr.expression)})`;
		case 'member':
			return `${expressionToString(expr.object)}.${expressionToString(expr.property)}`;
		default:
			return '';
	}
}

function argsToParamString(args: Expression[]): string | undefined {
	if (args.length === 0) return undefined;
	// Join args with comma - this matches how the parser now separates args
	return args.map(expressionToString).join(',');
}

/**
 * Find the closest matching filter name for suggestions
 */
function findSimilarFilter(name: string): string | null {
	let bestMatch: string | null = null;
	let bestDistance = Infinity;

	for (const filterName of validFilterNames) {
		const distance = levenshteinDistance(name.toLowerCase(), filterName.toLowerCase());
		if (distance < Math.max(name.length, filterName.length) / 2 && distance < bestDistance) {
			bestDistance = distance;
			bestMatch = filterName;
		}
	}

	return bestMatch;
}

/**
 * Collect filter usages from an expression
 */
function collectFiltersFromExpression(expr: Expression, usages: FilterUsage[]): void {
	switch (expr.type) {
		case 'filter':
			usages.push({
				name: expr.name,
				hasArgs: expr.args.length > 0,
				args: expr.args,
				line: expr.line,
				column: expr.column,
			});
			collectFiltersFromExpression(expr.value, usages);
			for (const arg of expr.args) {
				collectFiltersFromExpression(arg, usages);
			}
			break;
		case 'binary':
			collectFiltersFromExpression(expr.left, usages);
			collectFiltersFromExpression(expr.right, usages);
			break;
		case 'unary':
			collectFiltersFromExpression(expr.argument, usages);
			break;
		case 'member':
			collectFiltersFromExpression(expr.object, usages);
			collectFiltersFromExpression(expr.property, usages);
			break;
		case 'group':
			collectFiltersFromExpression(expr.expression, usages);
			break;
	}
}

/**
 * Collect all filter usages from the AST
 */
function collectFilters(nodes: ASTNode[]): FilterUsage[] {
	const usages: FilterUsage[] = [];

	function processNode(node: ASTNode): void {
		switch (node.type) {
			case 'variable':
				collectFiltersFromExpression(node.expression, usages);
				break;
			case 'set':
				collectFiltersFromExpression(node.value, usages);
				break;
			case 'if':
				collectFiltersFromExpression(node.condition, usages);
				node.consequent.forEach(processNode);
				node.elseifs.forEach(elseif => {
					collectFiltersFromExpression(elseif.condition, usages);
					elseif.body.forEach(processNode);
				});
				node.alternate?.forEach(processNode);
				break;
			case 'for':
				collectFiltersFromExpression(node.iterable, usages);
				node.body.forEach(processNode);
				break;
		}
	}

	nodes.forEach(processNode);
	return usages;
}

/**
 * Validate filter usage in the AST.
 * Checks: 1) filter exists, 2) params are valid (via validator)
 */
export function validateFilters(ast: ASTNode[]): ParserError[] {
	const errors: ParserError[] = [];
	const usages = collectFilters(ast);

	for (const usage of usages) {
		// Check if filter exists
		if (!validFilterNames.has(usage.name)) {
			const similar = findSimilarFilter(usage.name);
			let message = `Unknown filter "${usage.name}"`;
			if (similar) {
				message += `. Did you mean "${similar}"?`;
			}
			errors.push({
				message,
				line: usage.line,
				column: usage.column,
			});
			continue;
		}

		// Run param validator if available
		const meta = filterMetadata[usage.name];
		if (meta?.validateParams) {
			const paramString = usage.hasArgs ? argsToParamString(usage.args) : undefined;
			const result = meta.validateParams(paramString);
			if (!result.valid && result.error) {
				errors.push({
					message: `Filter "${usage.name}" ${result.error}`,
					line: usage.line,
					column: usage.column,
				});
			}
		}
	}

	return errors;
}
