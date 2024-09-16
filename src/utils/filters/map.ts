import { FilterFunction } from '../../types/filters';
import { filters } from '../filters';

export const map = (str: string, param?: string): string => {
	console.log('map input:', str);
	console.log('map param:', param);

	let array;
	try {
		array = JSON.parse(str);
		console.log('Parsed array:', array);
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

		const mappedArray = array.map(item => {
			const itemStr = typeof item === 'string' ? item : JSON.stringify(item);
			console.log('Processing item:', itemStr);

			const replacedExpression = expression.replace(
				new RegExp(`\\$\\{${argName}\\}`, 'g'),
				itemStr
			);
			console.log('Replaced expression:', replacedExpression);

			const result = applyFiltersInExpression(replacedExpression, item);
			console.log('After applying filters:', result);
			return result;
		});

		const finalResult = mappedArray.join('\n');
		console.log('map output:', finalResult);
		return finalResult;
	}
	console.log('map output (unchanged):', str);
	return str;
};

function applyFiltersInExpression(expression: string, item: any): string {
	console.log('Applying filters to expression:', expression);
	const filterRegex = /(\w+)\s*\|\s*(\w+)(?:\s*:\s*([^|]+))?/g;
	let result = expression;
	let match;

	while ((match = filterRegex.exec(expression)) !== null) {
		const [fullMatch, value, filterName, filterParam] = match;
		console.log('Applying filter:', { filterName, value, filterParam });
		const filter = filters[filterName];
		if (filter) {
			const filtered = filter(typeof item === 'string' ? item : JSON.stringify(item), filterParam);
			result = result.replace(fullMatch, filtered);
			console.log('After applying filter:', result);
		} else {
			console.warn('Filter not found:', filterName);
		}
	}

	// Remove surrounding quotes if present
	result = result.replace(/^"(.*)"$/, '$1');
	
	// Replace escaped newlines with actual newlines
	result = result.replace(/\\n/g, '\n');

	return result;
}