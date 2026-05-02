import { debugLog } from '../debug';
import type { ParamValidationResult } from '../filters';

export const validateMapParams = (param: string | undefined): ParamValidationResult => {
	if (!param) {
		return { valid: false, error: 'requires an arrow function (e.g., map:x => x.name)' };
	}

	const match = param.match(/^\s*(\w+)\s*=>\s*(.+)$/);
	if (!match) {
		return { valid: false, error: 'invalid syntax. Use arrow function format (e.g., x => x.name)' };
	}

	return { valid: true };
};

export const map = (str: string, param?: string): string => {
	debugLog('Map', 'map input:', str);
	debugLog('Map', 'map param:', param);

	let array;
	try {
		array = JSON.parse(str);
		debugLog('Map', 'Parsed array:', JSON.stringify(array, null, 2));
	} catch (error) {
		debugLog('Map', 'Parsing failed, using input as single item');
		array = [str];
	}

	if (Array.isArray(array) && param) {
		const match = param.match(/^\s*(\w+)\s*=>\s*(.+)$/);
		if (!match) {
			debugLog('Map', 'Invalid arrow function syntax');
			return str;
		}
		const [, argName, expression] = match;
		debugLog('Map', 'Arrow function parsed:', { argName, expression });

		const mappedArray = array.map((item, index) => {
			debugLog('Map', `Processing item ${index}:`, JSON.stringify(item, null, 2));

			// Strip outer parentheses for object literal syntax: ({key: value})
			let expr = expression.trim();
			if (expr.startsWith('(') && expr.endsWith(')')) {
				expr = expr.slice(1, -1).trim();
			}

			// Check if the expression is an object literal or a string literal
			if ((expr.startsWith('{') && expr.endsWith('}')) ||
				(expr.startsWith('"') && expr.endsWith('"')) ||
				(expr.startsWith("'") && expr.endsWith("'"))) {
				// Use a simple object to store the mapped properties
				const mappedItem: { [key: string]: any } = {};

				// Parse the expression to extract property assignments or string literal
				if (expr.startsWith('{')) {
					const assignments = expr.match(/\{(.+)\}/)?.[1].split(',') || [];

					assignments.forEach((assignment) => {
						const [key, value] = assignment.split(':').map(s => s.trim());
						// Remove any surrounding quotes from the key
						const cleanKey = key.replace(/^['"](.+)['"]$/, '$1');
						debugLog('Map', 'Processing assignment:', { cleanKey, value });
						// Evaluate the value expression
						const cleanValue = evaluateExpression(value, item, argName);
						debugLog('Map', 'Cleaned value:', cleanValue);
						mappedItem[cleanKey] = cleanValue;
						debugLog('Map', `Assigned ${cleanKey}:`, mappedItem[cleanKey]);
					});
				} else {
					// Handle string literal — return plain string
					const stringLiteral = expr.slice(1, -1);
					return stringLiteral.replace(new RegExp(`\\$\\{${argName}\\}`, 'g'), item);
				}

				debugLog('Map', 'Mapped item:', mappedItem);
				return mappedItem;
			} else {
				// If it's not an object literal or string literal, treat it as a simple expression
				return evaluateExpression(expression, item, argName);
				}
			});

		debugLog('Map', 'Mapped array:', JSON.stringify(mappedArray, null, 2));
		return JSON.stringify(mappedArray);
	}
	debugLog('Map', 'map output (unchanged):', str);
	return str;
};

function evaluateExpression(expression: string, item: any, argName: string): any {
	if (typeof item === 'string') {
		// For simple string arrays, return the item directly
		return item;
	}
	const result = expression.replace(new RegExp(`${argName}\\.([\\w.\\[\\]]+)`, 'g'), (_, prop) => {
		const value = getNestedProperty(item, prop);
		debugLog('Map', `Replacing ${argName}.${prop} with:`, value);
		return JSON.stringify(value);
	});
	try {
		return JSON.parse(result);
	} catch {
		return result.replace(/^["'](.+)["']$/, '$1');
	}
}

function getNestedProperty(obj: any, path: string): any {
	debugLog('Map', 'Getting nested property:', { obj: JSON.stringify(obj), path });
	const result = path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		if (current && Array.isArray(current) && /^\d+$/.test(key)) {
			return current[parseInt(key, 10)];
		}
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
	debugLog('Map', 'Nested property result:', result);
	return result;
}
