export const last = (str: string): string => {
	try {
		const array = JSON.parse(str);
		if (Array.isArray(array) && array.length > 0) {
			return array[array.length - 1].toString();
		}
	} catch (error) {
		console.error('Error parsing JSON in last filter:', error);
	}
	return str;
};