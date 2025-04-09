export const safe_name = (str: string, param?: string): string => {
	const os = param ? param.toLowerCase().trim() : 'default';

	let sanitized = str;

	// First remove Obsidian-specific characters that should be sanitized across all platforms
	sanitized = sanitized.replace(/[#|\^\[\]]/g, '');

	switch (os) {
		case 'windows':
			sanitized = sanitized
				.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '')
				.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '_$1$2')
				.replace(/[\s.]+$/, '');
			break;
		case 'mac':
			sanitized = sanitized
				.replace(/[\/:\x00-\x1F]/g, '')
				.replace(/^\./, '_');
			break;
		case 'linux':
			sanitized = sanitized
				.replace(/[\/\x00-\x1F]/g, '')
				.replace(/^\./, '_');
			break;
		default:
			// Most conservative approach (combination of all rules)
			sanitized = sanitized
				.replace(/[<>:"\/\\|?*:\x00-\x1F]/g, '')
				.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '_$1$2')
				.replace(/[\s.]+$/, '')
				.replace(/^\./, '_');
			break;
	}

	// Common operations for all platforms
	sanitized = sanitized
		.replace(/^\.+/, '') // Remove leading periods
		.slice(0, 245); // Trim to leave room for ' 1.md'

	// Ensure the file name is not empty
	if (sanitized.length === 0) {
		sanitized = 'Untitled';
	}

	return sanitized;
};