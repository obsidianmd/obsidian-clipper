export const first = (str: string): string => {
	// Return empty string as-is without attempting to parse
	if (str === '') {
		return str;
	}

	try {
		const array = JSON.parse(str);
		if (Array.isArray(array) && array.length > 0) {
			return array[0].toString();
		}
	} catch (error) {
		console.error('Error parsing JSON in first filter:', error);
	}
	return str;
};