export const join = (str: string, param?: string): string => {
	let array;
	try {
		array = JSON.parse(str);
	} catch (error) {
		console.error('Error parsing JSON in join filter:', error);
		return str;
	}

	if (Array.isArray(array)) {
		const separator = param ? JSON.parse(`"${param}"`) : ',';
		return array.join(separator);
	}
	return str;
};