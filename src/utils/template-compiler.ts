import { processSimpleVariable } from './variables/simple';
import { processSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { processPrompt } from './variables/prompt';

import { processForLoop } from './tags/for';

// Define a type for logic handlers
type LogicHandler = {
	type: string;
	regex: RegExp;
	process: (match: RegExpExecArray, variables: { [key: string]: any }, currentUrl: string, processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>) => Promise<string>;
};

// Define logic handlers
const logicHandlers: LogicHandler[] = [
	{
		type: 'for',
		regex: /{%\s*for\s+(\w+)\s+in\s+([\w:@]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g,
		process: async (match, variables, currentUrl, processLogic) => {
			return processForLoop(match, variables, currentUrl, processLogic);
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

// Process logic structures
export async function processLogic(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	let processedText = text;
	
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
		} else {
			replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}
