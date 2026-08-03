// Second-level labels that act as a public suffix under a country TLD, so that
// bbc.co.uk keeps three labels while example.de keeps two. This is a heuristic
// rather than the full public suffix list, covering the registries people
// actually clip from.
const COUNTRY_SECOND_LEVEL = new Set([
	'ac', 'co', 'com', 'edu', 'go', 'gov', 'in', 'me', 'mil', 'ne', 'net',
	'nom', 'or', 'org', 'sch',
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Reduces a hostname or URL to its registrable domain: the name that was
 * actually registered, without subdomains.
 *
 * news.ycombinator.com -> ycombinator.com
 * www.bbc.co.uk        -> bbc.co.uk
 */
export const root_domain = (str: string): string => {
	if (!str) return str;

	let host = str.trim();

	// Accept a full URL as well as a bare hostname
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) {
		try {
			host = new URL(host).hostname;
		} catch (error) {
			// Fall through and treat the input as a hostname
		}
	}

	// Drop credentials, port, path and a fully-qualified trailing dot
	host = host.replace(/^[^/@]*@/, '').split('/')[0].split(':')[0].replace(/\.$/, '').toLowerCase();

	if (!host || IPV4.test(host)) return host;

	const labels = host.split('.');
	if (labels.length <= 2) return host;

	const tld = labels[labels.length - 1];
	const secondLevel = labels[labels.length - 2];
	const keep = tld.length === 2 && COUNTRY_SECOND_LEVEL.has(secondLevel) ? 3 : 2;

	return labels.slice(-keep).join('.');
};
