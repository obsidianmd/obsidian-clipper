export const title = (input: string | string[]): string | string[] => {
	const toTitleCase = (str: string): string => {
		return str.replace(/\p{L}\S*/gu, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
	};

	if (Array.isArray(input)) {
		return input.map(toTitleCase);
	} else {
		return toTitleCase(input);
	}
};