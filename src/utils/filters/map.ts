import { filters } from '../filters';

export const map = (str: string, param?: string): string | any[] => {
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
		console.log('Arrow function parsed:', { argName, expression });

		const mappedArray = array.map((item, index) => {
			console.log(`Processing item ${index}:`, JSON.stringify(item, null, 2));
			const replacedExpression = expression.replace(
				new RegExp(`\\$\\{${argName}\\}`, 'g'),
				JSON.stringify(item)
			);

			const result = applyFiltersInExpression(replacedExpression, item);
			return result;
		});

		return mappedArray;  // Return the array directly, not as a string
	}
	return str;
};

function applyFiltersInExpression(expression: string, item: any): any {
	const filterRegex = /(\w+)\s*\|\s*(\w+)(?:\s*:\s*([^|]+))?/g;
	let result = item;
	let match;

	while ((match = filterRegex.exec(expression)) !== null) {
		const [fullMatch, , filterName, filterParam] = match;
		const filter = filters[filterName];
		if (filter) {
			result = filter(JSON.stringify(result), filterParam);
		} else {
			console.warn('Filter not found:', filterName);
		}
	}

	return result;
}