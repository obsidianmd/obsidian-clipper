export const replace = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	// Check if it's a single replacement or multiple
	if (param.includes(',')) {
		// Multiple replacements
		// Remove outer parentheses if present
		param = param.replace(/^\((.*)\)$/, '$1');

		// Split the param into individual replacements, respecting nested parentheses
		const replacements = param.match(/(?:[^,()]|\([^()]*\))+/g) || [];

		return replacements.reduce((acc, replacement) => {
			const [search, replace] = replacement.split(':').map(p => {
				// Remove surrounding quotes and unescape characters
				return p.trim().replace(/^["']|["']$/g, '').replace(/\\(.)/g, '$1');
			});
			// Use an empty string if replace is undefined or an empty string
			return acc.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace || '');
		}, str);
	} else {
		// Single replacement
		const [search, replace] = param.split(':').map(p => {
			// Remove surrounding quotes and unescape characters
			return p.trim().replace(/^["']|["']$/g, '').replace(/\\(.)/g, '$1');
		});
		// Use an empty string if replace is undefined or an empty string
		return str.replace(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace || '');
	}
};