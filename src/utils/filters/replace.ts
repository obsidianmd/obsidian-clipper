export const replace = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');

	// Split into multiple replacements if commas are present
	const replacements = param.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);

	return replacements.reduce((acc, replacement) => {
		let [search, replace] = replacement.split(/(?<!\\):/).map(p => {
			// Remove surrounding quotes and unescape characters
			return p.trim().replace(/^["']|["']$/g, '').replace(/\\(.)/g, '$1');
		});

		// Use an empty string if replace is undefined or an empty string
		replace = replace || '';

		// For | and : characters, use string.split and join for replacement
		if (search === '|' || search === ':') {
			return acc.split(search).join(replace);
		}

		// Escape special regex characters in search string
		const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

		// Use a custom replace function to handle global replacement
		return acc.replace(searchRegex, replace);
	}, str);
};