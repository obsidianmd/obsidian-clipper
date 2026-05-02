export const replace_tags = (html: string, params: string = ''): string => {
	// Remove outer parentheses if present
	params = params.replace(/^\((.*)\)$/, '$1');

	// Remove any surrounding quotes and unescape internal quotes
	params = params.replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\(['"])/g, '$1');

	// Split by comma, but respect quoted strings
	const transformations = params.split(/,(?=(?:(?:[^"']*["'][^"']*["'])*[^"']*$))/)
		.map(transform => transform.trim())
		.filter(Boolean);

	// If no transformations specified, return the original HTML
	if (transformations.length === 0) {
		return html;
	}

	let result = html;

	transformations.forEach(transform => {
		const [source, target] = transform.split(/(?<!\\)":"/).map(tag => {
			return tag.trim().replace(/^["']|["']$/g, '').replace(/\\(.)/g, '$1');
		});

		if (!source) {
			return;
		}

		// Create regex patterns for opening and closing tags
		const openingPattern = new RegExp(`<${source}(\\s+[^>]*?)?>`, 'g');
		const closingPattern = new RegExp(`</${source}>`, 'g');

		// Replace opening and closing tags
		result = result
			.replace(openingPattern, (match, attributes) => {
				return target ? `<${target}${attributes || ''}>` : '';
			})
			.replace(closingPattern, target ? `</${target}>` : '');
	});

	return result;
}; 