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
	MemberExpression,
	parse,
} from './parser';
import { applyFilterDirect as builtInApplyFilterDirect } from './filters';

// Filter application function type for direct invocation (already-parsed filter name and params)
type ApplyFilterDirectFn = (value: string, filterName: string, paramString: string | undefined, currentUrl: string) => string;

// Default filter implementation using the built-in filters
const defaultApplyFilterDirect: ApplyFilterDirectFn = builtInApplyFilterDirect;

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

	/** Custom applyFilterDirect implementation (optional, uses built-in if not provided) */
	applyFilterDirect?: ApplyFilterDirectFn;
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
	/** True if output contains deferred variables that need post-processing (prompts, unresolved selectors, etc.) */
	hasDeferredVariables: boolean;
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
			hasDeferredVariables: false,
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
		hasDeferredVariables: false,
	};

	let output = '';

	for (let i = 0; i < ast.length; i++) {
		const node = ast[i];
		const nodeOutput = await renderNode(node, state);
		output = appendNodeOutput(output, nodeOutput, node, state);
	}

	if (options.trimOutput) {
		output = output.trim();
	}

	return { output, errors, hasDeferredVariables: state.hasDeferredVariables };
}

// ============================================================================
// Render State
// ============================================================================

interface RenderState {
	context: RenderContext;
	errors: RenderError[];
	pendingTrimRight: boolean;
	/** Tracks whether any deferred variables (prompts, unresolved selectors, etc.) were output */
	hasDeferredVariables: boolean;
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
		text = trimLeadingWhitespace(text);
		state.pendingTrimRight = false;
	}

	return text;
}

async function renderVariable(node: VariableNode, state: RenderState): Promise<string> {
	// Handle trimLeft - this affects previous output (handled by caller via pendingTrimRight)
	// For now, we handle trimRight by setting a flag for the next node

	try {
		// Special case: string literals (prompts) need to be preserved for post-processing
		// This includes filter chains where the base value is a string literal
		// e.g., {{"prompt text"|title}} should become {{"prompt text"|title}} not "Prompt Text"
		const promptInfo = getPromptBase(node.expression);
		if (promptInfo) {
			if (node.trimRight) {
				state.pendingTrimRight = true;
			}
			// Mark that we have deferred variables that need post-processing
			state.hasDeferredVariables = true;
			// Reconstruct the template syntax for prompt post-processor
			return reconstructPromptTemplate(node.expression);
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

/**
 * Check if an expression is a prompt (string literal or filter chain with string literal base).
 * Returns the prompt string if found, null otherwise.
 */
function getPromptBase(expr: Expression): string | null {
	if (expr.type === 'literal' && typeof (expr as LiteralExpression).value === 'string') {
		return (expr as LiteralExpression).value as string;
	}
	if (expr.type === 'filter') {
		return getPromptBase((expr as FilterExpression).value);
	}
	return null;
}

/**
 * Format filter arguments as a colon-separated string.
 */
function formatFilterArgs(args: Expression[]): string {
	return args.map(arg => {
		if (arg.type === 'literal') {
			const val = (arg as LiteralExpression).value;
			if (typeof val === 'string') {
				// Don't double-wrap values that are already quoted or contain quoted pairs
				if (/^["'].*["']$/.test(val) || val.includes('":"') || val.includes("':'")) {
					return val;
				}
				return `"${val}"`;
			}
			return String(val);
		}
		return String((arg as any).value || (arg as any).name || '');
	}).join(':');
}

/**
 * Reconstruct template syntax for a prompt expression.
 * e.g., FilterExpression{name:'title', value:Literal{"prompt"}} -> {{"prompt"|title}}
 */
function reconstructPromptTemplate(expr: Expression): string {
	return `{{${reconstructPromptTemplateInner(expr)}}}`;
}

function reconstructPromptTemplateInner(expr: Expression): string {
	if (expr.type === 'literal') {
		const value = (expr as LiteralExpression).value;
		return typeof value === 'string' ? `"${value}"` : String(value);
	}
	if (expr.type === 'filter') {
		const filter = expr as FilterExpression;
		const inner = reconstructPromptTemplateInner(filter.value);
		let filterStr = `${inner}|${filter.name}`;
		if (filter.args.length > 0) {
			filterStr += `:${formatFilterArgs(filter.args)}`;
		}
		return filterStr;
	}
	return String(expr);
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

		// Silently handle undefined/null - this is expected when optional data doesn't exist
		if (iterableValue === undefined || iterableValue === null) {
			if (node.trimRight) {
				state.pendingTrimRight = true;
			}
			return '';
		}

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
		const nodeOutput = await renderNode(node, state);
		output = appendNodeOutput(output, nodeOutput, node, state);
	}
	return output;
}

/**
 * Append node output to accumulated output, handling whitespace trimming.
 * Handles both trimLeft (trim trailing from previous) and trimRight (trim leading from current).
 */
function appendNodeOutput(output: string, nodeOutput: string, node: ASTNode, state: RenderState): string {
	// Handle trimLeft - trim trailing whitespace from previous output
	if ('trimLeft' in node && (node as any).trimLeft && output.length > 0) {
		output = trimTrailingWhitespace(output);
	}

	// Handle trimRight from previous node - trim leading whitespace from this output
	if (state.pendingTrimRight && nodeOutput.length > 0) {
		output += trimLeadingWhitespace(nodeOutput);
		state.pendingTrimRight = false;
	} else {
		output += nodeOutput;
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
		state.hasDeferredVariables = true;
		return `{{${name}}}`;
	}

	// Schema variables - resolve with shorthand support
	if (name.startsWith('schema:')) {
		const value = resolveSchemaVariable(name, state.context.variables);
		// Return undefined if not found - schema variables are resolved at render time,
		// not in post-processing, so there's no benefit to preserving a placeholder
		return value;
	}

	// Prompt variables - preserve for post-processing
	if (name.startsWith('prompt:') || name.startsWith('"')) {
		state.hasDeferredVariables = true;
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
	// Handle nullish coalescing with short-circuit evaluation
	if (expr.operator === '??') {
		const left = await evaluateExpression(expr.left, state);
		// Return left if it's truthy, otherwise evaluate and return right
		if (isTruthy(left)) {
			return left;
		}
		return evaluateExpression(expr.right, state);
	}

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
		let argValue = await evaluateExpression(arg, state);
		// If a filter argument is an identifier that resolved to undefined,
		// treat it as a string literal (e.g., date:YYYY-MM-DD, callout:info)
		if (argValue === undefined && arg.type === 'identifier') {
			argValue = arg.name;
		}
		args.push(argValue);
	}

	// Check for custom filters first
	if (state.context.filters && state.context.filters[expr.name]) {
		return state.context.filters[expr.name](value, ...args);
	}

	const stringValue = valueToString(value);

	// Build parameter string from args (already parsed by AST)
	// This avoids the round-trip of building "filterName:args" then re-parsing it
	let paramString: string | undefined;
	if (args.length > 0) {
		const formattedArgs = args.map(a => {
			if (typeof a === 'string') {
				// Don't double-quote strings that are already quoted
				if (isQuotedString(a)) {
					return a;
				}
				// Don't quote arrow function expressions (e.g., map:item => item.name)
				if (/\s*\w+\s*=>/.test(a)) {
					return a;
				}
				// Don't quote simple values that don't need quoting
				// e.g., "3:4", "2n", "abc" should stay unquoted
				if (/^[\w.:+\-*/]+$/.test(a)) {
					return a;
				}
				return `"${a}"`;
			}
			return String(a);
		});
		paramString = formattedArgs.join(',');
	}

	// Use direct filter invocation (optimized path - no re-parsing needed)
	const applyFilterDirectFn = state.context.applyFilterDirect || defaultApplyFilterDirect;
	return applyFilterDirectFn(stringValue, expr.name, paramString, state.context.currentUrl);
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

/**
 * Resolve a schema variable with shorthand support.
 * Schema variables can be stored with full keys like {{schema:@Movie.genre}}
 * but referenced with shorthand like schema:genre.
 */
function resolveSchemaVariable(name: string, variables: Record<string, any>): any {
	// name is like "schema:genre" or "schema:@Movie.genre" or "schema:director[*].name"
	const schemaKey = name.slice('schema:'.length);

	// Check for nested array access: key[*].prop or key[0].prop
	const nestedArrayMatch = schemaKey.match(/^(.*?)\[(\*|\d+)\](\.(.*))?$/);
	if (nestedArrayMatch) {
		const [, arrayKey, indexOrStar, , propertyPath] = nestedArrayMatch;
		const arrayValue = resolveSchemaKey(arrayKey, variables);
		if (arrayValue === undefined) return undefined;

		const parsed = parseSchemaValue(arrayValue);
		if (!Array.isArray(parsed)) return undefined;

		if (indexOrStar === '*') {
			if (propertyPath) {
				return parsed.map(item => getNestedValue(item, propertyPath)).filter(v => v != null);
			}
			return parsed;
		} else {
			const index = parseInt(indexOrStar, 10);
			const item = parsed[index];
			if (item === undefined) return undefined;
			return propertyPath ? getNestedValue(item, propertyPath) : item;
		}
	}

	const rawValue = resolveSchemaKey(schemaKey, variables);
	if (rawValue === undefined) return undefined;
	return parseSchemaValue(rawValue);
}

/**
 * Resolve a schema key to its raw value from variables (before parsing).
 * Handles exact match, plain key, and shorthand resolution.
 */
function resolveSchemaKey(schemaKey: string, variables: Record<string, any>): any {
	const name = `schema:${schemaKey}`;

	// Try exact match first with {{ }} wrapper
	const exactValue = variables[`{{${name}}}`];
	if (exactValue !== undefined) {
		return exactValue;
	}

	// Try plain key
	if (variables[name] !== undefined) {
		return variables[name];
	}

	// If no @ in key, try shorthand resolution
	// Look for keys like {{schema:@Type.genre}} that end with the shorthand
	if (!schemaKey.includes('@')) {
		const matchingKey = Object.keys(variables).find(key =>
			key.includes('@') && key.endsWith(`:${schemaKey}}}`)
		);
		if (matchingKey) {
			return variables[matchingKey];
		}
	}

	return undefined;
}

/**
 * Parse a schema value - if it's a JSON string, parse it to get the actual value.
 */
function parseSchemaValue(value: any): any {
	if (typeof value === 'string') {
		// Try to parse as JSON to get arrays/objects
		if (value.startsWith('[') || value.startsWith('{')) {
			try {
				return JSON.parse(value);
			} catch {
				return value;
			}
		}
	}
	return value;
}

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
 * Trim trailing whitespace and optional newline from a string.
 * Used for trimLeft handling (removes whitespace at end of previous output).
 */
function trimTrailingWhitespace(str: string): string {
	return str.replace(/[\t ]*\r?\n?$/, '');
}

/**
 * Trim leading whitespace and optional newline from a string.
 * Used for trimRight handling (removes whitespace at start of next output).
 */
function trimLeadingWhitespace(str: string): string {
	return str.replace(/^[\t ]*\r?\n?/, '');
}

/**
 * Check if a string is already quoted or contains quoted pairs.
 * Used to avoid double-quoting filter arguments.
 * Examples: "value", 'value', "old":"new"
 */
function isQuotedString(str: string): boolean {
	return /^["'][\s\S]*["']$/.test(str) || str.includes('":"') || str.includes("':'");
}

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
