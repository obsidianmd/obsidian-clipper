export function escapeValue(value: string): string {
	return value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function unescapeValue(value: string): string {
	return value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

export function escapeDoubleQuotes(str: string): string {
	return str.replace(/"/g, '\\"');
}

export function sanitizeFileName(fileName: string): string {
	const isWindows = navigator.platform.indexOf('Win') > -1;
	const isMac = navigator.platform.indexOf('Mac') > -1;

	let sanitized = fileName;

	if (isWindows) {
		sanitized = sanitized
			.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '-')
			.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '_$1$2')
			.replace(/[\s.]+$/, '');
	} else if (isMac) {
		sanitized = sanitized
			.replace(/[\/:\x00-\x1F]/g, '-')
			.replace(/^\./, '_');
	} else {
		// Linux and other systems
		sanitized = sanitized
			.replace(/[\/\x00-\x1F]/g, '-')
			.replace(/^\./, '_');
	}

	// Common operations for all platforms
	sanitized = sanitized
		.replace(/^\.+/, '') // Remove leading periods
		.slice(0, 255); // Trim to 255 characters

	// Ensure the file name is not empty
	if (sanitized.length === 0) {
		sanitized = 'Untitled';
	}

	return sanitized;
}

export function formatVariables(variables: { [key: string]: string }): string {
	return Object.entries(variables)
		.map(([key, value]) => {
			// Remove the outer curly braces from the key
			const cleanKey = key.replace(/^{{|}}$/g, '');
			
			// Add the dot back for schema variables with array notation
			const formattedKey = cleanKey.replace(/^(schema:.+?\])(.+)/, '$1.$2');
			
			return `
				<div class="variable-item is-collapsed">
					<span class="variable-key" data-variable="${escapeHtml(key)}">${escapeHtml(formattedKey)}</span>
					<span class="variable-value">${escapeHtml(value)}</span>
					<span class="chevron-icon" aria-label="Expand">
						<i data-lucide="chevron-right"></i>
					</span>
				</div>
			`;
		})
		.join('');
}

export function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}