const EPHEMERAL_PARAMS = new Set([
	't',           // YouTube timestamp
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', // UTM tracking
	'ref', 'source', 'src',   // Referral
	'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid', // Ad click IDs
	'mc_cid', 'mc_eid',       // Mailchimp
	'_ga', '_gl',             // Google Analytics
	'si',                     // YouTube share tracking
]);

export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Strip fragment identifiers — highlights on /page#section should
		// match /page (fixes #652).
		parsed.hash = '';
		const params = new URLSearchParams(parsed.search);
		for (const key of [...params.keys()]) {
			if (EPHEMERAL_PARAMS.has(key)) {
				params.delete(key);
			}
		}
		parsed.search = params.toString();
		return parsed.toString();
	} catch {
		return url;
	}
}

// Highlights are stored under the normalized URL, but older entries may still
// sit under the raw URL.
export function hasStoredHighlights(allHighlights: unknown, rawUrl: string): boolean {
	const all = (allHighlights || {}) as Record<string, { highlights?: unknown[] } | undefined>;
	const stored = all[normalizeUrl(rawUrl)] ?? all[rawUrl];
	return Array.isArray(stored?.highlights) && stored.highlights.length > 0;
}
