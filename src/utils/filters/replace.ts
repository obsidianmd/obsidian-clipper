import { standardFilters, type TemplateFilter } from 'knap';

const GROUP_REF = /\$(\d+|&|`|')/;
const QUOTED_PAIR =
	/(["'])((?:\\.|(?!\1)[\s\S])*?)\1\s*:\s*(?:(["'])((?:\\.|(?!\3)[\s\S])*?)\3)?/g;

function parseRegexPattern(pattern: string): { pattern: string; flags: string } | null {
	const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
	if (!match) {
		return null;
	}
	return { pattern: match[1], flags: match[2] };
}

/**
 * Capture-group replacements ($1, $&, …) must not fall through to the original
 * string when the regex does not match. JS String.replace does, which dumps
 * full page text into clipper fields (#589).
 */
function groupRefRegexMisses(input: string, param: string): boolean {
	const cleaned = param.replace(/^\((.*)\)$/, '$1');
	QUOTED_PAIR.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = QUOTED_PAIR.exec(cleaned))) {
		const search = match[2];
		const replacement = match[4] ?? '';
		const regexInfo = parseRegexPattern(search);
		if (!regexInfo || !GROUP_REF.test(replacement)) {
			continue;
		}
		try {
			// Probe without /g so lastIndex cannot skip later replaces.
			const probeFlags = regexInfo.flags.replace(/g/g, '');
			const probe = new RegExp(regexInfo.pattern, probeFlags);
			if (!probe.test(input)) {
				return true;
			}
		} catch {
			continue;
		}
	}
	return false;
}

export const replace: TemplateFilter = (value, param, context) => {
	if (typeof value === 'string' && param && groupRefRegexMisses(value, param)) {
		return '';
	}
	return standardFilters.replace(value, param, context);
};

replace.metadata = standardFilters.replace.metadata ?? {};
