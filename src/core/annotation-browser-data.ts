import { normalizeHighlightCreatedAt } from '../utils/highlight-timestamp-utils';

interface AnnotationStorageHighlight {
	id?: string;
	createdAt?: number;
}

export interface AnnotationBrowserPage {
	url: string;
	title: string;
	siteLabel: string;
	path: string;
	annotationsCount: number;
	firstCreatedAt: number;
	lastCreatedAt: number;
}

export interface AnnotationBrowserSnapshot {
	totalPages: number;
	totalAnnotations: number;
	recentPages: AnnotationBrowserPage[];
	mostAnnotatedPages: AnnotationBrowserPage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function getHighlightCreatedAt(highlight: unknown): number | null {
	if (!isRecord(highlight)) {
		return null;
	}

	return normalizeHighlightCreatedAt(highlight.createdAt, highlight.id);
}

function parseUrl(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function decodeUriComponentSafe(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function normalizeTitleSegment(segment: string): string {
	const withoutExtension = segment.replace(/\.[a-z0-9]{2,5}$/i, '');
	const decoded = decodeUriComponentSafe(withoutExtension);
	return decoded.replace(/[+_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isWikipediaHost(hostname: string): boolean {
	return hostname === 'wikipedia.org' || hostname.endsWith('.wikipedia.org');
}

function derivePageTitle(url: URL): string {
	if (isWikipediaHost(url.hostname) && url.pathname.startsWith('/wiki/')) {
		const wikiSlug = url.pathname.slice('/wiki/'.length);
		const wikiTitle = normalizeTitleSegment(wikiSlug);
		if (wikiTitle.length > 0) {
			return wikiTitle;
		}
	}

	const pathSegments = url.pathname.split('/').filter((segment) => segment.length > 0);
	for (let index = pathSegments.length - 1; index >= 0; index--) {
		const title = normalizeTitleSegment(pathSegments[index]);
		if (title.length > 0) {
			return title;
		}
	}

	return url.hostname;
}

function deriveSiteLabel(url: URL): string {
	if (isWikipediaHost(url.hostname)) {
		return `Wikipedia (${url.hostname})`;
	}

	return url.hostname;
}

function derivePathLabel(url: URL): string {
	if (!url.pathname || url.pathname === '/') {
		return '/';
	}

	return decodeUriComponentSafe(url.pathname);
}

function sortByMostRecentLast(left: AnnotationBrowserPage, right: AnnotationBrowserPage): number {
	if (right.lastCreatedAt !== left.lastCreatedAt) {
		return right.lastCreatedAt - left.lastCreatedAt;
	}

	if (right.annotationsCount !== left.annotationsCount) {
		return right.annotationsCount - left.annotationsCount;
	}

	return left.title.localeCompare(right.title);
}

function sortByMostAnnotations(left: AnnotationBrowserPage, right: AnnotationBrowserPage): number {
	if (right.annotationsCount !== left.annotationsCount) {
		return right.annotationsCount - left.annotationsCount;
	}

	if (right.lastCreatedAt !== left.lastCreatedAt) {
		return right.lastCreatedAt - left.lastCreatedAt;
	}

	return left.title.localeCompare(right.title);
}

export function buildAnnotationBrowserSnapshot(rawHighlightsStorage: unknown): AnnotationBrowserSnapshot {
	if (!isRecord(rawHighlightsStorage)) {
		return {
			totalPages: 0,
			totalAnnotations: 0,
			recentPages: [],
			mostAnnotatedPages: []
		};
	}

	const pages: AnnotationBrowserPage[] = [];
	let totalAnnotations = 0;

	for (const [storageKey, rawEntry] of Object.entries(rawHighlightsStorage)) {
		if (!isRecord(rawEntry)) {
			continue;
		}

		const rawUrl = typeof rawEntry.url === 'string' ? rawEntry.url : storageKey;
		const parsedUrl = parseUrl(rawUrl);
		if (!parsedUrl) {
			continue;
		}

		const highlights = Array.isArray(rawEntry.highlights) ? rawEntry.highlights : [];
		if (highlights.length === 0) {
			continue;
		}

		const highlightTimestamps: number[] = [];
		for (const highlight of highlights) {
			const createdAt = getHighlightCreatedAt(highlight);
			if (createdAt !== null) {
				highlightTimestamps.push(createdAt);
			}
		}

		if (highlightTimestamps.length === 0) {
			continue;
		}

		const annotationsCount = highlightTimestamps.length;
		totalAnnotations += annotationsCount;

		pages.push({
			url: parsedUrl.toString(),
			title: derivePageTitle(parsedUrl),
			siteLabel: deriveSiteLabel(parsedUrl),
			path: derivePathLabel(parsedUrl),
			annotationsCount,
			firstCreatedAt: Math.min(...highlightTimestamps),
			lastCreatedAt: Math.max(...highlightTimestamps)
		});
	}

	return {
		totalPages: pages.length,
		totalAnnotations,
		recentPages: [...pages].sort(sortByMostRecentLast),
		mostAnnotatedPages: [...pages].sort(sortByMostAnnotations)
	};
}
