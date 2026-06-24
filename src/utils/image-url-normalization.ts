export interface HtmlDocumentParser {
	parseFromString(html: string, mimeType: string): Document;
}

const LAZY_IMAGE_ATTRIBUTES = [
	'data-src',
	'data-original',
	'data-lazy-src',
	'data-actualsrc',
	'data-backup',
];

function getParser(parser?: HtmlDocumentParser): HtmlDocumentParser | null {
	if (parser) return parser;
	if (typeof DOMParser === 'undefined') return null;
	return new DOMParser();
}

function resolveHttpUrl(value: string, baseUrl: URL): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	try {
		const url = new URL(trimmed, baseUrl);
		return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
	} catch {
		return null;
	}
}

function isReplaceableImageSrc(value: string | null): boolean {
	if (value === null) return true;
	const trimmed = value.trim();
	return trimmed === '' || trimmed.startsWith('data:image/');
}

function findLazyImageUrl(img: Element, baseUrl: URL): string | null {
	for (const attribute of LAZY_IMAGE_ATTRIBUTES) {
		const value = img.getAttribute(attribute);
		if (!value) continue;

		const resolved = resolveHttpUrl(value, baseUrl);
		if (resolved) return resolved;
	}

	return null;
}

function normalizeSrcset(srcset: string, baseUrl: URL): string {
	return srcset
		.split(',')
		.map(candidate => {
			const trimmed = candidate.trim();
			if (!trimmed) return trimmed;

			const [urlPart, ...descriptorParts] = trimmed.split(/\s+/);
			const resolvedUrl = resolveHttpUrl(urlPart, baseUrl);
			if (!resolvedUrl) return trimmed;

			const descriptor = descriptorParts.join(' ');
			return descriptor ? `${resolvedUrl} ${descriptor}` : resolvedUrl;
		})
		.join(', ');
}

function serializeBody(doc: Document): string {
	if (doc.body) return doc.body.innerHTML;
	return doc.documentElement?.outerHTML || '';
}

export function normalizeImageUrls(
	htmlContent: string,
	baseUrl: string | URL,
	parser?: HtmlDocumentParser
): string {
	const documentParser = getParser(parser);
	if (!documentParser) return htmlContent;

	let resolvedBaseUrl: URL;
	try {
		resolvedBaseUrl = new URL(baseUrl.toString());
	} catch {
		return htmlContent;
	}

	const doc = documentParser.parseFromString(`<!doctype html><html><body>${htmlContent}</body></html>`, 'text/html');
	doc.querySelectorAll('img').forEach(img => {
		const srcset = img.getAttribute('srcset');
		if (srcset) {
			img.setAttribute('srcset', normalizeSrcset(srcset, resolvedBaseUrl));
		}

		const currentSrc = img.getAttribute('src');
		if (!isReplaceableImageSrc(currentSrc)) return;

		const lazyUrl = findLazyImageUrl(img, resolvedBaseUrl);
		if (lazyUrl) {
			img.setAttribute('src', lazyUrl);
		}
	});

	return serializeBody(doc);
}
