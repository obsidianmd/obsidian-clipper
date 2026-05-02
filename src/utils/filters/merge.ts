export const merge = (str: string, param?: string): string => {
	// Return early if input is empty or invalid
	if (!str || str === 'undefined' || str === 'null') {
		return '[]';
	}

	let array;
	try {
		array = JSON.parse(str);
	} catch (error) {
		console.error('Error parsing JSON in merge filter:', error);
		return str;
	}

	if (!Array.isArray(array)) {
		array = [str];
	}

	if (!param) {
		return JSON.stringify(array);
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');

	try {
		// Split the parameter by commas, but not within quotes
		const additionalItems = param.match(/(?:[^,"']+|"[^"]*"|'[^']*')+/g) || [];
		
		// Process each item to remove quotes
		const processedItems = additionalItems.map(item => {
			item = item.trim();
			return item.replace(/^(['"])([\s\S]*)\1$/, '$2');
		});

		return JSON.stringify([...array, ...processedItems]);
	} catch (error) {
		console.error('Error processing parameters in merge filter:', error);
		return JSON.stringify(array);
	}
}; 