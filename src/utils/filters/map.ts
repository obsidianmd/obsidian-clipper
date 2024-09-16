import { filters } from '../filters';

export const map = (str: string, param?: string): string => {
	console.log('map input:', str);
	console.log('map param:', param);

	let array;
	try {
		array = JSON.parse(str);
		console.log('Parsed array:', JSON.stringify(array, null, 2));
	} catch (error) {
		console.log('Parsing failed, using input as single item');
		array = [str];
	}

	if (Array.isArray(array) && param) {
		const match = param.match(/^\s*(\w+)\s*=>\s*(.+)$/);
		if (!match) {
			console.error('Invalid arrow function syntax');
			return str;
		}
		const [, argName, expression] = match;
		console.log('Arrow function parsed:', { argName, expression });

		const mappedArray = array.map((item, index) => {
			console.log(`Processing item ${index}:`, JSON.stringify(item, null, 2));
			// Check if the expression is an object literal
			if (expression.trim().startsWith('{') && expression.trim().endsWith('}')) {
				// Use a simple object to store the mapped properties
				const mappedItem: { [key: string]: any } = {};

				// Parse the expression to extract property assignments
				const assignments = expression.match(/\{(.+)\}/)?.[1].split(',') || [];

				assignments.forEach((assignment) => {
					const [key, value] = assignment.split(':').map(s => s.trim());
					// Remove any surrounding quotes from the key
					const cleanKey = key.replace(/^['"](.+)['"]$/, '$1');
					console.log('Processing assignment:', { cleanKey, value });
					// Evaluate the value expression
					const cleanValue = evaluateExpression(value, item, argName);
					console.log('Cleaned value:', cleanValue);
					mappedItem[cleanKey] = cleanValue;
					console.log(`Assigned ${cleanKey}:`, mappedItem[cleanKey]);
				});

				console.log('Mapped item:', mappedItem);
				return mappedItem;
			} else {
				// If it's not an object literal, treat it as a simple expression
				return evaluateExpression(expression, item, argName);
			}
		});

		console.log('Mapped array:', JSON.stringify(mappedArray, null, 2));
		return JSON.stringify(mappedArray);
	}
	console.log('map output (unchanged):', str);
	return str;
};

function evaluateExpression(expression: string, item: any, argName: string): any {
	const result = expression.replace(new RegExp(`${argName}\\.([\\w.\\[\\]]+)`, 'g'), (_, prop) => {
		const value = getNestedProperty(item, prop);
		console.log(`Replacing ${argName}.${prop} with:`, value);
		return JSON.stringify(value);
	});
	try {
		return JSON.parse(result);
	} catch {
		return result.replace(/^["'](.+)["']$/, '$1');
	}
}

function getNestedProperty(obj: any, path: string): any {
	console.log('Getting nested property:', { obj: JSON.stringify(obj), path });
	const result = path.split(/[\.\[\]]/).filter(Boolean).reduce((current, key) => {
		if (current && Array.isArray(current) && /^\d+$/.test(key)) {
			return current[parseInt(key, 10)];
		}
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
	console.log('Nested property result:', result);
	return result;
}