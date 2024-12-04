interface ParserState {
	current: string;
	inQuote: boolean;
	quoteType: string;
	inRegex: boolean;
	curlyDepth: number;
	parenDepth: number;
	escapeNext: boolean;
}

export function createParserState(initialCurrent: string = ''): ParserState {
	return {
		current: initialCurrent,
		inQuote: false,
		quoteType: '',
		inRegex: false,
		curlyDepth: 0,
		parenDepth: 0,
		escapeNext: false
	};
}

export function processCharacter(char: string, state: ParserState): void {
	if (state.escapeNext) {
		state.current += char;
		state.escapeNext = false;
		return;
	}

	if (char === '\\') {
		state.current += char;
		if (!state.inRegex) {
			state.escapeNext = true;
		}
		return;
	}

	if ((char === '"' || char === "'") && !state.inRegex) {
		state.inQuote = !state.inQuote;
		state.quoteType = state.inQuote ? char : '';
		state.current += char;
		return;
	}

	if (char === '/' && !state.inQuote && !state.inRegex && 
		(state.current.endsWith(':') || state.current.endsWith(','))) {
		state.inRegex = true;
		state.current += char;
		return;
	}

	if (char === '/' && state.inRegex && !state.escapeNext) {
		state.inRegex = false;
		state.current += char;
		return;
	}

	if (char === '{') {
		state.curlyDepth++;
		state.current += char;
		return;
	}

	if (char === '}') {
		state.curlyDepth--;
		state.current += char;
		return;
	}

	if (char === '(' && !state.inQuote) {
		state.parenDepth++;
		state.current += char;
		return;
	}

	if (char === ')' && !state.inQuote) {
		state.parenDepth--;
		state.current += char;
		return;
	}

	state.current += char;
}

export function isRegexPattern(str: string): boolean {
	return /^\/(.+)\/([gimsuy]*)$/.test(str);
}

export function parseRegexPattern(pattern: string): { pattern: string; flags: string } | null {
	const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
	if (!match) return null;
	return {
		pattern: match[1],
		flags: match[2]
	};
}