export const split = (str: string, param?: string): string => {
	// If no param is provided or param is empty string, split every character
	if (!param || param === '') {
		return JSON.stringify(str.split(''));
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');
	// Remove surrounding quotes (both single and double)
	param = param.replace(/^(['"])([\s\S]*)\1$/, '$2');

	// If param is a single character, use it directly
	const separator = param.length === 1 ? param : new RegExp(param);

	// Split operation
	const result = str.split(separator);

	return JSON.stringify(result);
};