export const replace = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');

	// Split the param into individual replacements
	const replacements = param.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(p => p.trim());

	return replacements.reduce((acc, replacement) => {
		const [search, replace] = replacement.split(':').map(p => {
			// Remove surrounding quotes and unescape characters
			return p.trim().replace(/^["']|["']$/g, '').replace(/\\(.)/g, '$1');
		});
		// Use an empty string if replace is undefined or an empty string
		return acc.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace || '');
	}, str);
};