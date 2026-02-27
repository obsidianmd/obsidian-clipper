export const join = (str: string, param?: string): string => {
	// Return early if input is empty or invalid
	if (!str || str === 'undefined' || str === 'null') {
		return '';
	}

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
		// Remove outer quotes if present (use [\s\S] instead of . to handle newlines)
		separator = param.replace(/^(['"])([\s\S]*)\1$/, '$2');
		// Replace \n with actual newline character
		separator = separator.replace(/\\n/g, '\n');
	}

	return array.join(separator);
};