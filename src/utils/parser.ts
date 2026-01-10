// Template parser for the Web Clipper template engine
// Converts token stream into an Abstract Syntax Tree (AST)
//
// The parser handles:
// - Text content
// - Variable interpolation with filters
// - Logic tags: if/elseif/else/endif, for/endfor, set
// - Expressions with operators and literals

import { Token, TokenType, tokenize, TokenizerResult } from './tokenizer';

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
				message: `Unexpected token: ${token.type}`,
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
			message: 'Expected expression in variable',
			line: startToken.line,
			column: startToken.column,
		});
		skipToEndOfVariable(state);
		return null;
	}

	// Consume variable_end
	let trimRight = false;
	if (check(state, 'variable_end')) {
		const endToken = advance(state);
		trimRight = endToken.trimRight || false;
	} else {
		state.errors.push({
			message: 'Expected }}',
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
				message: `Unexpected ${keywordToken.value} without matching opening tag`,
				line: keywordToken.line,
				column: keywordToken.column,
			});
			skipToEndOfTag(state);
			return null;

		default:
			state.errors.push({
				message: `Unknown tag keyword: ${keywordToken.value}`,
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
			message: 'Expected condition after if',
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
			message: 'Expected %} after if condition',
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
				message: 'Expected condition after elseif',
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
			message: 'Expected endif',
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
			message: 'Expected iterator name after for',
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
			message: 'Expected "in" after iterator name',
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
			message: 'Expected iterable after "in"',
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
			message: 'Expected %} after for',
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
			message: 'Expected endfor',
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
			message: 'Expected variable name after set',
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
			message: 'Expected "=" after variable name in set',
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
			message: 'Expected value after "=" in set',
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
			message: 'Expected %} after set',
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
				message: 'Expected expression after "??"',
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

// Filter: value | filter | filter
function parseFilterExpression(state: ParserState): Expression | null {
	let left = parseOrExpression(state);
	if (!left) return null;

	while (check(state, 'pipe')) {
		advance(state); // consume '|'

		if (!check(state, 'identifier')) {
			state.errors.push({
				message: 'Expected filter name after |',
				line: peek(state).line,
				column: peek(state).column,
			});
			break;
		}

		const filterToken = advance(state);
		const args: Expression[] = [];

		// Parse filter arguments: filter:arg or filter:(arg1, arg2)
		if (check(state, 'colon')) {
			advance(state); // consume ':'

			// Check for parenthesized arguments
			if (check(state, 'lparen')) {
				advance(state); // consume '('
				while (!check(state, 'rparen') && !isAtEnd(state)) {
					const arg = parseOrExpression(state);
					if (arg) args.push(arg);
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
				// Single argument
				const arg = parsePrimaryExpression(state);
				if (arg) args.push(arg);
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
				message: 'Expected expression after "or"',
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
				message: 'Expected expression after "and"',
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
				message: 'Expected expression after "not"',
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
				message: `Expected expression after "${opToken.value}"`,
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
				message: 'Expected expression inside brackets',
				line: bracketToken.line,
				column: bracketToken.column,
			});
			break;
		}

		if (check(state, 'rbracket')) {
			advance(state); // consume ']'
		} else {
			state.errors.push({
				message: 'Expected "]" after bracket expression',
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
				message: 'Expected expression after "("',
				line: token.line,
				column: token.column,
			});
			return null;
		}
		if (check(state, 'rparen')) {
			advance(state); // consume ')'
		} else {
			state.errors.push({
				message: 'Expected ")"',
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
			let rest = '';
			while (check(state, 'identifier') || check(state, 'dot') || check(state, 'colon')) {
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
		message: 'Expected %}',
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
