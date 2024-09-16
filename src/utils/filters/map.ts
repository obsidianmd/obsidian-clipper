import { filters } from '../filters';

export const map = (str: string, param?: string): string => {
	let array;
	try {
		array = JSON.parse(str);
	} catch (error) {
		array = [str];
	}

	if (Array.isArray(array) && param) {
		const match = param.match(/^\s*(\w+)\s*=>\s*(.+)$/);
		if (!match) {
			console.error('Invalid arrow function syntax');
			return str;
		}
		const [, argName, expression] = match;

		const mappedArray = array.map(item => {
			const itemStr = typeof item === 'string' ? item : JSON.stringify(item);

			const replacedExpression = expression.replace(
				new RegExp(`\\$\\{${argName}\\}`, 'g'),
				itemStr
			);

			const result = applyFiltersInExpression(replacedExpression, item);
			return result;
		});

		const finalResult = mappedArray.join('\n');
		return finalResult;
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