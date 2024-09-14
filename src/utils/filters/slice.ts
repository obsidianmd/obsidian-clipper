export const slice = (str: string, param?: string): string => {
	if (!param) {
		console.error('Slice filter requires parameters');
		return str;
	}

	const [start, end] = param.split(',').map(p => p.trim()).map(p => {
		if (p === '') return undefined;
		const num = parseInt(p, 10);
		return isNaN(num) ? undefined : num;
	});

	let value;
	try {
		value = JSON.parse(str);
	} catch (error) {
		console.error('Error parsing JSON in slice filter:', error);
		value = str;
	}

	if (Array.isArray(value)) {
		const slicedArray = value.slice(start, end);
		if (slicedArray.length === 1) {
			return slicedArray[0].toString();
		}
		return JSON.stringify(slicedArray);
	} else {
		const slicedString = str.slice(start, end);
		return slicedString;
	}
};