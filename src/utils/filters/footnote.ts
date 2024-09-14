export const footnote = (str: string): string => {
	try {
		const data = JSON.parse(str);
		if (Array.isArray(data)) {
			return data.map((item, index) => `[^${index + 1}]: ${item}`).join('\n\n');
		} else if (typeof data === 'object' && data !== null) {
			return Object.entries(data).map(([key, value]) => {
				const footnoteId = key.replace(/([a-z])([A-Z])/g, '$1-$2')
					.replace(/[\s_]+/g, '-')
					.toLowerCase();
				return `[^${footnoteId}]: ${value}`;
			}).join('\n\n');
		}
	} catch (error) {
		console.error('Error parsing JSON in footnote filter:', error);
	}
	return str;
};