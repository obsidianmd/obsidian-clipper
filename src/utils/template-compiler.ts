import { processSimpleVariable } from './variables/simple';
import { processSelector } from './variables/selector';
import { processSchema } from './variables/schema';
import { processPrompt } from './variables/prompt';

import { processForBlock } from './tags/for';
import { processSetStatement } from './tags/set';
import { processIfBlock } from './tags/if';

// Define a type for logic handlers
type ProcessLogicFn = (tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>;

type LogicHandlerResult = string | { result: string; length: number };

type LogicHandler = {
	type: string;
	regex: RegExp;
	// needsFullText: if true, handler receives full text and returns {result, length}
	needsFullText?: boolean;
	process: (
		tabId: number,
		match: RegExpExecArray,
		variables: { [key: string]: any },
		currentUrl: string,
		processLogic: ProcessLogicFn,
		fullText?: string
	) => Promise<LogicHandlerResult>;
};

// Define logic handlers
// Order matters: set should be processed first to define variables
// Regex patterns support whitespace control: {%- strips before, -%} strips after
const logicHandlers: LogicHandler[] = [
	{
		type: 'set',
		regex: /{%-?\s*set\s+(\w+)\s*=\s*(.+?)\s*-?%}/g,
		process: async (tabId, match, variables, currentUrl) => {
			return processSetStatement(tabId, match, variables, currentUrl);
		}
	},
	{
		type: 'if',
		regex: /{%-?\s*if\s+(.+?)\s*-?%}/g,
		needsFullText: true,
		process: async (tabId, match, variables, currentUrl, processLogic, fullText) => {
			return processIfBlock(tabId, fullText!, match, variables, currentUrl, processLogic);
		}
	},
	{
		type: 'for',
		regex: /{%-?\s*for\s+(\w+)\s+in\s+([\w:@.]+)\s*-?%}/g,
		needsFullText: true,
		process: async (tabId, match, variables, currentUrl, processLogic, fullText) => {
			return processForBlock(tabId, fullText!, match, variables, currentUrl, processLogic);
		}
	},
];

// Main function to compile the template
export async function compileTemplate(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Process logic
	const processedText = await processLogic(tabId, text, variables, currentUrl);
	// Process other variables and filters
	return await processVariables(tabId, processedText, variables, currentUrl);
}

// Process logic structures
export async function processLogic(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	let processedText = text;

	for (const handler of logicHandlers) {
		let match;
		handler.regex.lastIndex = 0; // Reset regex state
		while ((match = handler.regex.exec(processedText)) !== null) {
			const handlerResult = await handler.process(
				tabId,
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

			// Handle whitespace control: {%- strips before, -%} strips after
			let startIndex = match.index;
			let endIndex = match.index + consumedLength;

			// Check for {%- (strip whitespace before)
			if (match[0].startsWith('{%-')) {
				// Find preceding whitespace/newlines to strip
				while (startIndex > 0 && /[\t ]/.test(processedText[startIndex - 1])) {
					startIndex--;
				}
				// Also strip one preceding newline if present
				if (startIndex > 0 && processedText[startIndex - 1] === '\n') {
					startIndex--;
					// Handle \r\n
					if (startIndex > 0 && processedText[startIndex - 1] === '\r') {
						startIndex--;
					}
				}
			}

			// Check for -%} (strip whitespace after)
			// Need to check the actual end of the consumed content for block tags
			const tagEnd = processedText.substring(match.index, endIndex);
			const endsWithStripMarker = tagEnd.endsWith('-%}') ||
				(handler.needsFullText && processedText.substring(endIndex - 4, endIndex).match(/-\s*%}/));

			if (match[0].endsWith('-%}') || endsWithStripMarker) {
				// Find following whitespace/newlines to strip
				while (endIndex < processedText.length && /[\t ]/.test(processedText[endIndex])) {
					endIndex++;
				}
				// Also strip one following newline if present
				if (endIndex < processedText.length && processedText[endIndex] === '\r') {
					endIndex++;
				}
				if (endIndex < processedText.length && processedText[endIndex] === '\n') {
					endIndex++;
				}
			}

			processedText = processedText.substring(0, startIndex) + result + processedText.substring(endIndex);
			handler.regex.lastIndex = startIndex + result.length;
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
