import { describe, test, expect } from 'vitest';
import { nth, validateNthParams } from './nth';
import { render } from '../renderer';
import { applyFilters } from '../filters';
import { parse, validateFilters, FilterExpression, LiteralExpression, VariableNode } from '../parser';

describe('nth filter', () => {
	test('keeps nth element (1-based)', () => {
		const result = nth('["a","b","c","d","e"]', '3');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['c']);
	});

	test('keeps every nth element', () => {
		const result = nth('["a","b","c","d","e","f"]', '2n');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['b', 'd', 'f']);
	});

	test('keeps nth and following (n+offset)', () => {
		const result = nth('["a","b","c","d","e"]', 'n+3');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['c', 'd', 'e']);
	});

	test('handles group pattern', () => {
		const result = nth('[1,2,3,4,5,6,7,8,9,10]', '1,2,3:5');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([1, 2, 3, 6, 7, 8]);
	});

	test('handles empty array', () => {
		const result = nth('[]', '3');
		expect(result).toBe('[]');
	});

	test('returns original for non-JSON', () => {
		expect(nth('hello', '3')).toBe('hello');
	});
});

describe('nth param validation', () => {
	test('no param is valid (optional)', () => {
		expect(validateNthParams(undefined).valid).toBe(true);
	});

	test('valid params return valid', () => {
		expect(validateNthParams('3').valid).toBe(true);
		expect(validateNthParams('5n').valid).toBe(true);
		expect(validateNthParams('n+7').valid).toBe(true);
		expect(validateNthParams('1,2,3:5').valid).toBe(true);
	});

	test('invalid syntax returns error', () => {
		const result = validateNthParams('abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('invalid syntax');
	});

	test('invalid basis pattern returns error', () => {
		const result = validateNthParams('1,2:abc');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('basis');
	});

	test('parses 2n pattern as single arg', () => {
		const result = parse('{{items|nth:2n}}');
		expect(result.errors).toHaveLength(0);

		const varNode = result.ast[0] as VariableNode;
		const filterExpr = varNode.expression as FilterExpression;
		expect(filterExpr.name).toBe('nth');
		expect(filterExpr.args).toHaveLength(1);
		expect((filterExpr.args[0] as LiteralExpression).value).toBe('2n');
	});

	test('parses group pattern as two args', () => {
		const result = parse('{{items|nth:2,3:4}}');
		expect(result.errors).toHaveLength(0);

		const varNode = result.ast[0] as VariableNode;
		const filterExpr = varNode.expression as FilterExpression;
		expect(filterExpr.name).toBe('nth');
		expect(filterExpr.args).toHaveLength(2);
		expect((filterExpr.args[0] as LiteralExpression).value).toBe(2);
		expect((filterExpr.args[1] as LiteralExpression).value).toBe('3:4');
	});

	test('validates nth:2n without errors', () => {
		const result = parse('{{items|nth:2n}}');
		expect(result.errors).toHaveLength(0);
		const filterWarnings = validateFilters(result.ast);
		expect(filterWarnings).toHaveLength(0);
	});

	test('validates nth:2,3:4 without errors', () => {
		const result = parse('{{items|nth:2,3:4}}');
		expect(result.errors).toHaveLength(0);
		const filterWarnings = validateFilters(result.ast);
		expect(filterWarnings).toHaveLength(0);
	});
});

describe('nth filter via renderer', () => {
	const createContext = (variables: Record<string, any> = {}) => ({
		variables,
		currentUrl: 'https://example.com',
		applyFilters,
	});

	test('nth:2 gets single element through template', async () => {
		const ctx = createContext({ msg: '["a","b","c","d","e"]' });
		const result = await render('{{msg|nth:2}}', ctx);
		expect(result.errors).toHaveLength(0);
		expect(result.output).toBe('["b"]');
	});

	test('nth:2n gets every 2nd element through template', async () => {
		const ctx = createContext({ msg: '["a","b","c","d","e","f"]' });
		const result = await render('{{msg|nth:2n}}', ctx);
		expect(result.errors).toHaveLength(0);
		const parsed = JSON.parse(result.output);
		expect(parsed).toEqual(['b', 'd', 'f']);
	});

	test('nth:2,3:4 gets positions 2,3 from each group of 4 through template', async () => {
		const ctx = createContext({ msg: '[1,2,3,4,5,6,7,8]' });
		const result = await render('{{msg|nth:2,3:4}}', ctx);
		expect(result.errors).toHaveLength(0);
		const parsed = JSON.parse(result.output);
		expect(parsed).toEqual([2, 3, 6, 7]);
	});
});

