export const strip_attr = (html: string, keepAttributes: string = ''): string => {
	// Remove any surrounding quotes and unescape internal quotes
	keepAttributes = keepAttributes.replace(/^['"](.*)['"]$/, '$1').replace(/\\"/g, '"');
	
	const keepAttributesList = keepAttributes.split(',').map(attr => attr.trim()).filter(Boolean);

	return html.replace(/<(\w+)\s+(?:[^>]*?)>/g, (match, tag) => {
		if (keepAttributesList.length === 0) {
			return `<${tag}>`;
		}

		const keepAttrs = keepAttributesList.map(attr => {
			// Escape special regex characters in the attribute name
			const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`\\s${escapedAttr}\\s*=\\s*("[^"]*"|'[^']*')`, 'i');
			const attrMatch = match.match(regex);
			return attrMatch ? attrMatch[0] : '';
		}).filter(Boolean).join(' ');

		return `<${tag}${keepAttrs ? ' ' + keepAttrs : ''}>`;
	});
};