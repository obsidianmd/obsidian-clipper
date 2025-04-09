import { createParserState, processCharacter, parseRegexPattern } from '../parser-utils';

export const replace = (str: string, param?: string): string => {
	if (!param) {
		return str;
	}

	// Remove outer parentheses if present
	param = param.replace(/^\((.*)\)$/, '$1');

	// Split into multiple replacements if commas are present
	const replacements = [];
	const state = createParserState();

	for (let i = 0; i < param.length; i++) {
		const char = param[i];

		if (char === ',' && !state.inQuote && !state.inRegex &&
			state.curlyDepth === 0 && state.parenDepth === 0) {
			replacements.push(state.current.trim());
			state.current = '';
		} else {
			processCharacter(char, state);
		}
	}

	if (state.current) {
		replacements.push(state.current.trim());
	}

	// Apply each replacement in sequence
	return replacements.reduce((acc, replacement) => {
		let [search, replace] = replacement.split(/(?<=[^\\]["']):(?=["'])/).map(p => {
			// Remove surrounding quotes but preserve escaped characters
			return p.trim().replace(/^["']|["']$/g, '');
		});

		// Use an empty string if replace is undefined
		replace = replace || '';

		// Check if this is a regex pattern
		const regexInfo = parseRegexPattern(search);
		if (regexInfo) {
			try {
				// Process escaped sequences in replacement string
				replace = processEscapedCharacters(replace);
				const regex = new RegExp(regexInfo.pattern, regexInfo.flags);
				return acc.replace(regex, replace);
			} catch (error) {
				console.error('Invalid regex pattern:', error);
				return acc;
			}
		}

		// Handle escaped sequences for both search and replace
		search = processEscapedCharacters(search);
		replace = processEscapedCharacters(replace);

		// For | and : characters, use string.split and join
		if (search === '|' || search === ':') {
			return acc.split(search).join(replace);
		}

		// For literal newlines and other special regex characters, use split and join
		if (search.includes('\n') || search.includes('\r') || search.includes('\t')) {
			return acc.split(search).join(replace);
		}

		// Escape special regex characters for literal string replacement
		const searchRegex = new RegExp(search.replace(/([.*+?^${}()[\]\\])/g, '\\$1'), 'g');
		return acc.replace(searchRegex, replace);
	}, str);
};

function processEscapedCharacters(str: string): string {
	return str.replace(/\\([nrt]|[^nrt])/g, (match, char) => {
		switch (char) {
			case 'n': return '\n';
			case 'r': return '\r';
			case 't': return '\t';
			default: return char;
		}
	});
}