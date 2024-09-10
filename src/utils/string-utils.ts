export function escapeValue(value: string): string {
	return value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function unescapeValue(value: string): string {
	return value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
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