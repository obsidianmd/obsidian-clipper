import { getDomain } from './string-utils';

export interface LightweightPageMetadata {
	title: string;
	author: string;
	description: string;
	domain: string;
	favicon: string;
	image: string;
	published: string;
	site: string;
	language: string;
	metaTags: { name?: string | null; property?: string | null; content: string | null }[];
}

function getMetaContent(document: Document, selectors: string[]): string {
	for (const selector of selectors) {
		const value = document.querySelector<HTMLMetaElement>(selector)?.content?.trim();
		if (value) return value;
	}
	return '';
}

function toAbsoluteUrl(value: string, baseUrl: string): string {
	if (!value) return '';
	try {
		return new URL(value, baseUrl).href;
	} catch {
		return value;
	}
}

export function getLightweightPageMetadata(document: Document): LightweightPageMetadata {
	const metaTags = Array.from(document.querySelectorAll<HTMLMetaElement>('meta')).map(meta => ({
		name: meta.getAttribute('name'),
		property: meta.getAttribute('property'),
		content: meta.getAttribute('content'),
	}));
	const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href || '';

	return {
		title: document.title,
		author: getMetaContent(document, ['meta[name="author"]', 'meta[property="article:author"]']),
		description: getMetaContent(document, ['meta[name="description"]', 'meta[property="og:description"]']),
		domain: getDomain(document.URL),
		favicon,
		image: toAbsoluteUrl(getMetaContent(document, ['meta[property="og:image"]', 'meta[name="twitter:image"]']), document.baseURI),
		published: getMetaContent(document, ['meta[property="article:published_time"]', 'meta[name="date"]']),
		site: getMetaContent(document, ['meta[property="og:site_name"]']) || document.location.hostname,
		language: document.documentElement.lang || '',
		metaTags,
	};
}

export function countWordsInHtml(html: string, document: Document): number {
	const container = document.createElement('div');
	container.innerHTML = html;
	const text = container.textContent?.trim() || '';
	return text ? text.split(/\s+/).length : 0;
}
