export const first = (str: string): string => {
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