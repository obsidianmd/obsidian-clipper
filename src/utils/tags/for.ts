import { processSchema } from '../variables/schema';
import { applyFilters } from '../filters';

export async function processForLoop(
    match: RegExpExecArray, 
    variables: { [key: string]: any }, 
    currentUrl: string,
    processLogicStructures: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
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
        const itemVariables = { ...variables, [iteratorName]: item };
        // Process nested loops and other logic structures recursively
        let itemContent = await processLogicStructures(loopContent, itemVariables, currentUrl);
        // Process variables after nested loops
        itemContent = await processVariables(itemContent, itemVariables, currentUrl);
        return itemContent.trim();
    }));
    
    return processedContent.join('\n');
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
