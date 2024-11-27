export const replace = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	console.log('Initial param:', param);

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');
	console.log('After removing parentheses:', param);

	// Split into multiple replacements if commas are present, but respect quotes and regex patterns
	const replacements = [];
	let current = '';
	let inQuote = false;
	let quoteType = '';
	let inRegex = false;
	let curlyDepth = 0;  // Track curly brace depth
	let parenDepth = 0;  // Track parentheses depth
	let escapeNext = false;

	for (let i = 0; i < param.length; i++) {
		const char = param[i];

		if (escapeNext) {
			current += char;
			escapeNext = false;
		} else if (char === '\\') {
			current += char;
			escapeNext = true;
		} else if ((char === '"' || char === "'") && !inRegex) {
			inQuote = !inQuote;
			quoteType = inQuote ? char : '';
			current += char;
		} else if (char === '/' && !inQuote && !inRegex && (current.endsWith(':') || current.endsWith(','))) {
			inRegex = true;
			current += char;
		} else if (char === '/' && inRegex && !escapeNext) {
			inRegex = false;
			current += char;
		} else if (char === '{') {
			curlyDepth++;
			current += char;
		} else if (char === '}') {
			curlyDepth--;
			current += char;
		} else if (char === '(' && !inQuote) {
			parenDepth++;
			current += char;
		} else if (char === ')' && !inQuote) {
			parenDepth--;
			current += char;
		} else if (char === ',' && !inQuote && !inRegex && curlyDepth === 0 && parenDepth === 0) {
			replacements.push(current.trim());
			current = '';
		} else {
			current += char;
		}
	}

	if (current) {
		replacements.push(current.trim());
	}

	console.log('Split replacements:', replacements);

	// Apply each replacement in sequence
	return replacements.reduce((acc, replacement) => {
		console.log('Processing replacement:', replacement);

		let [search, replace] = replacement.split(/(?<!\\):/).map(p => {
			// Remove surrounding quotes but preserve escaped characters
			return p.trim().replace(/^["']|["']$/g, '');
		});

		console.log('Search:', search);
		console.log('Replace:', replace);

		// Use an empty string if replace is undefined
		replace = replace || '';

		// Check if this is a regex pattern
		const regexMatch = search.match(/^\/(.+)\/([gimsuy]*)$/);
		if (regexMatch) {
			try {
				const [, pattern, flags] = regexMatch;
				console.log('Regex pattern:', pattern);
				console.log('Regex flags:', flags);
				
				// Keep escaped characters in the pattern
				const regex = new RegExp(pattern, flags);
				return acc.replace(regex, replace);
			} catch (error) {
				console.error('Invalid regex pattern:', error);
				return acc;
			}
		}

		// Handle escaped sequences for non-regex replacements
		search = search.replace(/\\(.)/g, '$1');
		replace = replace.replace(/\\(.)/g, '$1');

		// For | and : characters, use string.split and join
		if (search === '|' || search === ':') {
			return acc.split(search).join(replace);
		}

		// Escape special regex characters for literal string replacement
		const searchRegex = new RegExp(search.replace(/([.*+?^${}()[\]\\])/g, '\\$1'), 'g');
		return acc.replace(searchRegex, replace);
	}, str);
};