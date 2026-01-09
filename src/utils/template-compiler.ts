import { processSimpleVariable } from './variables/simple';
import { processSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { processPrompt } from './variables/prompt';

import { processForLoop } from './tags/for';
import { processSetStatement } from './tags/set';
import { processIfBlock } from './tags/if';

// Define a type for logic handlers
type ProcessLogicFn = (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>;

type LogicHandlerResult = string | { result: string; length: number };

type LogicHandler = {
	type: string;
	regex: RegExp;
	// needsFullText: if true, handler receives full text and returns {result, length}
	needsFullText?: boolean;
	process: (
		match: RegExpExecArray,
		variables: { [key: string]: any },
		currentUrl: string,
		processLogic: ProcessLogicFn,
		fullText?: string
	) => Promise<LogicHandlerResult>;
};

// Define logic handlers
// Order matters: set should be processed first to define variables
const logicHandlers: LogicHandler[] = [
	{
		type: 'set',
		regex: /{%\s*set\s+(\w+)\s*=\s*(.+?)\s*%}/g,
		process: async (match, variables, currentUrl) => {
			return processSetStatement(match, variables, currentUrl);
		}
	},
	{
		type: 'if',
		regex: /{%\s*if\s+(.+?)\s*%}/g,
		needsFullText: true,
		process: async (match, variables, currentUrl, processLogic, fullText) => {
			return processIfBlock(fullText!, match, variables, currentUrl, processLogic);
		}
	},
	{
		type: 'for',
		regex: /{%\s*for\s+(\w+)\s+in\s+([\w:@.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g,
		process: async (match, variables, currentUrl, processLogic) => {
			return processForLoop(match, variables, currentUrl, processLogic);
		}
	},
];

// Main function to compile the template
export async function compileTemplate(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Process logic
	const processedText = await processLogic(text, variables, currentUrl);
	// Process other variables and filters
	return await processVariables(tabId, processedText, variables, currentUrl);
}

// Process logic structures
export async function processLogic(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	let processedText = text;

	for (const handler of logicHandlers) {
		let match;
		handler.regex.lastIndex = 0; // Reset regex state
		while ((match = handler.regex.exec(processedText)) !== null) {
			const handlerResult = await handler.process(
				match,
				variables,
				currentUrl,
				processLogic,
				handler.needsFullText ? processedText : undefined
			);

			// Handle both string and {result, length} return types
			let result: string;
			let consumedLength: number;

			if (typeof handlerResult === 'string') {
				result = handlerResult;
				consumedLength = match[0].length;
			} else {
				result = handlerResult.result;
				consumedLength = handlerResult.length;
			}

			processedText = processedText.substring(0, match.index) + result + processedText.substring(match.index + consumedLength);
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
		} else {
			replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}
