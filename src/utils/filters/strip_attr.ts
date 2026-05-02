export const strip_attr = (html: string, keepAttributes: string = ''): string => {
	// Remove outer parentheses if present
	keepAttributes = keepAttributes.replace(/^\((.*)\)$/, '$1');
	
	// Remove any surrounding quotes (both single and double) and unescape internal quotes
	keepAttributes = keepAttributes.replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\(['"])/g, '$1');
	
	const keepAttributesList = keepAttributes.split(',').map(attr => attr.trim()).filter(Boolean);

	return html.replace(/<(\w+)\s+(?:[^>]*?)>/g, (match, tag) => {
		if (keepAttributesList.length === 0) {
			return `<${tag}>`;
		}

		const keepAttrs = keepAttributesList.map(attr => {
			const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`\\s${escapedAttr}\\s*=\\s*("[^"]*"|'[^']*')`, 'i');
			const attrMatch = match.match(regex);
			return attrMatch ? attrMatch[0].trim() : '';
		}).filter(Boolean).join(' ');

		return keepAttrs ? `<${tag} ${keepAttrs}>` : `<${tag}>`;
	});
};