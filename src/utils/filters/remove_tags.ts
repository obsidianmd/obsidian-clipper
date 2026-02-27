export const remove_tags = (html: string, removeTags: string = ''): string => {
	// If no tags specified, return unchanged
	if (!removeTags) {
		return html;
	}

	// Remove outer parentheses if present
	removeTags = removeTags.replace(/^\((.*)\)$/, '$1');
	
	// Remove any surrounding quotes (both single and double) and unescape internal quotes
	removeTags = removeTags.replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\(['"])/g, '$1');
	
	const removeTagsList = removeTags.split(',').map(tag => tag.trim()).filter(Boolean);

	if (removeTagsList.length === 0) {
		return html;
	}

	// Create a regex that matches only the specified tags
	const escapedTags = removeTagsList.map(tag => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
	const regex = new RegExp(`<\\/?(?:${escapedTags})\\b[^>]*>`, 'gi');
	
	// Remove only the specified tags while keeping their content
	return html.replace(regex, '');
}; 