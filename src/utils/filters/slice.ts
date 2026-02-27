import type { ParamValidationResult } from '../filters';

export const validateSliceParams = (param: string | undefined): ParamValidationResult => {
	if (!param) {
		return { valid: false, error: 'requires at least a start index (e.g., slice:0,5)' };
	}

	const parts = param.split(',').map(p => p.trim());
	if (parts.length > 2) {
		return { valid: false, error: 'accepts at most 2 parameters: start and end' };
	}

	for (const part of parts) {
		if (part !== '' && isNaN(parseInt(part, 10))) {
			return { valid: false, error: `"${part}" is not a valid number` };
		}
	}

	return { valid: true };
};

export const slice = (str: string, param?: string): string => {
	if (!param) {
		console.error('Slice filter requires parameters');
		return str;
	}

	// Return empty string as-is without attempting to parse
	if (str === '') {
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
		// Only log error for non-trivial parse failures (not plain strings)
		if (str.startsWith('[') || str.startsWith('{')) {
			console.error('Error parsing JSON in slice filter:', error);
		}
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