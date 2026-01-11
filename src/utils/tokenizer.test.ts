import { describe, test, expect } from 'vitest';
import { tokenize, Token, TokenType } from './tokenizer';

// Helper functions
function getTypes(tokens: Token[]): TokenType[] {
	return tokens.map(t => t.type);
}

function containsTokenTypes(tokens: Token[], expected: TokenType[]): boolean {
	const types = tokens.map((t: Token) => t.type);
	return expected.every(type => types.includes(type));
}

describe('Tokenizer', () => {
	describe('Text Content', () => {
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
	});

	describe('Variables', () => {
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
			const result = tokenize('{{ title }}');
			expect(result.errors).toHaveLength(0);
			expect(result.tokens[0].trimLeft).toBe(false);
			expect(result.tokens[2].trimRight).toBe(false);
		});

		test('tokenizes nested property access', () => {
			const result = tokenize('{{author.name}}');
			expect(result.errors).toHaveLength(0);
			expect(result.tokens[1].type).toBe('identifier');
			expect(result.tokens[1].value).toBe('author.name');
		});
	});

	describe('Logic Tags', () => {
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
			const result = tokenize('{% if x %}');
			expect(result.errors).toHaveLength(0);
			expect(result.tokens[0].trimLeft).toBe(false);
			expect(result.tokens[3].trimRight).toBe(true);
		});
	});

	describe('Comparison Operators', () => {
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
	});

	describe('Logical Operators', () => {
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
	});

	describe('Literals', () => {
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
	});

	describe('Punctuation', () => {
		test('tokenizes parentheses', () => {
			const result = tokenize('{% if (x or y) and z %}');
			expect(result.errors).toHaveLength(0);
			expect(containsTokenTypes(result.tokens, ['lparen', 'rparen'])).toBe(true);
		});

		test('tokenizes filter with colon argument', () => {
			const result = tokenize('{{title|truncate:100}}');
			expect(result.errors).toHaveLength(0);
			expect(containsTokenTypes(result.tokens, ['colon', 'number'])).toBe(true);
		});
	});

	describe('Position Tracking', () => {
		test('tracks line and column numbers', () => {
			const result = tokenize('line1\n{{x}}');
			expect(result.errors).toHaveLength(0);

			const varStart = result.tokens.find(t => t.type === 'variable_start');
			expect(varStart?.line).toBe(2);
			expect(varStart?.column).toBe(1);
		});

		test('tracks position across multiline template', () => {
			const result = tokenize('{% if x %}\nyes\n{% endif %}');
			expect(result.errors).toHaveLength(0);

			const endif = result.tokens.find(t => t.type === 'keyword_endif');
			expect(endif?.line).toBe(3);
		});
	});

	describe('Complex Templates', () => {
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
			const identifier = result.tokens.find(t => t.type === 'identifier');
			expect(identifier?.value).toBe('schema');
		});

		test('tokenizes selector variable', () => {
			const result = tokenize('{% for item in selector:.comment %}');
			expect(result.errors).toHaveLength(0);
			const identifier = result.tokens.find(t => t.type === 'identifier' && t.value.startsWith('selector:'));
			expect(identifier?.value).toBe('selector:.comment');
		});

		test('tokenizes selector with attribute brackets', () => {
			const result = tokenize('{% set comments = selector:div[slot="comment"] %}');
			expect(result.errors).toHaveLength(0);
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
			expect(containsTokenTypes(result.tokens, ['pipe', 'identifier'])).toBe(true);
		});
	});

	describe('Filter Arguments with Empty String', () => {
		test('tokenizes filter with empty string argument', () => {
			const result = tokenize('{{"test"|replace:"%":""}}');
			expect(result.errors).toHaveLength(0);
			expect(containsTokenTypes(result.tokens, [
				'variable_start', 'string', 'pipe', 'identifier', 'colon', 'string', 'colon', 'string', 'variable_end'
			])).toBe(true);
			const stringTokens = result.tokens.filter(t => t.type === 'string');
			expect(stringTokens).toHaveLength(3);
			expect(stringTokens[0].value).toBe('test');
			expect(stringTokens[1].value).toBe('%');
			expect(stringTokens[2].value).toBe('');
		});

		test('tokenizes string with spaces and empty string argument', () => {
			const result = tokenize('{{"cacao percentage of this chocolate"|replace:"%":""}}');
			expect(result.errors).toHaveLength(0);
			const stringTokens = result.tokens.filter(t => t.type === 'string');
			expect(stringTokens).toHaveLength(3);
			expect(stringTokens[0].value).toBe('cacao percentage of this chocolate');
			expect(stringTokens[1].value).toBe('%');
			expect(stringTokens[2].value).toBe('');
		});

		test('handles curly quotes as unexpected characters', () => {
			const input = '{{\u201Ctest\u201D}}';
			const result = tokenize(input);
			expect(result.errors.length).toBe(2);
			expect(result.errors[0].message.includes('Unexpected character')).toBe(true);
		});
	});

	describe('Error Handling', () => {
		test('reports unterminated string', () => {
			const result = tokenize('{% set x = "unterminated %}');
			expect(result.errors.length).toBeGreaterThan(0);
			const hasUnterminatedError = result.errors.some(e => e.message.includes('Unclosed string'));
			expect(hasUnterminatedError).toBe(true);
		});
	});
});
