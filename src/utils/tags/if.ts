import { processSchema } from '../variables/schema';
import { processVariables } from '../template-compiler';

export async function processIfCondition(
	match: RegExpExecArray,
	variables: { [key: string]: any },
	currentUrl: string,
	processLogic: (text: string, variables: { [key: string]: any }, currentUrl: string) => Promise<string>
): Promise<string> {
	console.log('Processing if condition:', match[0]);

	const [fullMatch, condition, ifContent, elseContent] = match;

	let conditionValue: any;

	try {
		// Evaluate the condition
		conditionValue = await evaluateCondition(condition.trim(), variables, currentUrl);
		console.log(`Condition "${condition}" evaluates to:`, conditionValue);
	} catch (error) {
		console.error(`Error evaluating condition "${condition}":`, error);
		return ''; // Remove the if block if condition evaluation fails
	}

	let contentToProcess: string;
	if (conditionValue) {
		contentToProcess = ifContent;
	} else if (elseContent !== undefined) {
		contentToProcess = elseContent;
	} else {
		return ''; // No content to process if condition is false and no else block
	}

	// Process nested logic structures and variables recursively
	let processedContent = await processLogic(contentToProcess, variables, currentUrl);
	processedContent = await processVariables(0, processedContent, variables, currentUrl);

	return processedContent.trim();
}

async function evaluateCondition(
	condition: string,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<boolean> {
	// Trim whitespace
	condition = condition.trim();

	// Handle comparison operators: ==, !=, >, <, >=, <=
	const comparisonRegex = /^(.+?)\s*(==|!=|>|<|>=|<=)\s*(.+)$/;
	const comparisonMatch = condition.match(comparisonRegex);

	if (comparisonMatch) {
		const leftOperand = comparisonMatch[1].trim();
		const operator = comparisonMatch[2];
		const rightOperand = comparisonMatch[3].trim();

		const leftValue = await evaluateOperand(leftOperand, variables, currentUrl);
		const rightValue = await evaluateOperand(rightOperand, variables, currentUrl);

		switch (operator) {
			case '==':
				return leftValue == rightValue; // Loose equality
			case '!=':
				return leftValue != rightValue;
			case '>':
				return Number(leftValue) > Number(rightValue);
			case '<':
				return Number(leftValue) < Number(rightValue);
			case '>=':
				return Number(leftValue) >= Number(rightValue);
			case '<=':
				return Number(leftValue) <= Number(rightValue);
		}
	}

	// Handle schema conditions
	if (condition.startsWith('schema:')) {
		const schemaValue = await processSchema(`{{${condition}}}`, variables, currentUrl);
		try {
			const parsed = JSON.parse(schemaValue);
			return isTruthy(parsed);
		} catch (error) {
			console.error(`Error parsing schema result for ${condition}:`, error);
			return false;
		}
	}

	// Handle variable conditions
	if (condition.includes('.')) {
		// Handle nested properties like "variable.property"
		const value = condition.split('.').reduce((obj: any, key: string) => {
			if (obj && typeof obj === 'object' && key in obj) {
				return obj[key];
			}
			console.error(`Cannot access property ${key} of`, obj);
			return undefined;
		}, variables);
		return isTruthy(value);
	}

	// Handle simple variable conditions
	const value = variables[condition];
	return isTruthy(value);
}

async function evaluateOperand(
	operand: string,
	variables: { [key: string]: any },
	currentUrl: string
): Promise<any> {
	operand = operand.trim();

	// Handle quoted strings
	if ((operand.startsWith('"') && operand.endsWith('"')) ||
		(operand.startsWith("'") && operand.endsWith("'"))) {
		return operand.slice(1, -1);
	}

	// Handle numbers
	if (!isNaN(Number(operand))) {
		return Number(operand);
	}

	// Handle schema variables
	if (operand.startsWith('schema:')) {
		const schemaValue = await processSchema(`{{${operand}}}`, variables, currentUrl);
		try {
			return JSON.parse(schemaValue);
		} catch (error) {
			console.error(`Error parsing schema result for ${operand}:`, error);
			return null;
		}
	}

	// Handle nested properties like "variable.property"
	if (operand.includes('.')) {
		return operand.split('.').reduce((obj: any, key: string) => {
			if (obj && typeof obj === 'object' && key in obj) {
				return obj[key];
			}
			console.error(`Cannot access property ${key} of`, obj);
			return undefined;
		}, variables);
	}

	// Handle simple variables
	return variables[operand];
}

function isTruthy(value: any): boolean {
	// JavaScript truthy/falsy rules
	if (value === null || value === undefined) {
		return false;
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'number') {
		return value !== 0;
	}
	if (typeof value === 'string') {
		return value.trim().length > 0;
	}
	if (Array.isArray(value)) {
		return value.length > 0;
	}
	if (typeof value === 'object') {
		return Object.keys(value).length > 0;
	}
	return Boolean(value);
}
