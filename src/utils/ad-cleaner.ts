export interface CleanPageOptions {
	/** Page URL, used only for reporting and future site-specific tuning. */
	url?: string;
	/** Remove modal, cookie, newsletter, paywall, and app-install overlays. Default: true. */
	removeOverlays?: boolean;
	/** Remove sponsored/recommendation widgets such as Taboola/Outbrain. Default: true. */
	removeSponsored?: boolean;
	/** Remove ad/network iframes. Default: true. */
	removeIframes?: boolean;
	/** Remove empty containers left after ad nodes are removed. Default: true. */
	removeEmpty?: boolean;
	/** Selectors that should never be removed even if they match an ad selector. */
	preserveSelectors?: string[];
}

export interface CleanPageRemovalReport {
	googleAds: number;
	adIframes: number;
	genericAds: number;
	overlays: number;
	sponsored: number;
	empty: number;
}

export interface CleanPageResult {
	html: string;
	removed: CleanPageRemovalReport;
}

export interface DocumentParserLike {
	parseFromString(html: string, mimeType: string): Document;
}

const DEFAULT_REPORT: CleanPageRemovalReport = {
	googleAds: 0,
	adIframes: 0,
	genericAds: 0,
	overlays: 0,
	sponsored: 0,
	empty: 0,
};

const GOOGLE_AD_SELECTORS = [
	// Google AdSense
	'ins.adsbygoogle',
	'[class~="adsbygoogle" i]',
	'[class*="adsbygoogle" i]',
	'[data-ad-client]',
	'[data-ad-host]',
	'[data-ad-slot]',
	'[data-ad-format]',
	'[data-full-width-responsive]',

	// Google Ad Manager / Publisher Tag slots
	'[id^="google_ads" i]',
	'[id*="google_ads" i]',
	'[id^="div-gpt-ad" i]',
	'[id*="div-gpt-ad" i]',
	'[id*="gpt-ad" i]',
	'[class*="gpt-ad" i]',

	// AMP ads
	'amp-ad[type="adsense" i]',
	'amp-ad[type="doubleclick" i]',
	'amp-embed[type="adsense" i]',
	'amp-embed[type="doubleclick" i]',

	// Google ad scripts that may survive when fullHtml is post-cleaned.
	'script[src*="googlesyndication.com" i]',
	'script[src*="googletagservices.com" i]',
	'script[src*="securepubads.g.doubleclick.net" i]',
	'script[src*="pagead2.googlesyndication.com" i]',
].join(',');

const AD_IFRAME_SELECTOR = [
	'iframe[src*="googlesyndication.com" i]',
	'iframe[src*="doubleclick.net" i]',
	'iframe[src*="googleads.g.doubleclick.net" i]',
	'iframe[src*="securepubads.g.doubleclick.net" i]',
	'iframe[src*="googletagservices.com" i]',
	'iframe[src*="googleadservices.com" i]',
	'iframe[src*="adservice.google." i]',
	'iframe[src*="adnxs.com" i]',
	'iframe[src*="adsystem.com" i]',
	'iframe[src*="amazon-adsystem.com" i]',
	'iframe[src*="taboola.com" i]',
	'iframe[src*="outbrain.com" i]',
].join(',');

const GENERIC_AD_SELECTORS = [
	'.ad',
	'.ads',
	'.advertisement',
	'.ad-container',
	'.ad-wrapper',
	'.ad-banner',
	'.ad-slot',
	'.ad-unit',
	'.adbox',
	'.advert',
	'.advertising',
	'[id="ad" i]',
	'[id="ads" i]',
	'[id^="ad-" i]',
	'[id$="-ad" i]',
	'[id*="-ad-" i]',
	'[id^="ads-" i]',
	'[id$="-ads" i]',
	'[class^="ad-" i]',
	'[class$="-ad" i]',
	'[class*="-ad-" i]',
	'[class^="ads-" i]',
	'[class$="-ads" i]',
	'[data-ad]',
	'[data-ad-id]',
	'[data-ad-unit]',
	'[data-ad-wrapper]',
	'[data-advertising]',
	'[aria-label*="advertisement" i]',
	'[aria-label*="advertising" i]',
	'[alt*="advertisement" i]',
	'[alt*="advertising" i]',
].join(',');

const OVERLAY_SELECTORS = [
	'[role="dialog" i]',
	'[role="alertdialog" i]',
	'[aria-modal="true" i]',
	'dialog',
	'.modal',
	'.popup',
	'.pop-up',
	'.newsletter-popup',
	'.subscribe-popup',
	'.subscription-modal',
	'.cookie-banner',
	'.cookie-consent',
	'.cookie-notice',
	'.consent-banner',
	'.gdpr-banner',
	'.paywall',
	'.metered-paywall',
	'[id*="cookie" i][class*="banner" i]',
	'[class*="cookie" i][class*="banner" i]',
	'[class*="consent" i][class*="banner" i]',
	'[class*="newsletter" i][class*="modal" i]',
	'[class*="subscribe" i][class*="modal" i]',
].join(',');

const SPONSORED_SELECTORS = [
	'[rel="sponsored" i]',
	'[data-sponsored]',
	'[class*="sponsored" i]',
	'[id*="sponsored" i]',
	'[class*="promoted" i]',
	'[id*="promoted" i]',
	'[class*="taboola" i]',
	'[id*="taboola" i]',
	'[class*="outbrain" i]',
	'[id*="outbrain" i]',
	'[class*="revcontent" i]',
	'[id*="revcontent" i]',
	'[class*="recommendation-widget" i]',
	'[id*="recommendation-widget" i]',
].join(',');

function cloneReport(): CleanPageRemovalReport {
	return { ...DEFAULT_REPORT };
}

function queryAll(root: ParentNode, selector: string): Element[] {
	try {
		return Array.from(root.querySelectorAll(selector));
	} catch (error) {
		console.warn('[Obsidian Clipper] Invalid clean-page selector:', selector, error);
		return [];
	}
}

function shouldPreserve(element: Element, preserveSelectors: string[]): boolean {
	for (const selector of preserveSelectors) {
		try {
			if (element.matches(selector) || element.closest(selector)) {
				return true;
			}
		} catch {
			// Ignore invalid user-provided selectors.
		}
	}
	return false;
}

function removeMatches(
	root: ParentNode,
	selector: string,
	bucket: keyof CleanPageRemovalReport,
	report: CleanPageRemovalReport,
	preserveSelectors: string[],
): void {
	for (const element of queryAll(root, selector)) {
		if (shouldPreserve(element, preserveSelectors)) continue;
		element.remove();
		report[bucket] += 1;
	}
}

function removeEmptyContainers(doc: Document, report: CleanPageRemovalReport): void {
	const selectors = 'div, section, aside, nav, header, footer, ins, span';
	const keepIfContains = 'article, main, p, h1, h2, h3, h4, h5, h6, pre, code, blockquote, table, img, picture, video, audio, canvas, svg, math, iframe';

	for (const element of queryAll(doc, selectors).reverse()) {
		const tagName = element.tagName.toLowerCase();
		if (tagName === 'main' || tagName === 'article' || element.id === 'content') continue;

		const text = element.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
		if (text.length > 0) continue;
		if (element.querySelector(keepIfContains)) continue;

		element.remove();
		report.empty += 1;
	}
}

function serializeExtractedHtml(doc: Document, fallback: string): string {
	const bodyHtml = doc.body?.innerHTML ?? '';
	if (bodyHtml.trim()) return bodyHtml;

	const root = doc.documentElement;
	if (!root) return fallback;

	const tagName = root.tagName.toLowerCase();
	if (tagName === 'html' || tagName === 'body') {
		return root.innerHTML;
	}

	root.querySelectorAll(':scope > head:empty, :scope > body:empty').forEach(element => element.remove());
	return root.outerHTML;
}

export function cleanDocumentInPlace(doc: Document, options: CleanPageOptions = {}): CleanPageRemovalReport {
	const report = cloneReport();
	const preserveSelectors = options.preserveSelectors ?? [
		'article aside',
		'main aside',
		'pre',
		'code',
		'figure',
		'figcaption',
		'[role="note" i]',
	];

	removeMatches(doc, GOOGLE_AD_SELECTORS, 'googleAds', report, preserveSelectors);

	if (options.removeIframes !== false) {
		removeMatches(doc, AD_IFRAME_SELECTOR, 'adIframes', report, preserveSelectors);
	}

	removeMatches(doc, GENERIC_AD_SELECTORS, 'genericAds', report, preserveSelectors);

	if (options.removeOverlays !== false) {
		removeMatches(doc, OVERLAY_SELECTORS, 'overlays', report, preserveSelectors);
	}

	if (options.removeSponsored !== false) {
		removeMatches(doc, SPONSORED_SELECTORS, 'sponsored', report, preserveSelectors);
	}

	if (options.removeEmpty !== false) {
		removeEmptyContainers(doc, report);
	}

	return report;
}

export function cleanExtractedHtmlWithReport(
	html: string,
	options: CleanPageOptions & { documentParser?: DocumentParserLike } = {},
): CleanPageResult {
	if (!html) {
		return { html, removed: cloneReport() };
	}

	const parser = options.documentParser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : undefined);
	if (!parser) {
		return { html, removed: cloneReport() };
	}

	const doc = parser.parseFromString(html, 'text/html');
	const removed = cleanDocumentInPlace(doc, options);
	const cleaned = serializeExtractedHtml(doc, html);

	return { html: cleaned, removed };
}

export function cleanExtractedHtml(
	html: string,
	options: CleanPageOptions & { documentParser?: DocumentParserLike } = {},
): string {
	return cleanExtractedHtmlWithReport(html, options).html;
}

export function cleanFullHtml(
	html: string,
	options: CleanPageOptions & { documentParser?: DocumentParserLike } = {},
): string {
	if (!html) return html;

	const parser = options.documentParser ?? (typeof DOMParser !== 'undefined' ? new DOMParser() : undefined);
	if (!parser) return html;

	const doc = parser.parseFromString(html, 'text/html');
	cleanDocumentInPlace(doc, options);
	return doc.documentElement?.outerHTML ?? html;
}
