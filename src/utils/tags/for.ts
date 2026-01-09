import { processSchema } from '../variables/schema';
import { processVariables } from '../template-compiler';
import { resolveVariable, resolveVariableAsync, ResolverContext } from '../resolver';

// Process {% for %} blocks with proper nesting support
export async function processForBlock(
	tabId: number,
	text: string,
	startMatch: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string,
	processLogic: (tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
): Promise<{ result: string; length: number }> {
	const [, iteratorName, arrayName] = startMatch;
	const openTagLength = startMatch[0].length;
	const startIndex = startMatch.index + openTagLength;

	// Find matching endfor with proper nesting
	const loopContent = findMatchingEndfor(text, startIndex);
	if (loopContent === null) {
		console.error('Unmatched {% for %} tag');
		return { result: startMatch[0], length: openTagLength };
	}

	// Resolve the array value
	let arrayValue: any;
	if (arrayName.startsWith('schema:')) {
		arrayValue = await processSchema(`{{${arrayName}}}`, variables, currentUrl);
		try {
			arrayValue = JSON.parse(arrayValue);
		} catch (error) {
			console.error(`Error parsing schema result for ${arrayName}:`, error);
			return { result: '', length: openTagLength + loopContent.length };
		}
	} else if (arrayName.startsWith('selector:') || arrayName.startsWith('selectorHtml:')) {
		// Use async resolver for selector variables
		const context: ResolverContext = { variables, tabId };
		arrayValue = await resolveVariableAsync(arrayName, context);
	} else {
		// Use sync resolver for regular variables
		arrayValue = resolveVariable(arrayName, variables);
	}

	if (!arrayValue || !Array.isArray(arrayValue)) {
		console.error(`Invalid array value for ${arrayName}:`, arrayValue);
		return { result: '', length: openTagLength + loopContent.length };
	}

	const processedContent = await Promise.all(arrayValue.map(async (item: any, index: number) => {
		const localVariables = { ...variables, [iteratorName]: item, [`${iteratorName}_index`]: index };
		// Process nested logic structures recursively
		let itemContent = await processLogic(tabId, loopContent.content, localVariables, currentUrl);
		// Process variables after nested loops
		itemContent = await processVariables(tabId, itemContent, localVariables, currentUrl);
		return itemContent.trim();
	}));

	return {
		result: processedContent.join('\n'),
		length: openTagLength + loopContent.length
	};
}

// Find the matching {% endfor %} with proper nesting support
function findMatchingEndfor(text: string, startIndex: number): { content: string; length: number } | null {
	let depth = 1;
	let currentIndex = startIndex;

	// Regex to find for/endfor tags - use [^%]* to avoid matching across %} boundaries
	const tagPattern = /{%\s*(for|endfor)(?:\s+([^%]*?))?\s*%}/g;

	while (depth > 0 && currentIndex < text.length) {
		tagPattern.lastIndex = currentIndex;
		const match = tagPattern.exec(text);

		if (!match) {
			// No more tags found
			return null;
		}

		const tagType = match[1];

		if (tagType === 'for') {
			depth++;
		} else if (tagType === 'endfor') {
			depth--;
			if (depth === 0) {
				// Found matching endfor
				const content = text.slice(startIndex, match.index);
				const length = match.index + match[0].length - startIndex;
				return { content, length };
			}
		}

		currentIndex = match.index + match[0].length;
	}

	return null;
}

// Legacy export for backwards compatibility (if anything uses it)
export async function processForLoop(
	tabId: number,
	match: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string,
	processLogic: (tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
): Promise<string> {
	// This is the old interface - content was captured by regex
	const [, iteratorName, arrayName, loopContent] = match;

	let arrayValue: any;
	if (arrayName.startsWith('schema:')) {
		arrayValue = await processSchema(`{{${arrayName}}}`, variables, currentUrl);
		try {
			arrayValue = JSON.parse(arrayValue);
		} catch (error) {
			console.error(`Error parsing schema result for ${arrayName}:`, error);
			return '';
		}
	} else if (arrayName.startsWith('selector:') || arrayName.startsWith('selectorHtml:')) {
		const context: ResolverContext = { variables, tabId };
		arrayValue = await resolveVariableAsync(arrayName, context);
	} else {
		arrayValue = resolveVariable(arrayName, variables);
	}

	if (!arrayValue || !Array.isArray(arrayValue)) {
		console.error(`Invalid array value for ${arrayName}:`, arrayValue);
		return '';
	}

	const processedContent = await Promise.all(arrayValue.map(async (item: any, index: number) => {
		const localVariables = { ...variables, [iteratorName]: item, [`${iteratorName}_index`]: index };
		let itemContent = await processLogic(tabId, loopContent, localVariables, currentUrl);
		itemContent = await processVariables(tabId, itemContent, localVariables, currentUrl);
		return itemContent.trim();
	}));

	return processedContent.join('\n');
}
