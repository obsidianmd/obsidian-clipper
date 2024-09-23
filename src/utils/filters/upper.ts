export const upper = (input: string | string[]): string | string[] => {
	const toUpperCase = (str: string): string => {
		return str.toLocaleUpperCase();
	};

	if (Array.isArray(input)) {
		return input.map(toUpperCase);
	} else {
		return toUpperCase(input);
	}
};