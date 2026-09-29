// Prefer the browser language, then the source document's language.
export function getPreferredLanguage(doc?: Document): string | undefined {
	if (typeof navigator !== 'undefined' && navigator.language) {
		return navigator.language;
	}
	return doc?.documentElement?.lang || undefined;
}
