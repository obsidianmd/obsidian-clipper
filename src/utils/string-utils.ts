export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeMarkdown(str: string): string {
	return str.replace(/([[\]])/g, '\\$1');
}

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
	const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
	const isWindows = /win/i.test(platform);
	const isMac = /mac/i.test(platform);

	// First remove Obsidian-specific characters that should be sanitized across all platforms
	let sanitized = fileName.replace(/[#|\^\[\]]/g, '');

	if (isWindows) {
		sanitized = sanitized
			.replace(/[<>:"\/\\?*\x00-\x1F]/g, '')
			.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '_$1$2')
			.replace(/[\s.]+$/, '');
	} else if (isMac) {
		sanitized = sanitized
			.replace(/[\/:\x00-\x1F]/g, '')
			.replace(/^\./, '_');
	} else {
		// Linux and other systems
		sanitized = sanitized
			.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '')
			.replace(/^\./, '_');
	}

	// Common operations for all platforms
	sanitized = sanitized
		.replace(/^\.+/, '') // Remove leading periods
		.trim()
		.slice(0, 245); // Trim to 245 characters, leaving room to append ' 1.md'

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

			return `
				<div class="variable-item is-collapsed">
					<span class="variable-key" data-variable="${escapeHtml(key)}">${escapeHtml(cleanKey)}</span>
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

// Cases to handle:
// Full URLs: https://example.com/x.png
// URLs without protocol: //example.com/x.png
// Relative URLs:
// - x.png
// - /x.png
// - img/x.png
// - ../x.png

export function makeUrlAbsolute(element: Element, attributeName: string, baseUrl: URL) {
	const attributeValue = element.getAttribute(attributeName);
	if (attributeValue) {
		try {
			// Create a new URL object from the base URL
			const resolvedBaseUrl = new URL(baseUrl.href);
			
			// If the base URL points to a file, remove the filename to get the directory
			if (!resolvedBaseUrl.pathname.endsWith('/')) {
				resolvedBaseUrl.pathname = resolvedBaseUrl.pathname.substring(0, resolvedBaseUrl.pathname.lastIndexOf('/') + 1);
			}
			
			const url = new URL(attributeValue, resolvedBaseUrl);
			
			if (!['http:', 'https:'].includes(url.protocol)) {
				// Handle non-standard protocols (chrome-extension://, moz-extension://, brave://, etc.)
				const parts = attributeValue.split('/');
				const firstSegment = parts[2]; // The segment after the protocol

				if (firstSegment && firstSegment.includes('.')) {
					// If it looks like a domain, replace the non-standard protocol with the current page's protocol
					const newUrl = `${baseUrl.protocol}//` + attributeValue.split('://')[1];
					element.setAttribute(attributeName, newUrl);
				} else {
					// If it doesn't look like a domain it's probably the extension URL, remove the non-standard protocol part and use baseUrl
					const path = parts.slice(3).join('/');
					const newUrl = new URL(path, resolvedBaseUrl.origin + resolvedBaseUrl.pathname).href;
					element.setAttribute(attributeName, newUrl);
				}
			} else {
				// Handle other cases (relative URLs, protocol-relative URLs)
				const newUrl = url.href;
				element.setAttribute(attributeName, newUrl);
			}
		} catch (error) {
			console.warn(`Failed to process URL: ${attributeValue}`, error);
			element.setAttribute(attributeName, attributeValue);
		}
	}
}

export function processUrls(htmlContent: string, baseUrl: URL): string {
	const tempDiv = document.createElement('div');
	tempDiv.innerHTML = htmlContent;
	
	// Handle relative URLs for both images and links
	tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'srcset', baseUrl));
	tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src', baseUrl));
	tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href', baseUrl));
	
	return tempDiv.innerHTML;
}

export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	} else {
		return `${(ms / 1000).toFixed(2)}s`;
	}
}