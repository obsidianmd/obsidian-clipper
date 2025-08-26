import { processSimpleVariable } from './variables/simple';
import { processSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { processPrompt } from './variables/prompt';

import { processForLoop } from './tags/for';
import { processIfCondition } from './tags/if';
import { processVariableAssignment } from './tags/set';

// Define a type for logic handlers
type LogicHandler = {
	type: string;
	regex: RegExp;
	process: (match: RegExpExecArray, variables: { [key: string]: any }, currentUrl: string, processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>) => Promise<string>;
};

// Define a type for assignment handlers that can modify variables
type AssignmentHandler = {
	type: string;
	regex: RegExp;
	process: (match: RegExpExecArray, variables: { [key: string]: any }, currentUrl: string) => Promise<void>;
};

// Define assignment handlers (processed first)
const assignmentHandlers: AssignmentHandler[] = [
	{
		type: 'set',
		regex: /{%\s*set\s+(\w+)\s*=\s*([\s\S]*?)\s*%}/g,
		process: async (match, variables, currentUrl) => {
			return processVariableAssignment(match, variables, currentUrl);
		}
	}
];

// Define logic handlers (processed after assignments)
const logicHandlers: LogicHandler[] = [
	{
		type: 'for',
		regex: /{%\s*for\s+(\w+)\s+in\s+([\w:@]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g,
		process: async (match, variables, currentUrl, processLogic) => {
			return processForLoop(match, variables, currentUrl, processLogic);
		}
	},
	{
		type: 'if',
		regex: /{%\s*if\s+([\s\S]*?)\s*%}([\s\S]*?)(?:{%\s*else\s*%}([\s\S]*?))?{%\s*endif\s*%}/g,
		process: async (match, variables, currentUrl, processLogic) => {
			return processIfCondition(match, variables, currentUrl, processLogic);
		}
	},
	// Add more logic handlers
];

// Main function to compile the template
export async function compileTemplate(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Process logic
	const processedText = await processLogic(text, variables, currentUrl);
	// Process other variables and filters
	return await processVariables(tabId, processedText, variables, currentUrl);
}

// Process assignments first (they define variables for later use)
export async function processAssignments(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	let processedText = text;

	for (const handler of assignmentHandlers) {
		let match;
		while ((match = handler.regex.exec(processedText)) !== null) {
			await handler.process(match, variables, currentUrl);
			// Remove the assignment statement from the output
			processedText = processedText.substring(0, match.index) + processedText.substring(match.index + match[0].length);
			handler.regex.lastIndex = match.index;
		}
	}

	return processedText;
}

// Process logic structures
export async function processLogic(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	// First process assignments to define custom variables
	let processedText = await processAssignments(text, variables, currentUrl);

	// Then process other logic structures
	for (const handler of logicHandlers) {
		let match;
		while ((match = handler.regex.exec(processedText)) !== null) {
			const result = await handler.process(match, variables, currentUrl, processLogic);
			processedText = processedText.substring(0, match.index) + result + processedText.substring(match.index + match[0].length);
			handler.regex.lastIndex = match.index + result.length;
		}
	}

	return processedText;
}

// Process variables and apply filters
export async function processVariables(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const regex = /{{([\s\S]*?)}}/g;
	let result = text;
	let match;

	while ((match = regex.exec(result)) !== null) {
		const fullMatch = match[0];
		const trimmedMatch = match[1].trim();

		let replacement: string;

		if (trimmedMatch.startsWith('selector:') || trimmedMatch.startsWith('selectorHtml:')) {
			replacement = await processSelector(tabId, fullMatch, currentUrl);
		} else if (trimmedMatch.startsWith('schema:')) {
			replacement = await processSchema(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('"') || trimmedMatch.startsWith('prompt:')) {
			replacement = await processPrompt(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('literal:')) {
			// Handle string literals with literal: prefix
			const literalContent = trimmedMatch.substring(8); // Remove 'literal:' prefix
			if ((literalContent.startsWith('"') && literalContent.endsWith('"')) ||
				(literalContent.startsWith("'") && literalContent.endsWith("'"))) {
				replacement = literalContent.slice(1, -1);
			} else {
				replacement = literalContent;
			}
		} else {
			// Check if it's a custom variable first, then fall back to simple variable processing
			if (variables.hasOwnProperty(trimmedMatch)) {
				// Handle custom variables set with {% set %}
				const customValue = variables[trimmedMatch];
				if (trimmedMatch.includes('|')) {
					// Apply filters to custom variables
					replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
				} else {
					replacement = String(customValue ?? '');
				}
			} else {
				replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
			}
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}
