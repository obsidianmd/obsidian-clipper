export const split = (str: string, param?: string): string => {
	if (!param) {
		console.error('Split filter requires a separator parameter');
		return JSON.stringify([str]);
	}

	// Remove quotes from the param if present
	param = param.replace(/^["']|["']$/g, '');

	// If param is a single character, use it directly
	const separator = param.length === 1 ? param : new RegExp(param);

	// Split operation
	const result = str.split(separator);

	return JSON.stringify(result);
};