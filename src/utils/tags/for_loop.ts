import { processSchema } from '../content-extractor';
import { applyFilters } from '../filters';

export async function processForLoop(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const forLoopRegex = /{%\s*for\s+(\w+)\s+in\s+([\w:@]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/;
	const matches = match.match(forLoopRegex);
	if (!matches) {
		console.error('Invalid for loop syntax:', match);
		return match;
	}

	const [, iteratorName, arrayName, loopContent] = matches;
	let arrayValue: string;

	if (arrayName.startsWith('schema:')) {
		arrayValue = await processSchema(`{{${arrayName}}}`, variables, currentUrl);
	} else {
		arrayValue = variables[`{{${arrayName}}}`] || '';
	}

	if (!arrayValue) {
		console.error(`Array ${arrayName} not found in variables`);
		return match;
	}

	let array: any[];
	try {
		array = JSON.parse(arrayValue);
	} catch (error) {
		console.error(`Invalid array value for ${arrayName}:`, error);
		return match;
	}

	if (!Array.isArray(array)) {
		console.error(`Value of ${arrayName} is not an array`);
		return match;
	}

	const results = await Promise.all(array.map(async (item) => {
		let processedContent = loopContent;
		const itemVariables = { ...variables, [`{{${iteratorName}}}`]: JSON.stringify(item) };
		
		// Process variables within the loop content
		const variableRegex = /{{([\s\S]*?)}}/g;
		let variableMatch;
		while ((variableMatch = variableRegex.exec(processedContent)) !== null) {
			const [fullMatch, variableName] = variableMatch;
			if (variableName.trim() === iteratorName) {
				processedContent = processedContent.replace(fullMatch, JSON.stringify(item));
			} else {
				const [name, ...filterParts] = variableName.split('|').map(part => part.trim());
				const value = itemVariables[`{{${name}}}`] || '';
				const filtersString = filterParts.join('|');
				const replacement = applyFilters(value, filtersString, currentUrl);
				processedContent = processedContent.replace(fullMatch, replacement);
			}
		}
		
		return processedContent.trim();
	}));

	return results.join('\n');
}
