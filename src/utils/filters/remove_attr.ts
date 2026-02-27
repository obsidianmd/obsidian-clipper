export const remove_attr = (html: string, removeAttributes: string = ''): string => {
	// If no attributes specified, return unchanged
	if (!removeAttributes) {
		return html;
	}

	// Remove outer parentheses if present
	removeAttributes = removeAttributes.replace(/^\((.*)\)$/, '$1');
	
	// Remove any surrounding quotes (both single and double) and unescape internal quotes
	removeAttributes = removeAttributes.replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\(['"])/g, '$1');
	
	const removeAttributesList = removeAttributes.split(',').map(attr => attr.trim().toLowerCase()).filter(Boolean);

	if (removeAttributesList.length === 0) {
		return html;
	}

	return html.replace(/<(\w+)\s+([^>]*?)>/g, (match: string, tag: string, attributesString: string): string => {
		// Regex to match either a full HTML attribute (name, optional value with different quoting)
		// or a self-closing slash at the end of the attribute string.
		// Group 1: Full attribute text (if an attribute is matched)
		// Group 2: Full slash text (e.g., " /" or "/") (if a slash at the end is matched)
		const attributeOrSlashRegex = /([a-zA-Z0-9_:-]+(?:\s*=\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^'"\s>]+))?)|(\s*\/?\s*$)/g;
		
		// Regex to extract the name from a full attribute string (e.g., from 'class="foo"' extracts 'class')
		const attributeNameExtractorRegex = /^([a-zA-Z0-9_:-]+)/;
		
		const elementsToKeep: string[] = [];
		// If attributesString is empty or just whitespace, matchAll will return an empty array, which is fine.
		const allMatches = Array.from(attributesString.matchAll(attributeOrSlashRegex));

		for (const currentMatch of allMatches) {
			const fullMatchedText = currentMatch[0];
			const attributePart = currentMatch[1]; // Defined if this match is an attribute
			const slashPart = currentMatch[2];     // Defined if this match is a self-closing slash at the end

			if (attributePart) {
				// This match is an attribute
				const nameMatch = attributePart.match(attributeNameExtractorRegex);
				if (nameMatch) {
					const attrName = nameMatch[0];
					// removeAttributesList already contains lowercased names
					const shouldRemove = removeAttributesList.includes(attrName.toLowerCase());
					if (!shouldRemove) {
						elementsToKeep.push(attributePart); // Keep the full original attribute text
					}
				} else {
					// This case should ideally not be reached if attributePart is valid and regex is correct.
					// However, to be safe, if name extraction fails but it was an attributePart, keep it.
					elementsToKeep.push(attributePart);
				}
			} else if (slashPart && fullMatchedText && fullMatchedText.includes('/')) {
				// This match is a self-closing slash (e.g., " /" or "/")
				// Ensure it's genuinely a slash for self-closing, not an empty string from regex matching end-of-string part of slash regex.
				elementsToKeep.push(fullMatchedText.trim()); // Keep the slash, trimmed
			}
		}

		const cleanedAttributes = elementsToKeep.join(' ').trim(); // Trim to remove potential leading/trailing space from join or if elementsToKeep is empty.
		return cleanedAttributes ? `<${tag} ${cleanedAttributes}>` : `<${tag}>`;
	});
}; 