const EPHEMERAL_PARAMS = new Set([
	't',
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
	'ref', 'source', 'src',
	'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid',
	'mc_cid', 'mc_eid',
	'_ga', '_gl',
	'si',
]);

export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
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
