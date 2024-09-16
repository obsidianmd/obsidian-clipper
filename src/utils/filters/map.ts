import { FilterFunction } from '../../types/filters';
import { filters } from '../filters';

export const map = (str: string, param?: string): string => {
	let array;
	try {
		array = JSON.parse(str);
	} catch (error) {
		// If parsing fails, assume it's a single item
		array = [str];
	}

	if (Array.isArray(array) && param) {
		// Extract the arrow function body
		const match = param.match(/^\s*(\w+)\s*=>\s*(.+)$/);
		if (!match) {
			throw new Error('Invalid arrow function syntax');
		}
		const [, argName, expression] = match;

		const mappedArray = array.map(item => {
			// Replace ${argName} with the stringified item
			const itemStr = typeof item === 'string' ? item : JSON.stringify(item);
			const replacedExpression = expression.replace(
				new RegExp(`\\$\\{${argName}\\}`, 'g'),
				itemStr
			);

			// Apply filters in the expression
			return applyFiltersInExpression(replacedExpression, item);
		});

		// Join the results
		return mappedArray.join('\n');
	}
	return str;
};

function applyFiltersInExpression(expression: string, item: any): string {
	const filterRegex = /(\w+)\s*\|\s*(\w+)(?:\s*:\s*([^|]+))?/g;
	let result = expression;
	let match;

	while ((match = filterRegex.exec(expression)) !== null) {
		const [fullMatch, value, filterName, filterParam] = match;
		const filter = filters[filterName];
		if (filter) {
			const filtered = filter(typeof item === 'string' ? item : JSON.stringify(item), filterParam);
			result = result.replace(fullMatch, filtered);
		}
	}

	return result;
}