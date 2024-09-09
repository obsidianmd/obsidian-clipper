export function escapeValue(value: string): string {
	return value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function unescapeValue(value: string): string {
	return value.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

export function formatVariables(variables: { [key: string]: string }): string {
	return Object.entries(variables)
		.map(([key, value]) => `
			<div class="variable-item is-collapsed">
			<span class="chevron-icon" aria-label="Expand">
					<i data-lucide="chevron-right"></i>
				</span>
				<span class="variable-key" data-variable="${escapeHtml(key)}">${escapeHtml(key)}</span>
				<span class="variable-value">${escapeHtml(value)}</span>
			</div>
		 `)
		.join('');
}

function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}