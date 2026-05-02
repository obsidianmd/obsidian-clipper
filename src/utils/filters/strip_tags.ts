export const strip_tags = (html: string, keepTags: string = ''): string => {
	// Remove outer parentheses if present
	keepTags = keepTags.replace(/^\((.*)\)$/, '$1');
	
	// Remove any surrounding quotes (both single and double) and unescape internal quotes
	keepTags = keepTags.replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\(['"])/g, '$1');
	
	const keepTagsList = keepTags.split(',').map(tag => tag.trim()).filter(Boolean);

	let result: string;

	if (keepTagsList.length === 0) {
		// If no tags are specified to keep, remove all tags
		result = html.replace(/<\/?[^>]+(>|$)/g, '');
	} else {
		// Create a regex that matches all tags except those in keepTagsList
		const escapedTags = keepTagsList.map(tag => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
		const regex = new RegExp(`<(?!\\/?(?:${escapedTags})\\b)[^>]+>`, 'gi');
		result = html.replace(regex, '');
	}

	// Convert HTML entities to their corresponding characters
	result = result.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&ldquo;/g, '"')
		.replace(/&rdquo;/g, '"')
		.replace(/&lsquo;/g, "'")
		.replace(/&rsquo;/g, "'")
		.replace(/&mdash;/g, '—')
		.replace(/&ndash;/g, '–')
		.replace(/&hellip;/g, '…')
		.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(Number(dec)))
		.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));

	// Remove excess newlines (more than two consecutive newlines)
	result = result.replace(/\n{3,}/g, '\n\n');

	// Trim leading and trailing whitespace
	return result.trim();
};