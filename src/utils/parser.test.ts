import { describe, test, expect } from 'vitest';
import {
	parse,
	ASTNode,
	TextNode,
	VariableNode,
	IfNode,
	ForNode,
	SetNode,
	Expression,
	LiteralExpression,
	IdentifierExpression,
	BinaryExpression,
	UnaryExpression,
	FilterExpression,
} from './parser';

// Type guards
function isTextNode(node: ASTNode): node is TextNode {
	return node.type === 'text';
}

function isVariableNode(node: ASTNode): node is VariableNode {
	return node.type === 'variable';
}

function isIfNode(node: ASTNode): node is IfNode {
	return node.type === 'if';
}

function isForNode(node: ASTNode): node is ForNode {
	return node.type === 'for';
}

function isSetNode(node: ASTNode): node is SetNode {
	return node.type === 'set';
}

function isLiteral(expr: Expression): expr is LiteralExpression {
	return expr.type === 'literal';
}

function isIdentifier(expr: Expression): expr is IdentifierExpression {
	return expr.type === 'identifier';
}

function isBinary(expr: Expression): expr is BinaryExpression {
	return expr.type === 'binary';
}

function isUnary(expr: Expression): expr is UnaryExpression {
	return expr.type === 'unary';
}

function isFilter(expr: Expression): expr is FilterExpression {
	return expr.type === 'filter';
}

describe('Parser', () => {
	describe('Text Content', () => {
		test('parses plain text', () => {
			const result = parse('Hello, world!');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(1);
			expect(isTextNode(result.ast[0])).toBe(true);
			expect((result.ast[0] as TextNode).value).toBe('Hello, world!');
		});

		test('parses empty string', () => {
			const result = parse('');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(0);
		});
	});

	describe('Variables', () => {
		test('parses simple variable', () => {
			const result = parse('{{title}}');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(1);
			expect(isVariableNode(result.ast[0])).toBe(true);

			const varNode = result.ast[0] as VariableNode;
			expect(isIdentifier(varNode.expression)).toBe(true);
			expect((varNode.expression as IdentifierExpression).name).toBe('title');
		});

		test('parses variable with filter', () => {
			const result = parse('{{title|lower}}');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(1);

			const varNode = result.ast[0] as VariableNode;
			expect(isFilter(varNode.expression)).toBe(true);

			const filterExpr = varNode.expression as FilterExpression;
			expect(filterExpr.name).toBe('lower');
			expect(isIdentifier(filterExpr.value)).toBe(true);
		});

		test('parses variable with filter and argument', () => {
			const result = parse('{{title|truncate:100}}');
			expect(result.errors).toHaveLength(0);

			const varNode = result.ast[0] as VariableNode;
			expect(isFilter(varNode.expression)).toBe(true);

			const filterExpr = varNode.expression as FilterExpression;
			expect(filterExpr.name).toBe('truncate');
			expect(filterExpr.args).toHaveLength(1);
			expect(isLiteral(filterExpr.args[0])).toBe(true);
			expect((filterExpr.args[0] as LiteralExpression).value).toBe(100);
		});

		test('parses chained filters', () => {
			const result = parse('{{title|lower|trim}}');
			expect(result.errors).toHaveLength(0);

			const varNode = result.ast[0] as VariableNode;
			expect(isFilter(varNode.expression)).toBe(true);

			const outerFilter = varNode.expression as FilterExpression;
			expect(outerFilter.name).toBe('trim');
			expect(isFilter(outerFilter.value)).toBe(true);

			const innerFilter = outerFilter.value as FilterExpression;
			expect(innerFilter.name).toBe('lower');
		});

		test('parses filter with multiple quoted string pairs', () => {
			// replace:"h":"H","d":"D" should be parsed as 2 args, not 4
			const result = parse('{{title|replace:"h":"H","d":"D"}}');
			expect(result.errors).toHaveLength(0);

			const varNode = result.ast[0] as VariableNode;
			const filterExpr = varNode.expression as FilterExpression;
			expect(filterExpr.name).toBe('replace');
			expect(filterExpr.args).toHaveLength(2);
			// Each arg should be the full "search":"replace" pair
			expect(isLiteral(filterExpr.args[0])).toBe(true);
			expect((filterExpr.args[0] as LiteralExpression).value).toBe('"h":"H"');
			expect(isLiteral(filterExpr.args[1])).toBe(true);
			expect((filterExpr.args[1] as LiteralExpression).value).toBe('"d":"D"');
		});

		test('parses filter with single quoted string pair', () => {
			const result = parse('{{title|replace:"old":"new"}}');
			expect(result.errors).toHaveLength(0);

			const varNode = result.ast[0] as VariableNode;
			const filterExpr = varNode.expression as FilterExpression;
			expect(filterExpr.name).toBe('replace');
			expect(filterExpr.args).toHaveLength(1);
			expect(isLiteral(filterExpr.args[0])).toBe(true);
			expect((filterExpr.args[0] as LiteralExpression).value).toBe('"old":"new"');
		});

		test('parses variable with whitespace control', () => {
			const result = parse('{{ title }}');
			expect(result.errors).toHaveLength(0);
			const varNode = result.ast[0] as VariableNode;
			expect(varNode.trimLeft).toBe(false);
			expect(varNode.trimRight).toBe(false);
		});

		test('parses nested property access', () => {
			const result = parse('{{author.name}}');
			expect(result.errors).toHaveLength(0);

			const varNode = result.ast[0] as VariableNode;
			expect(isIdentifier(varNode.expression)).toBe(true);
			expect((varNode.expression as IdentifierExpression).name).toBe('author.name');
		});
	});

	describe('If Statements', () => {
		test('parses simple if statement', () => {
			const result = parse('{% if title %}has title{% endif %}');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(1);
			expect(isIfNode(result.ast[0])).toBe(true);

			const ifNode = result.ast[0] as IfNode;
			expect(isIdentifier(ifNode.condition)).toBe(true);
			expect(ifNode.consequent).toHaveLength(1);
			expect(ifNode.alternate).toBeNull();
		});

		test('parses if-else statement', () => {
			const result = parse('{% if x %}yes{% else %}no{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(ifNode.consequent).toHaveLength(1);
			expect(ifNode.alternate).toHaveLength(1);
			expect((ifNode.alternate![0] as TextNode).value).toBe('no');
		});

		test('parses if-elseif-else statement', () => {
			const result = parse('{% if a %}A{% elseif b %}B{% else %}C{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(ifNode.elseifs).toHaveLength(1);
			expect(isIdentifier(ifNode.elseifs[0].condition)).toBe(true);
			expect(ifNode.alternate).toHaveLength(1);
		});

		test('parses multiple elseif branches', () => {
			const result = parse('{% if a %}A{% elseif b %}B{% elseif c %}C{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(ifNode.elseifs).toHaveLength(2);
		});

		test('parses if with comparison', () => {
			const result = parse('{% if count > 0 %}positive{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isBinary(ifNode.condition)).toBe(true);

			const condition = ifNode.condition as BinaryExpression;
			expect(condition.operator).toBe('>');
		});

		test('parses if with equality comparison', () => {
			const result = parse('{% if status == "active" %}active{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isBinary(ifNode.condition)).toBe(true);

			const condition = ifNode.condition as BinaryExpression;
			expect(condition.operator).toBe('==');
			expect(isLiteral(condition.right)).toBe(true);
			expect((condition.right as LiteralExpression).value).toBe('active');
		});

		test('parses if with logical and', () => {
			const result = parse('{% if a and b %}both{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isBinary(ifNode.condition)).toBe(true);
			expect((ifNode.condition as BinaryExpression).operator).toBe('and');
		});

		test('parses if with logical or', () => {
			const result = parse('{% if a or b %}either{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isBinary(ifNode.condition)).toBe(true);
			expect((ifNode.condition as BinaryExpression).operator).toBe('or');
		});

		test('parses if with not', () => {
			const result = parse('{% if not hidden %}visible{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isUnary(ifNode.condition)).toBe(true);
			expect((ifNode.condition as UnaryExpression).operator).toBe('not');
		});

		test('parses if with contains', () => {
			const result = parse('{% if title contains "test" %}found{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isBinary(ifNode.condition)).toBe(true);
			expect((ifNode.condition as BinaryExpression).operator).toBe('contains');
		});

		test('parses if with grouped condition', () => {
			const result = parse('{% if (a or b) and c %}match{% endif %}');
			expect(result.errors).toHaveLength(0);

			const ifNode = result.ast[0] as IfNode;
			expect(isBinary(ifNode.condition)).toBe(true);
			expect((ifNode.condition as BinaryExpression).operator).toBe('and');
		});

		test('parses nested if statements', () => {
			const result = parse('{% if a %}{% if b %}nested{% endif %}{% endif %}');
			expect(result.errors).toHaveLength(0);

			const outerIf = result.ast[0] as IfNode;
			expect(outerIf.consequent).toHaveLength(1);
			expect(isIfNode(outerIf.consequent[0])).toBe(true);
		});
	});

	describe('For Loops', () => {
		test('parses simple for loop', () => {
			const result = parse('{% for item in items %}{{item}}{% endfor %}');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(1);
			expect(isForNode(result.ast[0])).toBe(true);

			const forNode = result.ast[0] as ForNode;
			expect(forNode.iterator).toBe('item');
			expect(isIdentifier(forNode.iterable)).toBe(true);
			expect((forNode.iterable as IdentifierExpression).name).toBe('items');
			expect(forNode.body).toHaveLength(1);
		});

		test('parses for loop with schema variable', () => {
			const result = parse('{% for author in schema:author %}{{author}}{% endfor %}');
			expect(result.errors).toHaveLength(0);

			const forNode = result.ast[0] as ForNode;
			expect(isIdentifier(forNode.iterable)).toBe(true);
			const iterable = forNode.iterable as IdentifierExpression;
			expect(iterable.name.startsWith('schema:')).toBe(true);
		});

		test('parses nested for loops', () => {
			const result = parse('{% for a in items %}{% for b in a.children %}{{b}}{% endfor %}{% endfor %}');
			expect(result.errors).toHaveLength(0);

			const outerFor = result.ast[0] as ForNode;
			expect(outerFor.body).toHaveLength(1);
			expect(isForNode(outerFor.body[0])).toBe(true);
		});
	});

	describe('Set Statements', () => {
		test('parses simple set statement', () => {
			const result = parse('{% set name = title %}');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(1);
			expect(isSetNode(result.ast[0])).toBe(true);

			const setNode = result.ast[0] as SetNode;
			expect(setNode.variable).toBe('name');
			expect(isIdentifier(setNode.value)).toBe(true);
		});

		test('parses set with string literal', () => {
			const result = parse('{% set greeting = "Hello" %}');
			expect(result.errors).toHaveLength(0);

			const setNode = result.ast[0] as SetNode;
			expect(isLiteral(setNode.value)).toBe(true);
			expect((setNode.value as LiteralExpression).value).toBe('Hello');
		});

		test('parses set with number literal', () => {
			const result = parse('{% set count = 42 %}');
			expect(result.errors).toHaveLength(0);

			const setNode = result.ast[0] as SetNode;
			expect(isLiteral(setNode.value)).toBe(true);
			expect((setNode.value as LiteralExpression).value).toBe(42);
		});

		test('parses set with filter', () => {
			const result = parse('{% set slug = title|lower %}');
			expect(result.errors).toHaveLength(0);

			const setNode = result.ast[0] as SetNode;
			expect(isFilter(setNode.value)).toBe(true);
			expect((setNode.value as FilterExpression).name).toBe('lower');
		});

		test('parses set with whitespace trimming', () => {
			const result = parse('{% set x = 1 %}');
			expect(result.errors).toHaveLength(0);
			const setNode = result.ast[0] as SetNode;
			expect(setNode.trimLeft).toBe(false);
			expect(setNode.trimRight).toBe(true);
		});
	});

	describe('Mixed Content', () => {
		test('parses mixed text and variables', () => {
			const result = parse('Hello {{name}}, you have {{count}} items.');
			expect(result.errors).toHaveLength(0);
			expect(result.ast).toHaveLength(5);

			expect(isTextNode(result.ast[0])).toBe(true);
			expect(isVariableNode(result.ast[1])).toBe(true);
			expect(isTextNode(result.ast[2])).toBe(true);
			expect(isVariableNode(result.ast[3])).toBe(true);
			expect(isTextNode(result.ast[4])).toBe(true);
		});

		test('parses complex template', () => {
			const template = `
{% set name = author|default:"Anonymous" %}
{% if posts %}
{% for post in posts %}
- {{post.title}} by {{name}}
{% endfor %}
{% else %}
No posts found.
{% endif %}
`;
			const result = parse(template);
			expect(result.ast.length).toBe(5);
			expect(isTextNode(result.ast[0])).toBe(true);
			expect(isSetNode(result.ast[1])).toBe(true);
			expect(isTextNode(result.ast[2])).toBe(true);
			expect(isIfNode(result.ast[3])).toBe(true);
			expect(isTextNode(result.ast[4])).toBe(true);
		});
	});

	describe('Error Handling', () => {
		test('reports error for unclosed if', () => {
			const result = parse('{% if x %}missing endif');
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test('reports error for unclosed for', () => {
			const result = parse('{% for x in items %}missing endfor');
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test('reports error for unexpected endif', () => {
			const result = parse('{% endif %}');
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test('reports error for unexpected endfor', () => {
			const result = parse('{% endfor %}');
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('Position Tracking', () => {
		test('tracks line numbers in AST nodes', () => {
			const result = parse('line1\n{{x}}');
			expect(result.errors).toHaveLength(0);

			const varNode = result.ast[1] as VariableNode;
			expect(varNode.line).toBe(2);
		});
	});

});
