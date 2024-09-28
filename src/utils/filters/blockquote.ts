export const blockquote = (input: string | string[]): string => {
	const processBlockquote = (str: string, depth: number = 1): string => {
		const prefix = '> '.repeat(depth);
		return str.split('\n').map(line => `${prefix}${line}`).join('\n');
	};

	const processArray = (arr: any[], depth: number = 1): string => {
		return arr.map(item => {
			if (Array.isArray(item)) {
				return processArray(item, depth + 1);
			}
			return processBlockquote(String(item), depth);
		}).join('\n');
	};

	try {
		const parsedInput = JSON.parse(input as string);
		if (Array.isArray(parsedInput)) {
			return processArray(parsedInput);
		}
		// If it's an object, stringify it first
		if (typeof parsedInput === 'object' && parsedInput !== null) {
			return processBlockquote(JSON.stringify(parsedInput, null, 2));
		}
		// If it's a single value, treat it as a string
		return processBlockquote(String(parsedInput));
	} catch (error) {
		// If parsing fails, treat it as a single string or array of strings
		if (Array.isArray(input)) {
			return processArray(input);
		}
		return processBlockquote(input as string);
	}
};