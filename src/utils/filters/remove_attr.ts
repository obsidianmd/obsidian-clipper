export const remove_attr = (html: string, removeAttributes: string = ''): string => {
	// If no attributes specified, return unchanged
	if (!removeAttributes) {
		return html;
	}

	// Remove outer parentheses if present
	removeAttributes = removeAttributes.replace(/^\((.*)\)$/, '$1');
	
	// Remove any surrounding quotes (both single and double) and unescape internal quotes
	removeAttributes = removeAttributes.replace(/^(['"])(.*)\1$/, '$2').replace(/\\(['"])/g, '$1');
	
	const removeAttributesList = removeAttributes.split(',').map(attr => attr.trim()).filter(Boolean);

	if (removeAttributesList.length === 0) {
		return html;
	}

	return html.replace(/<(\w+)\s+([^>]*?)>/g, (match, tag, attributes) => {
		// For each attribute in the tag
		const cleanedAttributes = attributes.split(/\s+/).filter(attr => {
			// Keep the attribute if it's not in the remove list
			return !removeAttributesList.some(removeAttr => 
				attr.toLowerCase().startsWith(removeAttr.toLowerCase() + '=')
			);
		}).join(' ');

		return cleanedAttributes ? `<${tag} ${cleanedAttributes}>` : `<${tag}>`;
	});
}; 