// Template renderer for the Web Clipper template engine
// Evaluates an AST and produces string output
//
// The renderer handles:
// - Variable interpolation with filters
// - Conditional logic (if/elseif/else)
// - Loops (for)
// - Variable assignment (set)
// - Whitespace control

import {
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
	GroupExpression,
	MemberExpression,
	parse,
} from './parser';

// Filter application function type
type ApplyFiltersFn = (value: string, filters: string, currentUrl: string) => string;

// Default filter implementation (just returns value unchanged)
// In the browser extension, this will be replaced with the real implementation
let defaultApplyFilters: ApplyFiltersFn = (value: string) => value;

/**
 * Set the default filter implementation.
 * Call this once at startup with the real applyFilters function.
 */
export function setFilterImplementation(impl: ApplyFiltersFn): void {
	defaultApplyFilters = impl;
}

// ============================================================================
// Render Context
// ============================================================================

/**
 * Function type for resolving variables asynchronously (e.g., selectors)
 */
export type AsyncResolver = (name: string, context: RenderContext) => Promise<any>;

/**
 * Context for rendering templates
 */
export interface RenderContext {
	/** Variables available in the template */
	variables: Record<string, any>;

	/** Current URL for filter processing */
	currentUrl: string;

	/** Tab ID for selector resolution (optional) */
	tabId?: number;

	/** Custom async resolver for special variable types (optional) */
	asyncResolver?: AsyncResolver;

	/** Custom filter functions (optional, merged with built-in filters) */
	filters?: Record<string, (...args: any[]) => any>;

	/** Custom applyFilters implementation (optional, uses default if not provided) */
	applyFilters?: ApplyFiltersFn;
}

/**
 * Options for the render function
 */
export interface RenderOptions {
	/** Whether to trim whitespace from output */
	trimOutput?: boolean;
}

/**
 * Result of rendering
 */
export interface RenderResult {
	output: string;
	errors: RenderError[];
}

export interface RenderError {
	message: string;
	line?: number;
	column?: number;
}

// ============================================================================
// Main Render Function
// ============================================================================

/**
 * Render a template string with the given context.
 *
 * @param template The template string to render
 * @param context The render context with variables
 * @param options Optional render options
 * @returns RenderResult with output and any errors
 */
export async function render(
	template: string,
	context: RenderContext,
	options: RenderOptions = {}
): Promise<RenderResult> {
	const parseResult = parse(template);

	if (parseResult.errors.length > 0) {
		return {
			output: '',
			errors: parseResult.errors.map(e => ({
				message: e.message,
				line: e.line,
				column: e.column,
			})),
		};
	}

	return renderAST(parseResult.ast, context, options);
}

/**
 * Render an AST directly (for when you already have parsed AST).
 */
export async function renderAST(
	ast: ASTNode[],
	context: RenderContext,
	options: RenderOptions = {}
): Promise<RenderResult> {
	const errors: RenderError[] = [];
	const state: RenderState = {
		context,
		errors,
		pendingTrimRight: false,
	};

	let output = '';

	for (let i = 0; i < ast.length; i++) {
		const node = ast[i];

		// Handle trimLeft - trim trailing whitespace from previous output
		// Logic tags always have trimLeft: true
		if ('trimLeft' in node && (node as any).trimLeft && output.length > 0) {
			output = output.replace(/[\t ]*\r?\n?$/, '');
		}

		const nodeOutput = await renderNode(node, state);

		// Handle trimRight - trim leading whitespace from next output
		// Note: Text nodes handle this in renderText, but other nodes might need it here
		if (state.pendingTrimRight && nodeOutput.length > 0) {
			// Trim leading whitespace from this output
			output += nodeOutput.replace(/^[\t ]*\r?\n/, '');
			state.pendingTrimRight = false;
		} else {
			output += nodeOutput;
		}
	}

	if (options.trimOutput) {
		output = output.trim();
	}

	return { output, errors };
}

// ============================================================================
// Render State
// ============================================================================

interface RenderState {
	context: RenderContext;
	errors: RenderError[];
	pendingTrimRight: boolean;
}

// ============================================================================
// Node Rendering
// ============================================================================

async function renderNode(node: ASTNode, state: RenderState): Promise<string> {
	switch (node.type) {
		case 'text':
			return renderText(node, state);
		case 'variable':
			return renderVariable(node, state);
		case 'if':
			return renderIf(node, state);
		case 'for':
			return renderFor(node, state);
		case 'set':
			return renderSet(node, state);
		default:
			state.errors.push({
				message: `Unknown node type: ${(node as any).type}`,
			});
			return '';
	}
}

function renderText(node: TextNode, state: RenderState): string {
	let text = node.value;

	// If previous node had trimRight, trim leading whitespace and newlines
	if (state.pendingTrimRight) {
		text = text.replace(/^[\t ]*\r?\n/, '');
		state.pendingTrimRight = false;
	}

	return text;
}

async function renderVariable(node: VariableNode, state: RenderState): Promise<string> {
	// Handle trimLeft - this affects previous output (handled by caller via pendingTrimRight)
	// For now, we handle trimRight by setting a flag for the next node

	try {
		// Special case: string literals in variable position are prompt placeholders
		// Preserve them as {{"..."}} for the prompt post-processor
		if (node.expression.type === 'literal' && typeof (node.expression as LiteralExpression).value === 'string') {
			const value = (node.expression as LiteralExpression).value as string;
			if (node.trimRight) {
				state.pendingTrimRight = true;
			}
			// Output as quoted string for prompt processing
			return `{{"${value}"}}`;
		}

		const value = await evaluateExpression(node.expression, state);
		const result = valueToString(value);

		if (node.trimRight) {
			state.pendingTrimRight = true;
		}

		return result;
	} catch (error) {
		state.errors.push({
			message: `Error evaluating variable: ${error}`,
			line: node.line,
			column: node.column,
		});
		return '';
	}
}

async function renderIf(node: IfNode, state: RenderState): Promise<string> {
	try {
		// Evaluate main condition
		const conditionValue = await evaluateExpression(node.condition, state);

		if (isTruthy(conditionValue)) {
			const result = await renderNodes(node.consequent, state);
			if (node.trimRight) {
				state.pendingTrimRight = true;
			}
			return result;
		}

		// Check elseif conditions
		for (const elseif of node.elseifs) {
			const elseifValue = await evaluateExpression(elseif.condition, state);
			if (isTruthy(elseifValue)) {
				return renderNodes(elseif.body, state);
			}
		}

		// Fall back to else
		if (node.alternate) {
			return renderNodes(node.alternate, state);
		}

		if (node.trimRight) {
			state.pendingTrimRight = true;
		}

		return '';
	} catch (error) {
		state.errors.push({
			message: `Error evaluating if condition: ${error}`,
			line: node.line,
			column: node.column,
		});
		return '';
	}
}

async function renderFor(node: ForNode, state: RenderState): Promise<string> {
	try {
		const iterableValue = await evaluateExpression(node.iterable, state);

		if (!Array.isArray(iterableValue)) {
			state.errors.push({
				message: `For loop iterable is not an array: ${typeof iterableValue}`,
				line: node.line,
				column: node.column,
			});
			if (node.trimRight) {
				state.pendingTrimRight = true;
			}
			return '';
		}

		const results: string[] = [];
		const length = iterableValue.length;

		for (let i = 0; i < length; i++) {
			const item = iterableValue[i];

			// Create loop object with Twig-compatible properties
			const loop = {
				index: i + 1,       // 1-indexed
				index0: i,          // 0-indexed
				first: i === 0,
				last: i === length - 1,
				length: length,
			};

			// Create new context with loop variables
			const loopContext: RenderContext = {
				...state.context,
				variables: {
					...state.context.variables,
					[node.iterator]: item,
					[`${node.iterator}_index`]: i,  // Keep for backwards compatibility
					loop,
				},
			};

			const loopState: RenderState = {
				...state,
				context: loopContext,
			};

			const itemResult = await renderNodes(node.body, loopState);
			results.push(itemResult.trim());
		}

		if (node.trimRight) {
			state.pendingTrimRight = true;
		}

		return results.join('\n');
	} catch (error) {
		state.errors.push({
			message: `Error in for loop: ${error}`,
			line: node.line,
			column: node.column,
		});
		return '';
	}
}

async function renderSet(node: SetNode, state: RenderState): Promise<string> {
	try {
		const value = await evaluateExpression(node.value, state);

		// Set the variable in the context (mutates the context)
		state.context.variables[node.variable] = value;

		if (node.trimRight) {
			state.pendingTrimRight = true;
		}

		// Set produces no output
		return '';
	} catch (error) {
		state.errors.push({
			message: `Error in set: ${error}`,
			line: node.line,
			column: node.column,
		});
		return '';
	}
}

async function renderNodes(nodes: ASTNode[], state: RenderState): Promise<string> {
	let output = '';

	for (const node of nodes) {
		// Handle trimLeft - trim trailing whitespace from previous output
		if ('trimLeft' in node && (node as any).trimLeft && output.length > 0) {
			output = output.replace(/[\t ]*\r?\n?$/, '');
		}

		const nodeOutput = await renderNode(node, state);

		if (state.pendingTrimRight && nodeOutput.length > 0) {
			output += nodeOutput.replace(/^[\t ]*\r?\n?/, '');
			state.pendingTrimRight = false;
		} else {
			output += nodeOutput;
		}
	}

	return output;
}

// ============================================================================
// Expression Evaluation
// ============================================================================

async function evaluateExpression(expr: Expression, state: RenderState): Promise<any> {
	switch (expr.type) {
		case 'literal':
			return evaluateLiteral(expr);

		case 'identifier':
			return evaluateIdentifier(expr, state);

		case 'binary':
			return evaluateBinary(expr, state);

		case 'unary':
			return evaluateUnary(expr, state);

		case 'filter':
			return evaluateFilter(expr, state);

		case 'group':
			return evaluateExpression(expr.expression, state);

		case 'member':
			return evaluateMember(expr, state);

		default:
			throw new Error(`Unknown expression type: ${(expr as any).type}`);
	}
}

function evaluateLiteral(expr: LiteralExpression): any {
	return expr.value;
}

async function evaluateIdentifier(expr: IdentifierExpression, state: RenderState): Promise<any> {
	const name = expr.name;

	// Check for special prefixes that need async resolution or post-processing
	if (name.startsWith('selector:') || name.startsWith('selectorHtml:')) {
		if (state.context.asyncResolver) {
			return state.context.asyncResolver(name, state.context);
		}
		// Return placeholder syntax for post-processor to handle
		// This allows selectors to be used in templates and resolved later
		return `{{${name}}}`;
	}

	// Schema variables - preserve for post-processing
	if (name.startsWith('schema:')) {
		const value = resolveVariable(name, state.context.variables);
		if (value === undefined) {
			// Not in variables, preserve for post-processor
			return `{{${name}}}`;
		}
		return value;
	}

	// Prompt variables - preserve for post-processing
	if (name.startsWith('prompt:') || name.startsWith('"')) {
		return `{{${name}}}`;
	}

	// Regular variable lookup
	return resolveVariable(name, state.context.variables);
}

async function evaluateMember(expr: MemberExpression, state: RenderState): Promise<any> {
	const object = await evaluateExpression(expr.object, state);
	const property = await evaluateExpression(expr.property, state);

	if (object === undefined || object === null) {
		return undefined;
	}

	// Array access with numeric index
	if (Array.isArray(object) && typeof property === 'number') {
		return object[property];
	}

	// Array access with string that's a number
	if (Array.isArray(object) && typeof property === 'string' && /^\d+$/.test(property)) {
		return object[parseInt(property, 10)];
	}

	// Object property access
	if (typeof object === 'object' && property !== undefined) {
		return object[property];
	}

	return undefined;
}

async function evaluateBinary(expr: BinaryExpression, state: RenderState): Promise<any> {
	const left = await evaluateExpression(expr.left, state);
	const right = await evaluateExpression(expr.right, state);

	switch (expr.operator) {
		case '==':
			return left == right;
		case '!=':
			return left != right;
		case '>':
			return left > right;
		case '<':
			return left < right;
		case '>=':
			return left >= right;
		case '<=':
			return left <= right;
		case 'contains':
			return evaluateContains(left, right);
		case 'and':
			return isTruthy(left) && isTruthy(right);
		case 'or':
			return isTruthy(left) || isTruthy(right);
		default:
			throw new Error(`Unknown binary operator: ${expr.operator}`);
	}
}

async function evaluateUnary(expr: UnaryExpression, state: RenderState): Promise<any> {
	const argument = await evaluateExpression(expr.argument, state);

	switch (expr.operator) {
		case 'not':
			return !isTruthy(argument);
		default:
			throw new Error(`Unknown unary operator: ${expr.operator}`);
	}
}

async function evaluateFilter(expr: FilterExpression, state: RenderState): Promise<any> {
	const value = await evaluateExpression(expr.value, state);

	// Evaluate filter arguments
	const args: any[] = [];
	for (const arg of expr.args) {
		args.push(await evaluateExpression(arg, state));
	}

	// Check for custom filters first
	if (state.context.filters && state.context.filters[expr.name]) {
		return state.context.filters[expr.name](value, ...args);
	}

	// Use built-in filters via applyFilters
	// Build filter string: filtername:arg1:arg2
	let filterString = expr.name;
	if (args.length > 0) {
		filterString += ':' + args.map(a =>
			typeof a === 'string' ? `"${a}"` : String(a)
		).join(':');
	}

	const stringValue = valueToString(value);

	// Use context's applyFilters if provided, otherwise use default
	const applyFiltersFn = state.context.applyFilters || defaultApplyFilters;
	return applyFiltersFn(stringValue, filterString, state.context.currentUrl);
}

function evaluateContains(left: any, right: any): boolean {
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

// ============================================================================
// Variable Resolution
// ============================================================================

function resolveVariable(name: string, variables: Record<string, any>): any {
	const trimmed = name.trim();

	// Try with {{ }} wrapper first (how variables are stored)
	const wrappedValue = variables[`{{${trimmed}}}`];
	if (wrappedValue !== undefined) {
		return wrappedValue;
	}

	// Try plain key (for locally set variables)
	if (variables[trimmed] !== undefined) {
		return variables[trimmed];
	}

	// Handle nested property access: author.name
	if (trimmed.includes('.')) {
		return getNestedValue(variables, trimmed);
	}

	return undefined;
}

function getNestedValue(obj: any, path: string): any {
	if (!path || !obj) return undefined;

	const keys = path.split('.');
	let value = obj;

	for (const key of keys) {
		if (value === undefined || value === null) return undefined;

		// Handle bracket notation: items[0]
		if (key.includes('[') && key.includes(']')) {
			const match = key.match(/^([^\[]*)\[([^\]]+)\]/);
			if (match) {
				const [, arrayKey, indexStr] = match;
				const baseValue = arrayKey ? value[arrayKey] : value;
				if (Array.isArray(baseValue)) {
					const index = parseInt(indexStr, 10);
					value = baseValue[index];
				} else if (baseValue && typeof baseValue === 'object') {
					value = baseValue[indexStr.replace(/^["']|["']$/g, '')];
				} else {
					return undefined;
				}
				continue;
			}
		}

		// Try wrapped key first
		if (value[`{{${key}}}`] !== undefined) {
			value = value[`{{${key}}}`];
		} else {
			value = value[key];
		}
	}

	return value;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a value is "truthy" for template conditionals
 */
function isTruthy(value: any): boolean {
	if (value === undefined || value === null) return false;
	if (value === '') return false;
	if (value === 0) return false;
	if (value === false) return false;
	if (Array.isArray(value) && value.length === 0) return false;
	return true;
}

/**
 * Convert any value to a string for output
 */
function valueToString(value: any): string {
	if (value === undefined || value === null) {
		return '';
	}
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value);
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Simple render function for basic usage
 */
export async function renderTemplate(
	template: string,
	variables: Record<string, any>,
	currentUrl: string = ''
): Promise<string> {
	const result = await render(template, { variables, currentUrl });
	if (result.errors.length > 0) {
		console.error('Template render errors:', result.errors);
	}
	return result.output;
}

/**
 * Create an async resolver for selector variables
 */
export function createSelectorResolver(
	tabId: number,
	sendMessage: (tabId: number, message: any) => Promise<any>
): AsyncResolver {
	return async (name: string, context: RenderContext): Promise<any> => {
		const extractHtml = name.startsWith('selectorHtml:');
		const prefix = extractHtml ? 'selectorHtml:' : 'selector:';
		const selectorPart = name.slice(prefix.length);

		// Parse optional attribute: selector:CSS?attr
		const attrMatch = selectorPart.match(/^(.+?)\?(.+)$/);
		const selector = attrMatch ? attrMatch[1] : selectorPart;
		const attribute = attrMatch ? attrMatch[2] : undefined;

		try {
			const response = await sendMessage(tabId, {
				action: "extractContent",
				selector: selector.replace(/\\"/g, '"'),
				attribute: attribute,
				extractHtml: extractHtml
			});

			return response ? response.content : undefined;
		} catch (error) {
			console.error('Error extracting content by selector:', error);
			return undefined;
		}
	};
}
