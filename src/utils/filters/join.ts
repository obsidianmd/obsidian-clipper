export const join = (str: string, param?: string): string => {
	let array;
	try {
		array = JSON.parse(str);
	} catch (error) {
		console.error('Error parsing JSON in join filter:', error);
		return str;
	}

	if (!Array.isArray(array)) {
		return str;
	}

	let separator = ',';
	if (param) {
		// Remove outer quotes if present
		separator = param.replace(/^(['"])(.*)\1$/, '$2');
	}

	return array.join(separator);
};