export const capitalize = (input: string): string => {
	const capitalizeString = (str: string): string => 
		str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

	try {
		const parseAndCapitalize = (value: any): any => {
			if (typeof value === 'string') {
				return capitalizeString(value);
			} else if (Array.isArray(value)) {
				return value.map(parseAndCapitalize);
			} else if (typeof value === 'object' && value !== null) {
				const result: {[key: string]: any} = {};
				for (const [key, val] of Object.entries(value)) {
					result[capitalizeString(key)] = parseAndCapitalize(val);
				}
				return result;
			}
			return value;
		};

		const parsed = JSON.parse(input);
		const capitalized = parseAndCapitalize(parsed);
		return JSON.stringify(capitalized);
	} catch (error) {
		// If parsing fails, treat the input as a simple string
		return capitalizeString(input);
	}
};