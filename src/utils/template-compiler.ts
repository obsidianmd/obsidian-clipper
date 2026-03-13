// Template compiler for the Web Clipper template engine
// This module provides the main entry point for template compilation,
// integrating the AST-based renderer with the variable processors.

import { render, RenderContext, AsyncResolver } from './renderer';
import { applyFilterDirect } from './filters';
import { processSimpleVariable } from './variables/simple';
import { processSelector, resolveSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { processPrompt } from './variables/prompt';

/**
 * A function that processes a selector match string and returns the result.
 * Used to inject different selector implementations (browser vs CLI).
 */
export type SelectorProcessor = (match: string, currentUrl: string) => Promise<string>;

/**
 * Main function to compile a template with the given variables.
 *
 * @param tabId - Browser tab ID for selector resolution (0 if not applicable)
 * @param text - Template string to compile
 * @param variables - Variables available in the template
 * @param currentUrl - Current page URL for filter processing
 * @param customAsyncResolver - Optional async resolver override (defaults to browser selector resolver)
 * @param customSelectorProcessor - Optional selector processor override for post-processing
 * @returns Compiled template string
 */
export async function compileTemplate(
	tabId: number,
	text: string,
	variables: { [key: string]: any },
	currentUrl: string,
	customAsyncResolver?: AsyncResolver,
	customSelectorProcessor?: SelectorProcessor
): Promise<string> {
	// Strip text fragment from URL
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Use provided resolver or default browser-based one
	const asyncResolver = customAsyncResolver ?? (async (name: string, ctx: RenderContext): Promise<any> => {
		if (name.startsWith('selector:') || name.startsWith('selectorHtml:')) {
			return resolveSelector(ctx.tabId!, name);
		}
		return undefined;
	});

	// Create render context with custom variable resolver
	const context: RenderContext = {
		variables,
		currentUrl,
		tabId,
		applyFilterDirect,
		asyncResolver,
	};

	// Render the template using the AST-based renderer
	const result = await render(text, context);

	// Log any errors (but don't fail - return partial output)
	if (result.errors.length > 0) {
		console.error('Template compilation errors:', result.errors.map(e => `Line ${e.line}: ${e.message}`).join('; '));
	}

	// Skip post-processing if no deferred variables were output
	// This optimization avoids regex-parsing the entire output when not needed
	if (!result.hasDeferredVariables) {
		return result.output;
	}

	// Post-process: handle special variable types that weren't processed by the renderer
	// The renderer handles basic variables, but special prefixes need custom processing
	const processedText = await processVariables(tabId, result.output, variables, currentUrl, customSelectorProcessor);

	return processedText;
}

/**
 * Process variables and apply filters.
 * Handles special variable types: selector, schema, prompt.
 *
 * This is called after the AST-based renderer to handle any remaining
 * variable interpolations that need special processing.
 */
export async function processVariables(
	tabId: number,
	text: string,
	variables: { [key: string]: any },
	currentUrl: string,
	customSelectorProcessor?: SelectorProcessor
): Promise<string> {
	const regex = /{{([\s\S]*?)}}/g;
	let result = text;
	let match;

	while ((match = regex.exec(result)) !== null) {
		const fullMatch = match[0];
		const trimmedMatch = match[1].trim();

		let replacement: string;

		if (trimmedMatch.startsWith('selector:') || trimmedMatch.startsWith('selectorHtml:')) {
			if (customSelectorProcessor) {
				replacement = await customSelectorProcessor(fullMatch, currentUrl);
			} else {
				replacement = await processSelector(tabId, fullMatch, currentUrl);
			}
		} else if (trimmedMatch.startsWith('schema:')) {
			replacement = await processSchema(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('"') || trimmedMatch.startsWith('prompt:')) {
			replacement = await processPrompt(fullMatch, variables, currentUrl);
		} else {
			replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}

