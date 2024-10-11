import { processSchema } from './schema';
import { applyFilters } from '../filters';

export async function processForLoop(match: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	console.log('Processing loop:', match);
	
	async function processLoop(content: string, localVariables: { [key: string]: any }): Promise<string> {
		const forLoopRegex = /{%\s*for\s+(\w+)\s+in\s+([\w:@.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g;
		let result = content;
		let loopMatch;
		
		while ((loopMatch = forLoopRegex.exec(result)) !== null) {
			const [fullMatch, iteratorName, arrayName, loopContent] = loopMatch;
			console.log('Processing nested loop:', { iteratorName, arrayName });
			
			let arrayValue: any;
			if (arrayName.startsWith('schema:')) {
				arrayValue = await processSchema(`{{${arrayName}}}`, localVariables, currentUrl);
				try {
					arrayValue = JSON.parse(arrayValue);
				} catch (error) {
					console.error(`Error parsing schema result for ${arrayName}:`, error);
					continue;
				}
			} else if (arrayName.includes('.')) {
				arrayValue = arrayName.split('.').reduce((obj: any, key: string) => {
					if (obj && typeof obj === 'object' && key in obj) {
						return obj[key];
					}
					console.error(`Cannot access property ${key} of`, obj);
					return undefined;
				}, localVariables);
			} else {
				arrayValue = localVariables[arrayName];
			}
			
			console.log(`Array value for ${arrayName}:`, arrayValue);
			
			if (!arrayValue || !Array.isArray(arrayValue)) {
				console.error(`Invalid array value for ${arrayName}:`, arrayValue);
				result = result.replace(fullMatch, ''); // Remove the loop if array is invalid
				continue;
			}
			
			const processedContent = await Promise.all(arrayValue.map(async (item: any, index: number) => {
				console.log(`Processing item ${index} of ${arrayName}:`, item);
				const itemVariables = { ...localVariables, [iteratorName]: item };
				let itemContent = await processLoop(loopContent, itemVariables);
				itemContent = await processVariables(itemContent, itemVariables, currentUrl);
				return itemContent.trim();
			}));
			
			result = result.replace(fullMatch, processedContent.join('\n'));
		}
		
		return result;
	}
	
	const finalResult = await processLoop(match, variables);
	console.log('Processed loop result:', finalResult);
	return finalResult;
}

async function processVariables(content: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const variableRegex = /{{([\s\S]*?)}}/g;
	let result = content;
	let match;
	
	while ((match = variableRegex.exec(content)) !== null) {
		const [fullMatch, variableName] = match;
		const [name, ...filterParts] = variableName.split('|').map(part => part.trim());
		let value;
		if (name.includes('.')) {
			value = name.split('.').reduce((obj: any, key: string) => obj && typeof obj === 'object' ? obj[key] : undefined, variables);
		} else {
			value = variables[name];
		}
		console.log(`Processing variable ${name}:`, value);
		value = value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : '';
		const filtersString = filterParts.join('|');
		const replacement = applyFilters(value, filtersString, currentUrl);
		result = result.replace(fullMatch, replacement);
	}
	
	return result;
}
