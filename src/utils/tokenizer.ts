// Template tokenizer for the Web Clipper template engine
// Converts template strings into a stream of tokens for parsing
//
// This tokenizer handles:
// - Text content
// - Variable tags: {{ variable|filter }} (preserves whitespace)
// - Logic tags: {% if condition %}, {% for item in array %}, etc. (trims whitespace)

// ============================================================================
// Token Types
// ============================================================================

export type TokenType =
	// Structural tokens
	| 'text'              // Raw text content between tags
	| 'variable_start'    // {{ or {{-
	| 'variable_end'      // }} or -}}
	| 'tag_start'         // {% or {%-
	| 'tag_end'           // %} or -%}

	// Keywords
	| 'keyword_if'
	| 'keyword_elseif'
	| 'keyword_else'
	| 'keyword_endif'
	| 'keyword_for'
	| 'keyword_in'
	| 'keyword_endfor'
	| 'keyword_set'

	// Operators
	| 'op_eq'             // ==
	| 'op_neq'            // !=
	| 'op_gte'            // >=
	| 'op_lte'            // <=
	| 'op_gt'             // >
	| 'op_lt'             // <
	| 'op_and'            // and, &&
	| 'op_or'             // or, ||
	| 'op_not'            // not, !
	| 'op_contains'       // contains
	| 'op_nullish'        // ??
	| 'op_assign'         // =

	// Literals and identifiers
	| 'identifier'        // variable names, property access
	| 'string'            // "string" or 'string'
	| 'number'            // 123, 45.67
	| 'boolean'           // true, false
	| 'null'              // null

	// Punctuation
	| 'pipe'              // |
	| 'lparen'            // (
	| 'rparen'            // )
	| 'lbracket'          // [
	| 'rbracket'          // ]
	| 'lbrace'            // {
	| 'rbrace'            // }
	| 'colon'             // :
	| 'comma'             // ,
	| 'dot'               // .
	| 'star'              // *
	| 'slash'             // /
	| 'arrow'             // =>
	| 'dollar'            // $

	// Special
	| 'eof';              // End of input

// ============================================================================
// Token Interface
// ============================================================================

export interface Token {
	type: TokenType;
	value: string;
	line: number;
	column: number;
	// For structural tokens, track if whitespace trim is active
	trimLeft?: boolean;   // For *_start tokens
	trimRight?: boolean;  // For *_end tokens
}

export interface TokenizerError {
	message: string;
	line: number;
	column: number;
}

export interface TokenizerResult {
	tokens: Token[];
	errors: TokenizerError[];
}

// ============================================================================
// Tokenizer State
// ============================================================================

type TokenizerMode = 'text' | 'variable' | 'tag';

interface TokenizerState {
	input: string;
	pos: number;
	line: number;
	column: number;
	mode: TokenizerMode;
	tokens: Token[];
	errors: TokenizerError[];
}

// ============================================================================
// Keywords and Operators
// ============================================================================

const KEYWORDS: Record<string, TokenType> = {
	'if': 'keyword_if',
	'elseif': 'keyword_elseif',
	'else': 'keyword_else',
	'endif': 'keyword_endif',
	'for': 'keyword_for',
	'in': 'keyword_in',
	'endfor': 'keyword_endfor',
	'set': 'keyword_set',
	'and': 'op_and',
	'or': 'op_or',
	'not': 'op_not',
	'contains': 'op_contains',
	'true': 'boolean',
	'false': 'boolean',
	'null': 'null',
};

// ============================================================================
// Main Tokenizer Function
// ============================================================================

/**
 * Tokenize a template string into a stream of tokens.
 *
 * @param input The template string to tokenize
 * @returns TokenizerResult containing tokens and any errors
 */
export function tokenize(input: string): TokenizerResult {
	const state: TokenizerState = {
		input,
		pos: 0,
		line: 1,
		column: 1,
		mode: 'text',
		tokens: [],
		errors: [],
	};

	while (state.pos < state.input.length) {
		switch (state.mode) {
			case 'text':
				tokenizeText(state);
				break;
			case 'variable':
				tokenizeVariable(state);
				break;
			case 'tag':
				tokenizeTag(state);
				break;
		}
	}

	// Add EOF token
	state.tokens.push({
		type: 'eof',
		value: '',
		line: state.line,
		column: state.column,
	});

	return {
		tokens: state.tokens,
		errors: state.errors,
	};
}

// ============================================================================
// Text Mode Tokenization
// ============================================================================

function tokenizeText(state: TokenizerState): void {
	const startPos = state.pos;
	const startLine = state.line;
	const startColumn = state.column;

	while (state.pos < state.input.length) {
		// Check for variable start: {{
		if (lookAhead(state, '{{')) {
			// Emit any accumulated text
			if (state.pos > startPos) {
				state.tokens.push({
					type: 'text',
					value: state.input.slice(startPos, state.pos),
					line: startLine,
					column: startColumn,
				});
			}

			// Variables preserve whitespace by default (unlike tags which trim by default)
			advance(state, 2);

			state.tokens.push({
				type: 'variable_start',
				value: '{{',
				line: state.line,
				column: state.column - 2,
				trimLeft: false,  // Variables preserve whitespace by default
			});

			state.mode = 'variable';
			return;
		}

		// Check for tag start: {%
		if (lookAhead(state, '{%')) {
			// Emit any accumulated text
			if (state.pos > startPos) {
				state.tokens.push({
					type: 'text',
					value: state.input.slice(startPos, state.pos),
					line: startLine,
					column: startColumn,
				});
			}

			advance(state, 2);

			state.tokens.push({
				type: 'tag_start',
				value: '{%',
				line: state.line,
				column: state.column - 2,
				trimLeft: false,  // Preserve whitespace before tags
			});

			state.mode = 'tag';
			return;
		}

		// Regular character - advance
		advanceChar(state);
	}

	// End of input - emit remaining text
	if (state.pos > startPos) {
		state.tokens.push({
			type: 'text',
			value: state.input.slice(startPos, state.pos),
			line: startLine,
			column: startColumn,
		});
	}
}

// ============================================================================
// Variable Mode Tokenization (inside {{ }})
// ============================================================================

function tokenizeVariable(state: TokenizerState): void {
	skipWhitespace(state);

	// Variables preserve whitespace by default (unlike tags which trim by default)
	if (lookAhead(state, '}}')) {
		state.tokens.push({
			type: 'variable_end',
			value: '}}',
			line: state.line,
			column: state.column,
			trimRight: false,  // Variables preserve whitespace by default
		});
		advance(state, 2);
		state.mode = 'text';
		return;
	}

	// Check for malformed variable end: } without another } (common typo)
	// But NOT if followed by characters that indicate it's part of an expression
	// (e.g., }| for object literal followed by filter, }, for object property separator)
	const nextChar = state.input[state.pos + 1];
	if (state.input[state.pos] === '}' && nextChar !== '}') {
		// These characters after } indicate it's a valid rbrace in an expression
		const validAfterBrace = ['|', ',', ')', ']', ' ', '\t', '\n', '\r'];
		if (!validAfterBrace.includes(nextChar)) {
			state.errors.push({
				message: `Malformed variable: expected '}}' but found '}'. Did you forget a '}'?`,
				line: state.line,
				column: state.column,
			});
			// Emit a variable_end anyway to prevent cascading errors
			state.tokens.push({
				type: 'variable_end',
				value: '}',
				line: state.line,
				column: state.column,
				trimRight: false,
			});
			advanceChar(state);
			state.mode = 'text';
			return;
		}
	}

	// Check for new tag/variable starting - indicates unclosed variable
	// This handles cases like: {{titl\n{% set...
	if (lookAhead(state, '{%') || lookAhead(state, '{{')) {
		// Find the line where the variable started for better error reporting
		const varStartIndex = [...state.tokens].reverse().findIndex(t => t.type === 'variable_start');
		const actualIndex = varStartIndex >= 0 ? state.tokens.length - 1 - varStartIndex : -1;
		const varStartToken = actualIndex >= 0 ? state.tokens[actualIndex] : null;
		const startLine = varStartToken?.line || state.line;
		state.errors.push({
			message: `Missing closing '}}' for variable`,
			line: startLine,
			column: varStartToken?.column || state.column,
		});
		// Remove the variable_start and any tokens after it to avoid cascading errors
		// The malformed variable content will be discarded
		if (actualIndex >= 0) {
			state.tokens.splice(actualIndex);
		}
		state.mode = 'text';
		return;
	}

	// Tokenize expression content
	tokenizeExpression(state, 'variable');
}

// ============================================================================
// Tag Mode Tokenization (inside {% %})
// ============================================================================

function tokenizeTag(state: TokenizerState): void {
	skipWhitespace(state);

	// Check for tag end: %}
	if (lookAhead(state, '%}')) {
		state.tokens.push({
			type: 'tag_end',
			value: '%}',
			line: state.line,
			column: state.column,
			trimRight: true,  // Tags always trim whitespace
		});
		advance(state, 2);
		state.mode = 'text';
		return;
	}

	// Check for trimming tag end: -%}
	if (lookAhead(state, '-%}')) {
		state.tokens.push({
			type: 'tag_end',
			value: '-%}',
			line: state.line,
			column: state.column,
			trimRight: true,
		});
		advance(state, 3);
		state.mode = 'text';
		return;
	}

	// Check for malformed tag end: } without % (common typo)
	// This prevents the tokenizer from consuming subsequent lines
	if (state.input[state.pos] === '}' && state.pos > 0 && state.input[state.pos - 1] !== '%') {
		state.errors.push({
			message: `Malformed tag: expected '%}' but found '}'. Did you forget the '%'?`,
			line: state.line,
			column: state.column,
		});
		// Emit a tag_end anyway to prevent cascading errors
		state.tokens.push({
			type: 'tag_end',
			value: '}',
			line: state.line,
			column: state.column,
			trimRight: true,
		});
		advanceChar(state);
		state.mode = 'text';
		return;
	}

	// Check for new tag/variable starting - indicates unclosed tag
	// This handles cases like: {% if x\n{% set...
	if (lookAhead(state, '{%') || lookAhead(state, '{{')) {
		// Find the line where the tag started for better error reporting
		const tagStartIndex = [...state.tokens].reverse().findIndex(t => t.type === 'tag_start');
		const actualIndex = tagStartIndex >= 0 ? state.tokens.length - 1 - tagStartIndex : -1;
		const tagStartToken = actualIndex >= 0 ? state.tokens[actualIndex] : null;
		const startLine = tagStartToken?.line || state.line;
		state.errors.push({
			message: `Missing closing '%}' for tag`,
			line: startLine,
			column: tagStartToken?.column || state.column,
		});
		// Remove the tag_start and any tokens after it to avoid cascading errors
		// The malformed tag content will be discarded
		if (actualIndex >= 0) {
			state.tokens.splice(actualIndex);
		}
		state.mode = 'text';
		return;
	}

	// Tokenize expression content
	tokenizeExpression(state, 'tag');
}

// ============================================================================
// Expression Tokenization (shared between variable and tag modes)
// ============================================================================

function tokenizeExpression(state: TokenizerState, mode: 'variable' | 'tag'): void {
	skipWhitespace(state);

	if (state.pos >= state.input.length) {
		state.errors.push({
			message: mode === 'variable'
				? `Unclosed variable - missing '}}'`
				: `Unclosed tag - missing '%}'`,
			line: state.line,
			column: state.column,
		});
		return;
	}

	const char = state.input[state.pos];
	const startLine = state.line;
	const startColumn = state.column;

	// String literal
	if (char === '"' || char === "'") {
		tokenizeString(state);
		return;
	}

	// Number literal
	if (isDigit(char) || (char === '-' && isDigit(state.input[state.pos + 1]))) {
		tokenizeNumber(state);
		return;
	}

	// Multi-character operators (check these first)
	if (lookAhead(state, '==')) {
		state.tokens.push({ type: 'op_eq', value: '==', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '!=')) {
		state.tokens.push({ type: 'op_neq', value: '!=', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '>=')) {
		state.tokens.push({ type: 'op_gte', value: '>=', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '<=')) {
		state.tokens.push({ type: 'op_lte', value: '<=', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '&&')) {
		state.tokens.push({ type: 'op_and', value: '&&', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '||')) {
		state.tokens.push({ type: 'op_or', value: '||', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '??')) {
		state.tokens.push({ type: 'op_nullish', value: '??', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}
	if (lookAhead(state, '=>')) {
		state.tokens.push({ type: 'arrow', value: '=>', line: startLine, column: startColumn });
		advance(state, 2);
		return;
	}

	// Single-character operators and punctuation
	switch (char) {
		case '>':
			state.tokens.push({ type: 'op_gt', value: '>', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '<':
			state.tokens.push({ type: 'op_lt', value: '<', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '!':
			state.tokens.push({ type: 'op_not', value: '!', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '=':
			state.tokens.push({ type: 'op_assign', value: '=', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '|':
			state.tokens.push({ type: 'pipe', value: '|', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '(':
			state.tokens.push({ type: 'lparen', value: '(', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case ')':
			state.tokens.push({ type: 'rparen', value: ')', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '[':
			state.tokens.push({ type: 'lbracket', value: '[', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case ']':
			state.tokens.push({ type: 'rbracket', value: ']', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case ':':
			state.tokens.push({ type: 'colon', value: ':', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case ',':
			state.tokens.push({ type: 'comma', value: ',', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '.':
			state.tokens.push({ type: 'dot', value: '.', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '*':
			state.tokens.push({ type: 'star', value: '*', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '/':
			state.tokens.push({ type: 'slash', value: '/', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '{':
			state.tokens.push({ type: 'lbrace', value: '{', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '}':
			state.tokens.push({ type: 'rbrace', value: '}', line: startLine, column: startColumn });
			advanceChar(state);
			return;
		case '$':
			state.tokens.push({ type: 'dollar', value: '$', line: startLine, column: startColumn });
			advanceChar(state);
			return;
	}

	// Identifier or keyword
	if (isIdentifierStart(char)) {
		tokenizeIdentifier(state);
		return;
	}

	// Backslash starts an escaped argument (like \", \" in filter arguments)
	if (char === '\\') {
		tokenizeEscapedArgument(state);
		return;
	}

	// Unknown character - skip and report error
	state.errors.push({
		message: `Unexpected character '${char}' in template`,
		line: state.line,
		column: state.column,
	});
	advanceChar(state);
}

// ============================================================================
// Literal Tokenization
// ============================================================================

function tokenizeString(state: TokenizerState): void {
	const quote = state.input[state.pos];
	const startLine = state.line;
	const startColumn = state.column;
	let value = '';

	advanceChar(state); // Skip opening quote

	while (state.pos < state.input.length) {
		const char = state.input[state.pos];
		const nextChar = state.input[state.pos + 1] || '';

		if (char === quote) {
			advanceChar(state); // Skip closing quote
			state.tokens.push({
				type: 'string',
				value,
				line: startLine,
				column: startColumn,
			});
			return;
		}

		// Check for }} or %} inside string - likely a missing closing quote
		if ((char === '}' && nextChar === '}') || (char === '%' && nextChar === '}')) {
			state.errors.push({
				message: `Unclosed string - missing ${quote} before ${char}${nextChar}`,
				line: startLine,
				column: startColumn,
			});
			// Emit the partial string and let the tokenizer continue
			state.tokens.push({
				type: 'string',
				value,
				line: startLine,
				column: startColumn,
			});
			return;
		}

		if (char === '\\' && state.pos + 1 < state.input.length) {
			// Escape sequence
			advanceChar(state);
			const escaped = state.input[state.pos];
			switch (escaped) {
				case 'n': value += '\n'; break;
				case 't': value += '\t'; break;
				case 'r': value += '\r'; break;
				case '\\': value += '\\'; break;
				case '"': value += '"'; break;
				case "'": value += "'"; break;
				default: value += escaped;
			}
			advanceChar(state);
			continue;
		}

		value += char;
		advanceChar(state);
	}

	// Unterminated string
	state.errors.push({
		message: `Unclosed string - missing closing ${quote}`,
		line: startLine,
		column: startColumn,
	});
	state.tokens.push({
		type: 'string',
		value,
		line: startLine,
		column: startColumn,
	});
}

/**
 * Tokenize an escaped argument like \", \" in filter arguments.
 * These start with a backslash and continue until a delimiter (|, }}, %}).
 * Escape sequences are processed: \\ -> \, \" -> ", etc.
 */
function tokenizeEscapedArgument(state: TokenizerState): void {
	const startLine = state.line;
	const startColumn = state.column;
	let value = '';

	while (state.pos < state.input.length) {
		const char = state.input[state.pos];
		const nextChar = state.input[state.pos + 1] || '';

		// Check for end delimiters (not escaped)
		if (char === '|' || char === '%' || char === '}' || char === ')') {
			break;
		}
		if (char === '+' && (nextChar === '%' || nextChar === '}')) {
			break;
		}

		// Handle escape sequences
		if (char === '\\' && state.pos + 1 < state.input.length) {
			const escaped = state.input[state.pos + 1];
			switch (escaped) {
				case '"': value += '"'; break;
				case "'": value += "'"; break;
				case '\\': value += '\\'; break;
				case 'n': value += '\n'; break;
				case 't': value += '\t'; break;
				case 'r': value += '\r'; break;
				case ',': value += ','; break;
				case '|': value += '|'; break;
				default: value += escaped; // Unknown escape, just use the character
			}
			advanceChar(state);
			advanceChar(state);
			continue;
		}

		value += char;
		advanceChar(state);
	}

	state.tokens.push({
		type: 'string',
		value,
		line: startLine,
		column: startColumn,
	});
}

function tokenizeNumber(state: TokenizerState): void {
	const startLine = state.line;
	const startColumn = state.column;
	let value = '';

	// Optional negative sign
	if (state.input[state.pos] === '-') {
		value += '-';
		advanceChar(state);
	}

	// Integer part
	while (state.pos < state.input.length && isDigit(state.input[state.pos])) {
		value += state.input[state.pos];
		advanceChar(state);
	}

	// Decimal part
	if (state.pos < state.input.length && state.input[state.pos] === '.') {
		value += '.';
		advanceChar(state);
		while (state.pos < state.input.length && isDigit(state.input[state.pos])) {
			value += state.input[state.pos];
			advanceChar(state);
		}
	}

	state.tokens.push({
		type: 'number',
		value,
		line: startLine,
		column: startColumn,
	});
}

function tokenizeIdentifier(state: TokenizerState): void {
	const startLine = state.line;
	const startColumn = state.column;
	let value = '';

	while (state.pos < state.input.length && isIdentifierChar(state.input[state.pos])) {
		value += state.input[state.pos];
		advanceChar(state);
	}

	// Special handling for CSS selectors (selector: and selectorHtml: prefixes)
	// These can contain brackets, quotes, and other special characters
	// Check if we have "selector" or "selectorHtml" followed by ":"
	if ((value === 'selector' || value === 'selectorHtml') &&
		state.pos < state.input.length && state.input[state.pos] === ':') {
		// Consume the colon
		value += ':';
		advanceChar(state);
		// Continue reading the CSS selector
		value = tokenizeCssSelector(state, value);
	}

	// Check if it's a keyword
	const lowerValue = value.toLowerCase();
	const keywordType = KEYWORDS[lowerValue];

	if (keywordType) {
		state.tokens.push({
			type: keywordType,
			value,
			line: startLine,
			column: startColumn,
		});
	} else {
		state.tokens.push({
			type: 'identifier',
			value,
			line: startLine,
			column: startColumn,
		});
	}
}

/**
 * Continue tokenizing a CSS selector after the selector: or selectorHtml: prefix.
 * CSS selectors can contain:
 * - Spaces (descendant combinator)
 * - Combinators: +, >, ~
 * - Brackets for attribute selectors: [attr="value"]
 * - Parentheses for pseudo-classes: :nth-child(2)
 * - Quotes inside attribute selectors
 *
 * We only stop at actual template delimiters: |, }}, %}, -}}, -%}
 */
function tokenizeCssSelector(state: TokenizerState, value: string): string {
	let bracketDepth = 0;
	let parenDepth = 0;
	let inString: string | null = null; // Track if we're inside a string and what quote char

	while (state.pos < state.input.length) {
		const char = state.input[state.pos];
		const nextChar = state.input[state.pos + 1] || '';

		// Check for end of tag/variable (but not inside brackets, parens, or strings)
		if (!inString && bracketDepth === 0 && parenDepth === 0) {
			// Stop at pipe (filter) or tag/variable end markers
			if (char === '|') {
				break;
			}
			if (char === '%' && nextChar === '}') {
				break;
			}
			if (char === '}' && nextChar === '}') {
				break;
			}
			if (char === '-' && nextChar === '%') {
				break;
			}
			if (char === '-' && nextChar === '}') {
				break;
			}
			// Stop at lone } (likely malformed tag ending)
			// This prevents consuming } as part of the selector
			if (char === '}' && nextChar !== '}') {
				break;
			}
		}

		// Detect unclosed brackets/parens/strings when hitting end delimiters
		// This catches cases like: selector:p[attr='value'|filter}} (missing ])
		if ((char === '}' && nextChar === '}') || (char === '%' && nextChar === '}')) {
			if (inString) {
				state.errors.push({
					message: `Unclosed string in selector - missing closing ${inString}`,
					line: state.line,
					column: state.column,
				});
				break;
			}
			if (bracketDepth > 0) {
				state.errors.push({
					message: `Unclosed '[' in selector - missing ']'`,
					line: state.line,
					column: state.column,
				});
				break;
			}
			if (parenDepth > 0) {
				state.errors.push({
					message: `Unclosed '(' in selector - missing ')'`,
					line: state.line,
					column: state.column,
				});
				break;
			}
		}

		// Handle escaped quotes outside strings (e.g., [attr=\"value\"])
		// The backslash-quote should not start a string
		if (!inString && char === '\\' && (nextChar === '"' || nextChar === "'")) {
			value += char;
			advanceChar(state);
			value += state.input[state.pos];
			advanceChar(state);
			continue;
		}

		// Handle string quotes in CSS attribute selectors
		if (!inString && (char === '"' || char === "'")) {
			inString = char;
			value += char;
			advanceChar(state);
			continue;
		}

		if (inString && char === inString) {
			inString = null;
			value += char;
			advanceChar(state);
			continue;
		}

		// Handle escape sequences in strings
		if (inString && char === '\\' && state.pos + 1 < state.input.length) {
			value += char;
			advanceChar(state);
			value += state.input[state.pos];
			advanceChar(state);
			continue;
		}

		// Track bracket and paren depth (but not inside strings)
		if (!inString) {
			if (char === '[') {
				bracketDepth++;
			} else if (char === ']') {
				bracketDepth--;
				if (bracketDepth < 0) {
					state.errors.push({
						message: `Extra ']' in selector - no matching '['`,
						line: state.line,
						column: state.column,
					});
					bracketDepth = 0; // Reset to prevent cascading
				}
			} else if (char === '(') {
				parenDepth++;
			} else if (char === ')') {
				parenDepth--;
				if (parenDepth < 0) {
					state.errors.push({
						message: `Extra ')' in selector - no matching '('`,
						line: state.line,
						column: state.column,
					});
					parenDepth = 0; // Reset to prevent cascading
				}
			}
		}

		value += char;
		advanceChar(state);
	}

	// Trim trailing whitespace from the selector
	return value.trimEnd();
}

// ============================================================================
// Helper Functions
// ============================================================================

function lookAhead(state: TokenizerState, str: string): boolean {
	return state.input.slice(state.pos, state.pos + str.length) === str;
}

function advance(state: TokenizerState, count: number): void {
	for (let i = 0; i < count; i++) {
		advanceChar(state);
	}
}

function advanceChar(state: TokenizerState): void {
	if (state.pos < state.input.length) {
		if (state.input[state.pos] === '\n') {
			state.line++;
			state.column = 1;
		} else {
			state.column++;
		}
		state.pos++;
	}
}

function skipWhitespace(state: TokenizerState): void {
	while (state.pos < state.input.length && isWhitespace(state.input[state.pos])) {
		advanceChar(state);
	}
}

function isWhitespace(char: string): boolean {
	return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isDigit(char: string): boolean {
	return char >= '0' && char <= '9';
}

function isIdentifierStart(char: string): boolean {
	return (char >= 'a' && char <= 'z') ||
		   (char >= 'A' && char <= 'Z') ||
		   char === '_' ||
		   char === '@';  // For schema:@Type
}

function isIdentifierChar(char: string): boolean {
	return isIdentifierStart(char) ||
		   isDigit(char) ||
		   char === '-' ||  // For kebab-case
		   char === '.';    // For nested properties like author.name
}

// ============================================================================
// Utility Functions for Consumers
// ============================================================================

/**
 * Format a token for debugging/display
 */
export function formatToken(token: Token): string {
	const pos = `${token.line}:${token.column}`;
	if (token.value) {
		return `${token.type}(${JSON.stringify(token.value)}) at ${pos}`;
	}
	return `${token.type} at ${pos}`;
}

/**
 * Format an error message with position
 */
export function formatError(error: TokenizerError): string {
	return `Error at line ${error.line}, column ${error.column}: ${error.message}`;
}
