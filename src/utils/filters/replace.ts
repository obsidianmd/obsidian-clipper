export const replace = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');

	// Split the param into individual replacements
	const replacements = param.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim());

	return replacements.reduce((acc, replacement) => {
		const [search, replace] = replacement.split(':').map(p => p.trim().replace(/^["']|["']$/g, ''));
		// Use an empty string if replace is undefined or an empty string
		return acc.split(search).join(replace || '');
	}, str);
};