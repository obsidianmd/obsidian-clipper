import { processSchema } from '../variables/schema';
import { processVariables } from '../template-compiler';

export async function processForLoop(
	match: RegExpExecArray, 
	variables: { [key: string]: any }, 
	currentUrl: string,
	processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
): Promise<string> {
	console.log('Processing loop:', match[0]);
	
	const [fullMatch, iteratorName, arrayName, loopContent] = match;
	
	let arrayValue: any;
	if (arrayName.startsWith('schema:')) {
		arrayValue = await processSchema(`{{${arrayName}}}`, variables, currentUrl);
		try {
			arrayValue = JSON.parse(arrayValue);
		} catch (error) {
			console.error(`Error parsing schema result for ${arrayName}:`, error);
			return '';
		}
	} else if (arrayName.includes('.')) {
		arrayValue = arrayName.split('.').reduce((obj: any, key: string) => {
			if (obj && typeof obj === 'object' && key in obj) {
				return obj[key];
			}
			console.error(`Cannot access property ${key} of`, obj);
			return undefined;
		}, variables);
	} else {
		arrayValue = variables[arrayName];
	}
	
	console.log(`Array value for ${arrayName}:`, arrayValue);
	
	if (!arrayValue || !Array.isArray(arrayValue)) {
		console.error(`Invalid array value for ${arrayName}:`, arrayValue);
		return ''; // Remove the loop if array is invalid
	}
	
	const processedContent = await Promise.all(arrayValue.map(async (item: any, index: number) => {
		console.log(`Processing item ${index} of ${arrayName}:`, item);
		const localVariables = { ...variables, [`${iteratorName}`]: item };
		// Process nested loops and other logic structures recursively
		let itemContent = await processLogic(loopContent, localVariables, currentUrl);
		// Process variables after nested loops, using both global and local variables
		itemContent = await processVariables(0, itemContent, localVariables, currentUrl);
		return itemContent.trim();
	}));
	
	return processedContent.join('\n');
}
