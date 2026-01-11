// Tokenizer tests
// Run with: npx ts-node src/utils/tokenizer.test.ts

import { tokenize, formatToken, formatError, Token, TokenType } from './tokenizer';

// ============================================================================
// Test Utilities
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
	try {
		fn();
		passed++;
		console.log(`✓ ${name}`);
	} catch (error) {
		failed++;
		console.log(`✗ ${name}`);
		console.log(`  ${error}`);
	}
}

function expect(actual: any) {
	return {
		toBe(expected: any) {
			if (actual !== expected) {
				throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
			}
		},
		toEqual(expected: any) {
			const actualStr = JSON.stringify(actual);
			const expectedStr = JSON.stringify(expected);
			if (actualStr !== expectedStr) {
				throw new Error(`Expected ${expectedStr}, got ${actualStr}`);
			}
		},
		toHaveLength(expected: number) {
			if (actual.length !== expected) {
				throw new Error(`Expected length ${expected}, got ${actual.length}`);
			}
		},
		toContainTokenTypes(expected: TokenType[]) {
			const types = actual.map((t: Token) => t.type);
			for (const type of expected) {
				if (!types.includes(type)) {
					throw new Error(`Expected token type ${type} not found in ${JSON.stringify(types)}`);
				}
			}
		}
	};
}

function getTypes(tokens: Token[]): TokenType[] {
	return tokens.map(t => t.type);
}

function getValues(tokens: Token[]): string[] {
	return tokens.map(t => t.value);
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n=== Tokenizer Tests ===\n');

// --- Text Content ---

test('tokenizes plain text', () => {
	const result = tokenize('Hello, world!');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens).toHaveLength(2); // text + eof
	expect(result.tokens[0].type).toBe('text');
	expect(result.tokens[0].value).toBe('Hello, world!');
});

test('tokenizes empty string', () => {
	const result = tokenize('');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens).toHaveLength(1); // just eof
	expect(result.tokens[0].type).toBe('eof');
});

// --- Variables ---

test('tokenizes simple variable', () => {
	const result = tokenize('{{title}}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['variable_start', 'identifier', 'variable_end', 'eof']);
	expect(result.tokens[1].value).toBe('title');
});

test('tokenizes variable with filter', () => {
	const result = tokenize('{{title|lower}}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['variable_start', 'identifier', 'pipe', 'identifier', 'variable_end', 'eof']);
});

test('tokenizes variable with whitespace', () => {
	const result = tokenize('{{ title | lower }}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['variable_start', 'identifier', 'pipe', 'identifier', 'variable_end', 'eof']);
});

test('tokenizes variable whitespace control', () => {
	// Variables preserve whitespace by default (unlike tags)
	const result = tokenize('{{ title }}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[0].trimLeft).toBe(false);
	expect(result.tokens[2].trimRight).toBe(false);
});

test('tokenizes nested property access', () => {
	const result = tokenize('{{author.name}}');
	expect(result.errors).toHaveLength(0);
	// author.name is treated as a single identifier due to the . being part of identifier chars
	expect(result.tokens[1].type).toBe('identifier');
	expect(result.tokens[1].value).toBe('author.name');
});

// --- Logic Tags ---

test('tokenizes if tag', () => {
	const result = tokenize('{% if title %}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['tag_start', 'keyword_if', 'identifier', 'tag_end', 'eof']);
});

test('tokenizes if-else-endif', () => {
	const result = tokenize('{% if x %}yes{% else %}no{% endif %}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual([
		'tag_start', 'keyword_if', 'identifier', 'tag_end',
		'text',
		'tag_start', 'keyword_else', 'tag_end',
		'text',
		'tag_start', 'keyword_endif', 'tag_end',
		'eof'
	]);
});

test('tokenizes for loop', () => {
	const result = tokenize('{% for item in items %}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['tag_start', 'keyword_for', 'identifier', 'keyword_in', 'identifier', 'tag_end', 'eof']);
});

test('tokenizes set tag', () => {
	const result = tokenize('{% set name = "John" %}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['tag_start', 'keyword_set', 'identifier', 'op_assign', 'string', 'tag_end', 'eof']);
	expect(result.tokens[4].value).toBe('John');
});

test('tokenizes tag with whitespace trimming', () => {
	// Tags trim whitespace after (trimRight) but preserve before (trimLeft)
	const result = tokenize('{% if x %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[0].trimLeft).toBe(false);  // Preserve whitespace before
	expect(result.tokens[3].trimRight).toBe(true);   // Trim whitespace after
});

// --- Comparison Operators ---

test('tokenizes equality operator', () => {
	const result = tokenize('{% if x == 5 %}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['tag_start', 'keyword_if', 'identifier', 'op_eq', 'number', 'tag_end', 'eof']);
});

test('tokenizes not-equal operator', () => {
	const result = tokenize('{% if x != 5 %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[3].type).toBe('op_neq');
});

test('tokenizes comparison operators', () => {
	const ops = ['>', '<', '>=', '<='];
	const expectedTypes: TokenType[] = ['op_gt', 'op_lt', 'op_gte', 'op_lte'];

	ops.forEach((op, i) => {
		const result = tokenize(`{% if x ${op} 5 %}`);
		expect(result.errors).toHaveLength(0);
		expect(result.tokens[3].type).toBe(expectedTypes[i]);
	});
});

test('tokenizes contains operator', () => {
	const result = tokenize('{% if title contains "test" %}');
	expect(result.errors).toHaveLength(0);
	const types = getTypes(result.tokens);
	expect(types).toEqual(['tag_start', 'keyword_if', 'identifier', 'op_contains', 'string', 'tag_end', 'eof']);
});

// --- Logical Operators ---

test('tokenizes and operator (word)', () => {
	const result = tokenize('{% if x and y %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[3].type).toBe('op_and');
});

test('tokenizes and operator (symbol)', () => {
	const result = tokenize('{% if x && y %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[3].type).toBe('op_and');
});

test('tokenizes or operator (word)', () => {
	const result = tokenize('{% if x or y %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[3].type).toBe('op_or');
});

test('tokenizes or operator (symbol)', () => {
	const result = tokenize('{% if x || y %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[3].type).toBe('op_or');
});

test('tokenizes not operator (word)', () => {
	const result = tokenize('{% if not x %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[2].type).toBe('op_not');
});

test('tokenizes not operator (symbol)', () => {
	const result = tokenize('{% if !x %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[2].type).toBe('op_not');
});

// --- Literals ---

test('tokenizes string literals with double quotes', () => {
	const result = tokenize('{% set x = "hello world" %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].type).toBe('string');
	expect(result.tokens[4].value).toBe('hello world');
});

test('tokenizes string literals with single quotes', () => {
	const result = tokenize("{% set x = 'hello world' %}");
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].type).toBe('string');
	expect(result.tokens[4].value).toBe('hello world');
});

test('tokenizes string with escape sequences', () => {
	const result = tokenize('{% set x = "line1\\nline2" %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].value).toBe('line1\nline2');
});

test('tokenizes integer numbers', () => {
	const result = tokenize('{% if x == 42 %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].type).toBe('number');
	expect(result.tokens[4].value).toBe('42');
});

test('tokenizes decimal numbers', () => {
	const result = tokenize('{% if x == 3.14 %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].type).toBe('number');
	expect(result.tokens[4].value).toBe('3.14');
});

test('tokenizes negative numbers', () => {
	const result = tokenize('{% if x == -5 %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].type).toBe('number');
	expect(result.tokens[4].value).toBe('-5');
});

test('tokenizes boolean true', () => {
	const result = tokenize('{% if true %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[2].type).toBe('boolean');
	expect(result.tokens[2].value).toBe('true');
});

test('tokenizes boolean false', () => {
	const result = tokenize('{% if false %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[2].type).toBe('boolean');
	expect(result.tokens[2].value).toBe('false');
});

test('tokenizes null', () => {
	const result = tokenize('{% if x == null %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens[4].type).toBe('null');
});

// --- Punctuation ---

test('tokenizes parentheses', () => {
	const result = tokenize('{% if (x or y) and z %}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens).toContainTokenTypes(['lparen', 'rparen']);
});

test('tokenizes filter with colon argument', () => {
	const result = tokenize('{{title|truncate:100}}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens).toContainTokenTypes(['colon', 'number']);
});

// --- Position Tracking ---

test('tracks line and column numbers', () => {
	const result = tokenize('line1\n{{x}}');
	expect(result.errors).toHaveLength(0);

	// The variable start {{ is on line 2, column 1
	const varStart = result.tokens.find(t => t.type === 'variable_start');
	expect(varStart?.line).toBe(2);
	expect(varStart?.column).toBe(1);
});

test('tracks position across multiline template', () => {
	const result = tokenize('{% if x %}\nyes\n{% endif %}');
	expect(result.errors).toHaveLength(0);

	// endif should be on line 3
	const endif = result.tokens.find(t => t.type === 'keyword_endif');
	expect(endif?.line).toBe(3);
});

// --- Complex Templates ---

test('tokenizes mixed content', () => {
	const result = tokenize('Hello {{name}}, you have {{count}} items.');
	expect(result.errors).toHaveLength(0);

	const types = getTypes(result.tokens);
	expect(types).toEqual([
		'text',
		'variable_start', 'identifier', 'variable_end',
		'text',
		'variable_start', 'identifier', 'variable_end',
		'text',
		'eof'
	]);
});

test('tokenizes schema variable', () => {
	const result = tokenize('{{schema:@Article:author}}');
	expect(result.errors).toHaveLength(0);
	// schema:@Article:author contains special chars but should be one identifier
	const identifier = result.tokens.find(t => t.type === 'identifier');
	expect(identifier?.value).toBe('schema');
});

test('tokenizes selector variable', () => {
	const result = tokenize('{% for item in selector:.comment %}');
	expect(result.errors).toHaveLength(0);
	// selector:.comment should be parsed as a single identifier
	const identifier = result.tokens.find(t => t.type === 'identifier' && t.value.startsWith('selector:'));
	expect(identifier?.value).toBe('selector:.comment');
});

test('tokenizes selector with attribute brackets', () => {
	const result = tokenize('{% set comments = selector:div[slot="comment"] %}');
	expect(result.errors).toHaveLength(0);
	// The CSS selector should be parsed as a single identifier including brackets
	const identifier = result.tokens.find(t => t.type === 'identifier' && t.value.startsWith('selector:'));
	expect(identifier?.value).toBe('selector:div[slot="comment"]');
});

test('tokenizes selector with pseudo-class', () => {
	const result = tokenize('{{selector:article.post:first-child}}');
	expect(result.errors).toHaveLength(0);
	const identifier = result.tokens.find(t => t.type === 'identifier' && t.value.startsWith('selector:'));
	expect(identifier?.value).toBe('selector:article.post:first-child');
});

test('tokenizes selector with nested brackets', () => {
	const result = tokenize('{{selector:div[data-type="content"][class*="highlight"]}}');
	expect(result.errors).toHaveLength(0);
	const identifier = result.tokens.find(t => t.type === 'identifier' && t.value.startsWith('selector:'));
	expect(identifier?.value).toBe('selector:div[data-type="content"][class*="highlight"]');
});

test('tokenizes selectorHtml with brackets', () => {
	const result = tokenize('{{selectorHtml:div[data-type="content"]|trim}}');
	expect(result.errors).toHaveLength(0);
	const identifier = result.tokens.find(t => t.type === 'identifier' && t.value.startsWith('selectorHtml:'));
	expect(identifier?.value).toBe('selectorHtml:div[data-type="content"]');
	// Should also have the filter
	expect(result.tokens).toContainTokenTypes(['pipe', 'identifier']);
});

// --- Filter Arguments with Empty String ---

test('tokenizes filter with empty string argument', () => {
	const result = tokenize('{{"test"|replace:"%":""}}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens).toContainTokenTypes([
		'variable_start', 'string', 'pipe', 'identifier', 'colon', 'string', 'colon', 'string', 'variable_end'
	]);
	// Verify the empty string token
	const stringTokens = result.tokens.filter(t => t.type === 'string');
	expect(stringTokens).toHaveLength(3);
	expect(stringTokens[0].value).toBe('test');
	expect(stringTokens[1].value).toBe('%');
	expect(stringTokens[2].value).toBe(''); // Empty string
});

test('tokenizes string with spaces and empty string argument', () => {
	const result = tokenize('{{"cacao percentage of this chocolate"|replace:"%":""}}');
	expect(result.errors).toHaveLength(0);
	expect(result.tokens).toContainTokenTypes([
		'variable_start', 'string', 'pipe', 'identifier', 'colon', 'string', 'colon', 'string', 'variable_end'
	]);
	// Verify the string tokens
	const stringTokens = result.tokens.filter(t => t.type === 'string');
	expect(stringTokens).toHaveLength(3);
	expect(stringTokens[0].value).toBe('cacao percentage of this chocolate');
	expect(stringTokens[1].value).toBe('%');
	expect(stringTokens[2].value).toBe(''); // Empty string
});

test('handles curly quotes as unexpected characters', () => {
	// Curly quotes should not be recognized as string delimiters
	// Use Unicode escape to ensure we get actual curly quotes
	const input = '{{\u201Ctest\u201D}}';
	const result = tokenize(input);
	// This should produce errors because " and " are not valid string delimiters
	expect(result.errors.length).toBe(2);
	expect(result.errors[0].message.includes('Unexpected character')).toBe(true);
});

// --- Error Handling ---

test('reports unterminated string', () => {
	const result = tokenize('{% set x = "unterminated %}');
	expect(result.errors.length > 0).toBe(true);
	const hasUnterminatedError = result.errors.some(e => e.message.includes('Unclosed string'));
	expect(hasUnterminatedError).toBe(true);
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
	process.exit(1);
}
