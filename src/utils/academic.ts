import DefuddleFullDefault, * as DefuddleFullNs from 'defuddle/full';
import { AcademicOptions } from '../types/types';

const createMarkdownContent: (html: string, url?: string) => string =
	(DefuddleFullNs as any).createMarkdownContent ??
	(DefuddleFullDefault as any)?.createMarkdownContent ??
	(DefuddleFullNs as any).default?.createMarkdownContent;

export interface DocumentParserLike {
	parseFromString(html: string, mimeType: string): any;
}

export interface ResolvedAcademicOptions {
	academicMode: boolean;
	preserveCitationLinks: boolean;
	preserveReferenceAnchors: boolean;
	preserveMath: boolean;
	preserveComplexTables: boolean;
	preserveFigures: boolean | 'html';
	anyEnabled: boolean;
}

export interface AcademicTokenData {
	origDataLang?: string | null;
	id?: string | null;
	extraIds?: string[];
	backupIds?: string[];
	role?: string | null;
	bibliographyHtml?: string;
	figureHtml?: string;
	tableHtml?: string;
	tableFootnotesHtml?: string;
	eqId?: string | null;
}

export interface AcademicPreprocessState {
	options: ResolvedAcademicOptions;
	url: string;
	tokens: Map<string, AcademicTokenData>;
	unplacedBibliographies: string[];
	rawContentHtml: string;
	referencedIds: Set<string>;
	bibIds: Set<string>;
}

const TOKEN_PREFIX = '__acad:';
const CITE_SHIELD_PREFIX = 'https://academic.local/cite/';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const ACADEMIC_HOSTS = [
	'onlinelibrary.wiley.com',
	'link.springer.com',
	'nature.com',
	'science.org',
	'sciencedirect.com',
	'ieeexplore.ieee.org',
	'dl.acm.org',
	'academic.oup.com',
	'tandfonline.com',
	'pmc.ncbi.nlm.nih.gov',
	'ncbi.nlm.nih.gov',
	'arxiv.org',
	'journals.plos.org',
	'mdpi.com',
	'frontiersin.org',
	'sagepub.com',
	'pnas.org',
	'cell.com',
	'thelancet.com',
	'bmj.com',
	'nejm.org',
	'jstor.org',
	'journals.aps.org',
	'iopscience.iop.org',
	'pubs.acs.org',
	'pubs.rsc.org',
	'cambridge.org',
	'biorxiv.org',
	'medrxiv.org',
	'ssrn.com',
	'jmlr.org',
	'proceedings.mlr.press',
	'aclanthology.org',
	'openreview.net',
];

const SCHOLARLY_SCHEMA_TYPES = new Set([
	'scholarlyarticle',
	'medicalscholarlyarticle',
	'thesis',
	'techarticle',
	'report',
]);

const COMPLEX_MATHML_NODE_NAMES = new Set([
	'menclose', 'mfrac', 'mmultiscripts', 'mover', 'mroot', 'msqrt', 'msub',
	'msubsup', 'msup', 'mtable', 'mtd', 'mtr', 'munder', 'munderover',
]);

const MATHML_NODE_NAMES = new Set([
	'annotation', 'maction', 'math', 'menclose', 'merror', 'mfenced', 'mfrac', 'mi',
	'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mprescripts',
	'mroot', 'mrow', 'ms', 'mspace', 'msqrt', 'mstyle', 'msub', 'msubsup',
	'msup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'none',
	'semantics',
]);

const BIBLIOGRAPHY_HEADING_RE = /^(?:\d+(?:\.\d+)*\.?\s+)?(?:references|bibliography|works\s+cited|literature\s+cited|cited\s+literature|notes\s+and\s+references)$/i;
const FOOTNOTE_HEADING_RE = /^(?:foot\s*notes?|end\s*notes?|notes?)$/i;
const FOOTNOTE_MARKER_RE = /^\[?\(?(\d{1,4})\)?\]?$/;
const CROSSREF_PREFIX_RE = /^(?:fig|figure|tab|table|tbl|eq|eqn|equation|sec|section|s\d|app|appendix|scheme|alg|algorithm|box|video|sup|cr|bib|ref|cit)/i;
const CROSSREF_TEXT_RE = /^(?:fig(?:ure)?|tab(?:le)?|eq(?:uation)?|sec(?:tion)?|scheme|alg(?:orithm)?|box|appendix)\b/i;

const BIB_CONTAINER_SELECTORS = [
	'section[role="doc-bibliography"]',
	'div[role="doc-bibliography"]',
	'.article-section__references',
	'#references-section',
	'#references',
	'#bibliography',
	'section.references',
	'div.references',
	'ol.references',
	'ol[class*="article-references"]',
	'ol.c-article-references',
	'ul.ltx_biblist',
	'section.ltx_bibliography',
	'ul.rlist',
	'div.ref-list',
	'section.ref-list',
	'div#ref-list',
	'.references-section',
	'.bibliography',
].join(', ');

const TABLE_ALLOWED_ATTRS = new Set([
	'id', 'colspan', 'rowspan', 'scope', 'headers', 'align', 'valign',
	'width', 'height', 'bgcolor', 'href', 'src', 'alt', 'title',
]);

const FIGURE_ALLOWED_ATTRS = new Set([
	'id', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'href', 'loading',
]);

function getTagName(node: any): string {
	return (node?.tagName || node?.nodeName || '').toLowerCase();
}

function getClassName(el: any): string {
	if (!el) return '';
	if (typeof el.className === 'string') return el.className;
	return el.getAttribute?.('class') || '';
}

function isElementNode(node: any): boolean {
	return !!node && node.nodeType === ELEMENT_NODE;
}

function isTextNode(node: any): boolean {
	return !!node && node.nodeType === TEXT_NODE;
}

function escapeSelectorAttr(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function wrapHtmlFragment(html: string): string {
	if (/^\s*(?:<!doctype|<html\b)/i.test(html)) {
		return html;
	}
	return `<!DOCTYPE html><html><head></head><body>${html}</body></html>`;
}

let activeDocumentParser: DocumentParserLike | undefined;

export function withDocumentParser<T>(parser: DocumentParserLike | undefined, fn: () => T): T {
	const prev = activeDocumentParser;
	if (parser) activeDocumentParser = parser;
	try {
		return fn();
	} finally {
		activeDocumentParser = prev;
	}
}

export async function withDocumentParserAsync<T>(
	parser: DocumentParserLike | undefined,
	fn: () => Promise<T>
): Promise<T> {
	const prev = activeDocumentParser;
	if (parser) activeDocumentParser = parser;
	try {
		return await fn();
	} finally {
		activeDocumentParser = prev;
	}
}

export function parseHtmlDocument(html: string, documentParser?: DocumentParserLike): any {
	const wrapped = wrapHtmlFragment(html);
	const effectiveParser = documentParser ?? activeDocumentParser;
	if (effectiveParser) {
		return effectiveParser.parseFromString(wrapped, 'text/html');
	}
	if (typeof DOMParser !== 'undefined') {
		return new DOMParser().parseFromString(wrapped, 'text/html');
	}
	throw new Error('No DOMParser or documentParser available');
}

function importElement(targetDoc: any, sourceEl: any): any {
	if (typeof targetDoc.importNode === 'function') {
		try {
			return targetDoc.importNode(sourceEl, true);
		} catch {
			// Fallback to cloneNode if importNode fails
		}
	}
	return sourceEl.cloneNode(true);
}

function parseFragmentNodes(targetDoc: any, html: string, documentParser?: DocumentParserLike): any[] {
	const parsed = parseHtmlDocument(html, documentParser);
	const body = parsed?.body || parsed?.documentElement;
	if (!body) return [];
	return Array.from(body.childNodes || []).map((child: any) => importElement(targetDoc, child));
}

function replaceWithNodes(target: any, nodes: any[]): void {
	const parent = target?.parentNode;
	if (!parent) return;
	for (const node of nodes) {
		parent.insertBefore(node, target);
	}
	parent.removeChild(target);
}

function buildIdElementMap(root: any): Map<string, any> {
	const map = new Map<string, any>();
	if (!root?.querySelectorAll) return map;
	for (const el of Array.from(root.querySelectorAll('[id], a[name]'))) {
		const id = (el as any).getAttribute?.('id') || (el as any).getAttribute?.('name') || '';
		if (id && !map.has(id)) {
			map.set(id, el);
		}
	}
	return map;
}

function getBaseUrl(doc: any, pageUrl: string): string {
	let baseUrl = pageUrl || doc?.URL || 'about:blank';
	try {
		const baseEl = doc?.querySelector?.('base[href]');
		const baseHref = baseEl?.getAttribute?.('href');
		if (baseHref && baseUrl !== 'about:blank') {
			baseUrl = new URL(baseHref, baseUrl).href;
		}
	} catch {
		// Ignore invalid base href
	}
	return baseUrl;
}

function normalizeHrefToFragmentIfSamePage(
	rawHref: string,
	pageUrl: string,
	baseUrl: string,
	knownTargetIds?: Set<string>
): string {
	const trimmed = rawHref.trim();
	if (!trimmed) return rawHref;
	if (trimmed.startsWith('#')) return trimmed;
	if (/^(?:javascript|mailto|tel|data|blob):/i.test(trimmed)) return trimmed;

	const hashIdx = trimmed.indexOf('#');
	if (hashIdx === -1 || !pageUrl || pageUrl === 'about:blank') {
		try {
			return baseUrl && baseUrl !== 'about:blank' ? new URL(trimmed, baseUrl).href : trimmed;
		} catch {
			return trimmed;
		}
	}

	try {
		const resolved = new URL(trimmed, baseUrl);
		const page = new URL(pageUrl);
		const fragment = resolved.hash.slice(1);
		if (!fragment) return resolved.href;

		if (
			resolved.origin === page.origin &&
			resolved.pathname === page.pathname &&
			resolved.search === page.search
		) {
			return `#${fragment}`;
		}

		// Publishers like Wiley sometimes link from /doi/full/10.xxx to /doi/10.xxx#bib-1
		if (
			resolved.origin === page.origin &&
			knownTargetIds &&
			knownTargetIds.has(fragment)
		) {
			return `#${fragment}`;
		}

		return resolved.href;
	} catch {
		return trimmed;
	}
}

function isDangerousUri(url: string, allowInlineImage = true): boolean {
	const normalized = url.replace(/[\s\u0000-\u001F]+/g, '').toLowerCase();
	if (normalized.startsWith('javascript:') || normalized.startsWith('blob:')) return true;
	if (normalized.startsWith('data:')) {
		return !(allowInlineImage && normalized.startsWith('data:image/'));
	}
	return false;
}

function resolveUrlsAndSanitize(root: any, pageUrl: string, baseUrl: string, knownTargetIds?: Set<string>): void {
	if (!root?.querySelectorAll) return;

	for (const el of Array.from(root.querySelectorAll('script:not([type^="math/"]), style, noscript, frame, frameset, object, embed, applet, base'))) {
		(el as any).remove?.();
	}

	const allEls = [root, ...Array.from(root.querySelectorAll('*'))];
	for (const el of allEls) {
		const attrs = Array.from((el as any).attributes || []) as any[];
		for (const attr of attrs) {
			const name = attr.name.toLowerCase();
			if (name.startsWith('on') || name === 'srcdoc') {
				(el as any).removeAttribute(attr.name);
				continue;
			}
			if (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name)) {
				const allowImg = !(name === 'src' && getTagName(el) === 'iframe');
				if (isDangerousUri(attr.value, allowImg)) {
					(el as any).removeAttribute(attr.name);
				}
			}
		}
	}

	if (!baseUrl || baseUrl === 'about:blank') return;

	for (const el of Array.from(root.querySelectorAll('[href]'))) {
		const href = (el as any).getAttribute('href');
		if (href) {
			(el as any).setAttribute('href', normalizeHrefToFragmentIfSamePage(href, pageUrl, baseUrl, knownTargetIds));
		}
	}

	const resolveMediaUrl = (raw: string): string => {
		const t = raw.trim();
		if (!t || t.startsWith('#') || t.startsWith('data:')) return t;
		try {
			return new URL(t, baseUrl).href;
		} catch {
			return t;
		}
	};

	for (const el of Array.from(root.querySelectorAll('[src]'))) {
		const src = (el as any).getAttribute('src');
		if (src) (el as any).setAttribute('src', resolveMediaUrl(src));
	}

	for (const el of Array.from(root.querySelectorAll('[poster]'))) {
		const poster = (el as any).getAttribute('poster');
		if (poster) (el as any).setAttribute('poster', resolveMediaUrl(poster));
	}

	for (const el of Array.from(root.querySelectorAll('[srcset]'))) {
		const srcset = (el as any).getAttribute('srcset');
		if (!srcset) continue;
		const resolvedSrcset = resolveSrcsetUrls(srcset, resolveMediaUrl);
		(el as any).setAttribute('srcset', resolvedSrcset);
	}
}

function resolveSrcsetUrls(srcset: string, resolver: (url: string) => string): string {
	const entryPattern = /(.+?)\s+(\d+(?:\.\d+)?[wx])/g;
	const entries: string[] = [];
	let match: RegExpExecArray | null;
	let lastIdx = 0;
	while ((match = entryPattern.exec(srcset)) !== null) {
		let entryUrl = match[1].trim();
		if (lastIdx > 0) {
			entryUrl = entryUrl.replace(/^,\s*/, '');
		}
		lastIdx = entryPattern.lastIndex;
		entries.push(`${resolver(entryUrl)} ${match[2]}`);
	}
	if (entries.length > 0) {
		return entries.join(', ');
	}
	return srcset
		.split(',')
		.map(entry => {
			const parts = entry.trim().split(/\s+/);
			if (parts[0]) parts[0] = resolver(parts[0]);
			return parts.join(' ');
		})
		.join(', ');
}

function hasScholarlySchema(schemaOrgData: any, depth = 0): boolean {
	if (!schemaOrgData || depth > 8) return false;
	if (Array.isArray(schemaOrgData)) {
		return schemaOrgData.some(item => hasScholarlySchema(item, depth + 1));
	}
	if (typeof schemaOrgData === 'object') {
		const rawType = schemaOrgData['@type'];
		const types = Array.isArray(rawType) ? rawType : (rawType ? [rawType] : []);
		if (types.some(t => typeof t === 'string' && SCHOLARLY_SCHEMA_TYPES.has(t.toLowerCase()))) {
			return true;
		}
		if (Array.isArray(schemaOrgData['@graph'])) {
			return hasScholarlySchema(schemaOrgData['@graph'], depth + 1);
		}
	}
	return false;
}

export function detectAcademicArticle(
	doc?: any,
	url?: string,
	schemaOrgData?: any,
	metaTags?: { name?: string | null; property?: string | null; content: string | null }[]
): boolean {
	// 1. Check meta tags
	const checkMeta = (nameOrProp: string, content: string): boolean => {
		const key = nameOrProp.toLowerCase();
		if (key.startsWith('citation_') || key.startsWith('prism.') || key.startsWith('eprints.')) {
			return true;
		}
		if (key === 'dc.identifier' && /(?:10\.\d{4,9}\/|arxiv:|pmid:)/i.test(content)) {
			return true;
		}
		return false;
	};

	if (metaTags && metaTags.length > 0) {
		for (const meta of metaTags) {
			const key = meta.name || meta.property || '';
			if (key && meta.content && checkMeta(key, meta.content)) {
				return true;
			}
		}
	}

	if (doc?.querySelectorAll) {
		for (const meta of Array.from(doc.querySelectorAll('meta[content]'))) {
			const key = (meta as any).getAttribute('name') || (meta as any).getAttribute('property') || '';
			const content = (meta as any).getAttribute('content') || '';
			if (key && content && checkMeta(key, content)) {
				return true;
			}
		}
	}

	// 2. Check schema.org data
	if (schemaOrgData && hasScholarlySchema(schemaOrgData)) {
		return true;
	}
	if (doc?.querySelectorAll) {
		for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
			const text = (script as any).textContent || '';
			if (/ScholarlyArticle|MedicalScholarlyArticle/i.test(text)) {
				return true;
			}
		}
	}

	// 3. Check URL for academic hosts or DOI patterns
	if (url) {
		try {
			const parsed = new URL(url);
			const host = parsed.hostname.toLowerCase();
			if (ACADEMIC_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
				return true;
			}
			if (/\/doi\/(?:abs\/|full\/|epdf\/|pdf\/)?10\.\d{4,9}\//i.test(parsed.pathname) || /\/10\.\d{4,9}\//.test(parsed.pathname)) {
				return true;
			}
		} catch {
			// Ignore malformed URLs
		}
	}

	// 4. Check unambiguous scholarly DOM markers
	if (doc?.querySelector) {
		if (doc.querySelector(
			'[role="doc-bibliography"], [role="doc-biblioref"], [role="doc-biblioentry"], ' +
			'cite.ltx_cite, ul.ltx_biblist, table.ltx_equation, table.ltx_eqn_table, ' +
			'.article-section__references, ol.c-article-references, a.bibLink, ' +
			'a[href^="#CR"], a[href*="-bib-"], button[data-rid]'
		)) {
			return true;
		}
		// Combination: math + bibliography heading/container
		const hasMath = !!doc.querySelector('math, .katex, mjx-container, .MathJax, .MathJax_Display, .MathJax_SVG');
		if (hasMath && doc.querySelector(BIB_CONTAINER_SELECTORS)) {
			return true;
		}
	}

	return false;
}

export function mergeAcademicOptions(primary?: AcademicOptions, fallback?: AcademicOptions): AcademicOptions {
	if (!primary && !fallback) return {};
	return {
		academicMode: primary?.academicMode !== undefined ? primary.academicMode : fallback?.academicMode,
		preserveCitationLinks: primary?.preserveCitationLinks !== undefined ? primary.preserveCitationLinks : fallback?.preserveCitationLinks,
		preserveReferenceAnchors: primary?.preserveReferenceAnchors !== undefined ? primary.preserveReferenceAnchors : fallback?.preserveReferenceAnchors,
		preserveMath: primary?.preserveMath !== undefined ? primary.preserveMath : fallback?.preserveMath,
		preserveComplexTables: primary?.preserveComplexTables !== undefined ? primary.preserveComplexTables : fallback?.preserveComplexTables,
		preserveFigures: primary?.preserveFigures !== undefined ? primary.preserveFigures : fallback?.preserveFigures,
	};
}

export function resolveAcademicOptions(
	options?: AcademicOptions,
	context?: {
		doc?: any;
		url?: string;
		schemaOrgData?: any;
		metaTags?: { name?: string | null; property?: string | null; content: string | null }[];
	}
): ResolvedAcademicOptions {
	let baseAcademic = false;
	if (options?.academicMode === true) {
		baseAcademic = true;
	} else if (options?.academicMode === false) {
		baseAcademic = false;
	} else if (context) {
		baseAcademic = detectAcademicArticle(context.doc, context.url, context.schemaOrgData, context.metaTags);
	}

	const preserveCitationLinks = options?.preserveCitationLinks ?? baseAcademic;
	const preserveReferenceAnchors = options?.preserveReferenceAnchors ?? baseAcademic;
	const preserveMath = options?.preserveMath ?? baseAcademic;
	const preserveComplexTables = options?.preserveComplexTables ?? baseAcademic;
	const preserveFigures = options?.preserveFigures ?? baseAcademic;

	const anyEnabled = Boolean(
		preserveCitationLinks ||
		preserveReferenceAnchors ||
		preserveMath ||
		preserveComplexTables ||
		preserveFigures
	);

	return {
		academicMode: baseAcademic || anyEnabled,
		preserveCitationLinks,
		preserveReferenceAnchors,
		preserveMath,
		preserveComplexTables,
		preserveFigures,
		anyEnabled,
	};
}

function unhideElementAndAncestors(el: any): void {
	let current = el;
	while (current && getTagName(current) !== 'body' && getTagName(current) !== 'html') {
		if (current.removeAttribute) {
			current.removeAttribute('hidden');
			if (current.getAttribute('aria-hidden') === 'true') {
				current.removeAttribute('aria-hidden');
			}
		}
		if (getTagName(current) === 'details') {
			current.setAttribute('open', '');
		}
		const style = current.getAttribute?.('style');
		if (style) {
			const cleaned = style
				.replace(/display\s*:\s*none\s*;?/gi, '')
				.replace(/visibility\s*:\s*hidden\s*;?/gi, '')
				.replace(/opacity\s*:\s*0\s*;?/gi, '')
				.trim();
			if (cleaned) current.setAttribute('style', cleaned);
			else current.removeAttribute('style');
		}
		const cls = getClassName(current);
		if (cls) {
			const filtered = cls
				.split(/\s+/)
				.filter(c => c && !/^(?:hidden|invisible|u-hide|collapsed|is-hidden)$/i.test(c));
			if (filtered.length > 0) current.setAttribute('class', filtered.join(' '));
			else current.removeAttribute('class');
		}
		current = current.parentElement;
	}
}

function findBibliographyContainers(doc: any): any[] {
	const root = doc?.body || doc?.documentElement;
	if (!root?.querySelectorAll) return [];

	const rawCandidates: any[] = [];
	const skipTags = new Set(['html', 'body', 'main', 'article', 'aside', 'nav', 'header']);

	for (const el of Array.from(root.querySelectorAll(BIB_CONTAINER_SELECTORS))) {
		const tag = getTagName(el);
		if (skipTags.has(tag)) continue;
		const role = ((el as any).getAttribute?.('role') || '').toLowerCase();
		if (role === 'main' || role === 'article') continue;
		// Do not match footnote sections mistakenly tagged with .references if they are doc-footnotes
		if (role === 'doc-footnotes' || role === 'doc-endnotes') continue;
		rawCandidates.push(el);
	}

	// Heading-based detection for academic reference sections without standard classes
	for (const container of Array.from(root.querySelectorAll('section, div'))) {
		const role = ((container as any).getAttribute?.('role') || '').toLowerCase();
		if (role === 'main' || role === 'article' || role === 'doc-footnotes' || role === 'doc-endnotes') continue;
		if ((container as any).querySelector('article, main')) continue;

		const headings = Array.from((container as any).querySelectorAll('h1, h2, h3, h4, h5, h6'));
		if (headings.length === 0) continue;
		const firstHeading = headings[0] as any;
		const headingText = (firstHeading.textContent || '').trim();
		if (!BIBLIOGRAPHY_HEADING_RE.test(headingText)) continue;
		if (FOOTNOTE_HEADING_RE.test(headingText)) continue;

		// Check that this container isn't a huge multi-section article wrapper
		const subSections = (container as any).querySelectorAll('section');
		if (subSections.length > 1 && !(container as any).className?.toLowerCase?.().includes('refer')) {
			continue;
		}
		const entries = (container as any).querySelectorAll('li, p[id], div[id], div.citation, div.ref-item, dd');
		if (entries.length >= 1) {
			rawCandidates.push(container);
		}
	}

	// Keep outermost containers (excluding duplicates/ancestors of other candidates)
	const unique = Array.from(new Set(rawCandidates));
	return unique.filter(el => !unique.some(other => other !== el && other.contains(el)));
}

function findMainArticleContainer(doc: any): any {
	const selectors = [
		'article',
		'[role="article"]',
		'.article__body',
		'.article-body',
		'.article-content',
		'#article-content',
		'.entry-content',
		'.markdown-body',
		'main',
		'[role="main"]',
	];

	for (const selector of selectors) {
		const matches = Array.from(doc?.querySelectorAll?.(selector) || []);
		if (matches.length === 1) {
			return matches[0];
		}
		if (matches.length > 1) {
			let best = matches[0];
			let bestLen = (best as any).textContent?.length || 0;
			for (const m of matches.slice(1)) {
				const len = (m as any).textContent?.length || 0;
				if (len > bestLen) {
					best = m;
					bestLen = len;
				}
			}
			if (bestLen > 100) return best;
		}
	}

	return doc?.body || doc?.documentElement;
}

function hasMathMLChildren(element: any): boolean {
	return Array.from(element?.children || []).some((child: any) => {
		const ns = child.namespaceURI;
		return ns === 'http://www.w3.org/1998/Math/MathML' || MATHML_NODE_NAMES.has(getTagName(child));
	});
}

function hasComplexMathMLChildren(element: any): boolean {
	const visit = (node: any): boolean => {
		if (COMPLEX_MATHML_NODE_NAMES.has(getTagName(node))) return true;
		return Array.from(node?.children || []).some((child: any) => visit(child));
	};
	return visit(element);
}

function isLikelyLatexSource(value: string): boolean {
	return /\\[a-zA-Z]+|[_^{}]|[$&]|\\\\|\\begin\{/.test(value);
}

function isTrustworthyLatexAttribute(value: string, hasComplexMathML: boolean): boolean {
	if (isLikelyLatexSource(value)) return true;
	const trimmed = value.trim();
	if (!trimmed) return false;
	if (hasComplexMathML) return false;
	return !/[a-zA-Z]{3,}-[a-zA-Z]{2,}/.test(trimmed);
}

function convertMathMLToLatexViaDefuddle(mathEl: any, documentParser?: DocumentParserLike): string {
	try {
		const clone = mathEl.cloneNode(true);
		// Strip annotations and attributes that could short-circuit Defuddle's MathMLToLaTeX
		for (const ann of Array.from(clone.querySelectorAll?.('annotation, annotation-xml') || [])) {
			(ann as any).remove?.();
		}
		clone.removeAttribute?.('data-latex');
		clone.removeAttribute?.('data-tex');
		clone.removeAttribute?.('alttext');
		clone.removeAttribute?.('display');
		if (!clone.getAttribute?.('xmlns')) {
			clone.setAttribute?.('xmlns', 'http://www.w3.org/1998/Math/MathML');
		}

		// Handle <mlabeledtr> so MathMLToLaTeX doesn't wrap label+equation in a matrix
		for (const table of Array.from(clone.querySelectorAll?.('mtable') || [])) {
			const rows = Array.from((table as any).children || []).filter((c: any) => {
				const tag = getTagName(c);
				return tag === 'mtr' || tag === 'mlabeledtr';
			});
			if (rows.length === 1 && getTagName(rows[0]) === 'mlabeledtr') {
				const row = rows[0] as any;
				const cells = Array.from(row.children || []).filter((c: any) => getTagName(c) === 'mtd');
				if (cells.length >= 2) {
					const labelCell = cells[0] as any;
					const labelText = (labelCell.textContent || '').trim();
					const mrow = mathEl.ownerDocument.createElement('mrow');
					for (const cell of cells.slice(1) as any[]) {
						while (cell.firstChild) mrow.appendChild(cell.firstChild);
					}
					(table as any).replaceWith(mrow);
					const md = createMarkdownContent(clone.outerHTML, 'about:blank');
					const clean = stripMathDelimiters(md);
					if (clean && labelText && !clean.includes('\\tag')) {
						const cleanLabel = labelText.replace(/^\((.*)\)$/, '$1').trim();
						return `${clean} \\tag{${cleanLabel}}`;
					}
					return clean;
				}
			}
		}

		// In Node/CLI with linkedom, ensure DOMParser exists for Defuddle's createMarkdownContent
		if (typeof DOMParser === 'undefined' && documentParser) {
			(globalThis as any).DOMParser = class {
				parseFromString(h: string, mime: string) {
					return documentParser.parseFromString(h, mime);
				}
			};
		}

		const md = createMarkdownContent(clone.outerHTML, 'about:blank');
		return stripMathDelimiters(md);
	} catch {
		return '';
	}
}

function stripMathDelimiters(md: string): string {
	const trimmed = md.trim();
	if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
		return trimmed.slice(2, -2).trim();
	}
	if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
		return trimmed.slice(1, -1).trim();
	}
	return '';
}

function extractTexAnnotation(mathEl: any): string {
	const annotations = Array.from(mathEl.querySelectorAll?.('annotation') || []) as any[];
	for (const ann of annotations) {
		const enc = (ann.getAttribute?.('encoding') || '').toLowerCase();
		const text = (ann.textContent || '').trim();
		if (!text) continue;
		if (enc.includes('tex') || enc.includes('latex')) {
			return text;
		}
	}
	for (const ann of annotations) {
		const enc = (ann.getAttribute?.('encoding') || '').toLowerCase();
		const text = (ann.textContent || '').trim();
		if (!enc && text && isLikelyLatexSource(text)) {
			return text;
		}
	}
	return '';
}

export function extractLatexFromMathElement(mathEl: any, documentParser?: DocumentParserLike): string {
	// 1. Any TeX/LaTeX <annotation>
	const annLatex = extractTexAnnotation(mathEl);
	if (annLatex) return annLatex;

	// 2. Trustworthy attributes on <math>
	const hasMathML = hasMathMLChildren(mathEl);
	const hasComplexMathML = hasComplexMathMLChildren(mathEl);
	for (const attr of ['data-latex', 'data-tex', 'data-math', 'alttext']) {
		const val = mathEl.getAttribute?.(attr);
		if (val && val.trim() && (!hasMathML || isTrustworthyLatexAttribute(val, hasComplexMathML))) {
			return val.trim();
		}
	}

	// 3. Sibling MathJax/KaTeX script
	const parent = mathEl.parentElement;
	if (parent) {
		const siblingScript = parent.querySelector?.('script[type^="math/tex"], script[type="math/katex"]');
		if (siblingScript?.textContent?.trim()) {
			return siblingScript.textContent.trim();
		}
	}

	// 4. Full MathML -> LaTeX conversion BEFORE falling back to textContent
	if (getTagName(mathEl) === 'math' && hasMathML) {
		const converted = convertMathMLToLatexViaDefuddle(mathEl, documentParser);
		if (converted) return converted;
	}

	// 5. Last resort: any non-empty attribute or textContent only if non-MathML
	for (const attr of ['data-latex', 'data-tex', 'alttext']) {
		const val = mathEl.getAttribute?.(attr);
		if (val && val.trim()) return val.trim();
	}

	if (!hasMathML && mathEl.textContent?.trim()) {
		return mathEl.textContent.trim();
	}

	return '';
}

function extractEqLabelText(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';
	const parenMatch = trimmed.match(/^\(([A-Za-z]?\d+(?:[.\-]\d+)*[a-z]?)\)$/);
	if (parenMatch) return parenMatch[1];
	const bracketMatch = trimmed.match(/^\[([A-Za-z]?\d+(?:[.\-]\d+)*[a-z]?)\]$/);
	if (bracketMatch) return bracketMatch[1];
	if (/^[A-Za-z]?\d+(?:[.\-]\d+)*[a-z]?$/.test(trimmed)) return trimmed;
	return trimmed.replace(/^\((.*)\)$/, '$1').trim();
}

function preprocessEquationContainersAndMath(
	doc: any,
	options: ResolvedAcademicOptions,
	documentParser?: DocumentParserLike
): void {
	const root = doc?.body || doc?.documentElement;
	if (!root) return;

	// 1. Handle numbered equation containers (ltx_equation, ltx_eqn_table, disp-formula, .equation)
	const eqContainers = Array.from(
		root.querySelectorAll(
			'table.ltx_equation, table.ltx_eqn_table, table.ltx_equationgroup, table.numblk, ' +
			'div.disp-formula, div.equation, div.formula, span.disp-formula, [data-equation-id]'
		)
	) as any[];

	for (const container of eqContainers) {
		if (!container.parentNode || container.closest?.('pre, code')) continue;
		const mathNodes = Array.from(
			container.querySelectorAll('math, .katex, mjx-container, .MathJax, .MathJax_Display, .MathJax_SVG, script[type^="math/"]')
		) as any[];
		if (mathNodes.length === 0) continue;

		// Skip child math wrappers if an inner <math> is inside .katex / mjx-container / .MathJax
		const topMathNodes = mathNodes.filter(m => !mathNodes.some(other => other !== m && other.contains(m)));

		let eqTag = '';
		const labelEl = container.querySelector('.ltx_tag_equation, .ltx_eqn_eqno, .eqn-number, .equation-number, .formula-label, .disp-formula-label, .eqno, .eqnno, .eq-label, .equation-label');
		if (labelEl?.textContent?.trim()) {
			eqTag = extractEqLabelText(labelEl.textContent);
		} else {
			const candidateSelector = getTagName(container) === 'table' ? 'td, th' : 'span, div';
			for (const cell of Array.from(container.querySelectorAll(candidateSelector)) as any[]) {
				if (cell.querySelector('math, .katex, mjx-container, .MathJax, script[type^="math/"]')) continue;
				const t = (cell.textContent || '').trim();
				if (/^\(?[A-Za-z]?\d+(?:[.\-]\d+)*[a-z]?\)?$/.test(t)) {
					eqTag = extractEqLabelText(t);
					break;
				}
			}
		}

		let eqId = container.getAttribute('id') || '';
		if (!eqId) {
			const idEl = container.querySelector('[id]');
			if (idEl) {
				const candidate = idEl.getAttribute('id') || '';
				if (/^(?:eq|eqn|fd|s\d|m\d|disp)/i.test(candidate)) {
					eqId = candidate;
				}
			}
		}

		const tagName = getTagName(container);
		const isTable = tagName === 'table';
		const isBlock = isTable ||
			tagName === 'div' ||
			!!container.querySelector('[display="block"], .katex-display, .MathJax_Display, script[type*="mode=display"]');

		const newBlock = doc.createElement('p');
		if (eqId) {
			newBlock.setAttribute('id', eqId);
		}

		let appendedCount = 0;
		topMathNodes.forEach((mNode, index) => {
			let latex = '';
			const innerMath = getTagName(mNode) === 'math' ? mNode : mNode.querySelector?.('math, .katex-mathml math, mjx-assistive-mml math');
			if (innerMath) {
				latex = extractLatexFromMathElement(innerMath, documentParser);
			} else if (getTagName(mNode) === 'script') {
				latex = (mNode.textContent || '').trim();
			} else {
				latex = mNode.getAttribute?.('data-latex') || mNode.getAttribute?.('data-tex') || '';
			}
			if (!latex) return;

			if (eqTag && index === topMathNodes.length - 1 && !/\\tag\*?\{/.test(latex)) {
				latex = `${latex} \\tag{${eqTag}}`;
			}

			const cleanMath = doc.createElement('math');
			cleanMath.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
			cleanMath.setAttribute('display', isBlock ? 'block' : 'inline');
			cleanMath.setAttribute('data-latex', latex);
			cleanMath.textContent = latex;
			newBlock.appendChild(cleanMath);
			appendedCount++;
		});

		if (appendedCount > 0) {
			// If label was outside math (not inside math), replacing container cleanly avoids duplicate "(1)" text
			if (isTable || container.classList?.contains('disp-formula') || container.classList?.contains('equation')) {
				container.replaceWith(newBlock);
			} else if (labelEl && eqTag) {
				labelEl.remove();
			}
		}
	}

	// 2. Normalize all remaining <math>, .katex, and standalone math <script> elements
	for (const katexEl of Array.from(root.querySelectorAll('.katex')) as any[]) {
		if (katexEl.closest?.('pre, code')) continue;
		const mathEl = katexEl.querySelector('.katex-mathml math');
		let latex = katexEl.getAttribute('data-latex') || '';
		if (!latex && mathEl) {
			latex = extractLatexFromMathElement(mathEl, documentParser);
		}
		if (latex) {
			katexEl.setAttribute('data-latex', latex);
			if (mathEl) {
				mathEl.setAttribute('data-latex', latex);
			}
		}
	}

	for (const mathEl of Array.from(root.querySelectorAll('math')) as any[]) {
		if (mathEl.closest?.('pre, code')) continue;
		const latex = extractLatexFromMathElement(mathEl, documentParser);
		if (latex) {
			mathEl.setAttribute('data-latex', latex);
			// Ensure <annotation> has standard encoding if present so Defuddle won't drop/corrupt it
			const annotations = Array.from(mathEl.querySelectorAll?.('annotation') || []) as any[];
			if (annotations.length > 0) {
				let hasStandard = false;
				for (const ann of annotations) {
					const enc = (ann.getAttribute('encoding') || '').toLowerCase();
					if (enc === 'application/x-tex') {
						hasStandard = true;
						break;
					}
				}
				if (!hasStandard) {
					const texAnn = annotations.find(a => /tex|latex/i.test(a.getAttribute('encoding') || ''));
					if (texAnn) {
						texAnn.setAttribute('encoding', 'application/x-tex');
					}
				}
			}
		}
	}

	// Convert standalone MathJax <script type="math/tex"> elements that have no rendered sibling
	for (const script of Array.from(root.querySelectorAll('script[type^="math/tex"]')) as any[]) {
		if (script.closest?.('pre, code')) continue;
		const parent = script.parentElement;
		if (!parent) continue;
		const hasRenderedSibling = !!parent.querySelector?.('.MathJax, .MathJax_Display, .MathJax_SVG, mjx-container, math');
		if (hasRenderedSibling) continue;
		const latex = (script.textContent || '').trim();
		if (!latex) continue;
		const isBlock = (script.getAttribute('type') || '').includes('mode=display');
		const cleanMath = doc.createElement('math');
		cleanMath.setAttribute('xmlns', 'http://www.w3.org/1998/Math/MathML');
		cleanMath.setAttribute('display', isBlock ? 'block' : 'inline');
		cleanMath.setAttribute('data-latex', latex);
		cleanMath.textContent = latex;
		const preview = script.previousElementSibling;
		if (preview && preview.classList?.contains('MathJax_Preview')) {
			preview.remove();
		}
		script.replaceWith(cleanMath);
	}
}

function promoteEmptyAnchors(root: any): Set<string> {
	const promotedIds = new Set<string>();
	if (!root?.querySelectorAll) return promotedIds;

	const anchors = Array.from(root.querySelectorAll('a[id], a[name], span[id], span[name]')) as any[];
	for (const anchor of anchors) {
		if (!anchor.parentNode) continue;
		const isEmpty = !(anchor.textContent || '').trim() && !anchor.querySelector('img, svg, math');
		if (!isEmpty) continue;
		const anchorId = anchor.getAttribute('id') || anchor.getAttribute('name') || '';
		if (!anchorId) continue;

		const parent = anchor.parentElement;
		if (!parent || getTagName(parent) === 'body') continue;

		const existingParentId = parent.getAttribute('id');
		if (!existingParentId) {
			parent.setAttribute('id', anchorId);
			promotedIds.add(anchorId);
			anchor.remove();
		} else {
			// Record extra alias IDs on parent via temporary attribute
			const prevExtra = parent.getAttribute('data-acad-extra-ids');
			const list = prevExtra ? prevExtra.split('\n') : [];
			if (!list.includes(anchorId) && existingParentId !== anchorId) {
				list.push(anchorId);
				parent.setAttribute('data-acad-extra-ids', list.join('\n'));
			}
			promotedIds.add(anchorId);
			anchor.remove();
		}
	}
	return promotedIds;
}

function collectBibliographyItemIds(container: any): Set<string> {
	const ids = new Set<string>();
	if (!container?.querySelectorAll) return ids;

	if (container.id) ids.add(container.id);
	const items = Array.from(
		container.querySelectorAll('li, [role="doc-biblioentry"], div[id], p[id], dd[id], a[id], a[name], span[id]')
	) as any[];
	for (const item of items) {
		const id = item.getAttribute?.('id') || item.getAttribute?.('name') || '';
		if (id) ids.add(id);
		const extra = item.getAttribute?.('data-acad-extra-ids');
		if (extra) {
			for (const eId of extra.split('\n')) {
				if (eId) ids.add(eId);
			}
		}
	}
	return ids;
}

function stripDestructiveCitationClasses(el: any): void {
	const cls = getClassName(el);
	if (!cls) return;
	const tokens = cls.split(/\s+/).filter(token => {
		if (!token) return false;
		const lower = token.toLowerCase();
		if (
			lower.includes('ref') ||
			lower.includes('anchor') ||
			lower.includes('citation') ||
			lower === 'ltx_cite' ||
			lower === 'ltx_role_refnum' ||
			lower === 'ltx_tag_bibitem' ||
			lower === 'biblink'
		) {
			return false;
		}
		return true;
	});
	if (tokens.length > 0) el.setAttribute('class', tokens.join(' '));
	else el.removeAttribute('class');
}

function isTrueFootnoteLink(
	link: any,
	fragment: string,
	bibIds: Set<string>,
	footnoteContainerIds: Set<string>,
	idMap: Map<string, any>
): boolean {
	if (!fragment) return false;
	if (bibIds.has(fragment)) return false;

	const linkText = (link.textContent || '').trim();
	if (CROSSREF_TEXT_RE.test(linkText)) return false;
	if (CROSSREF_PREFIX_RE.test(fragment)) return false;

	if (footnoteContainerIds.has(fragment)) return true;

	if (/^(?:fn[:_-]|ftnt|_ftn|footnote)/i.test(fragment)) return true;
	if (link.getAttribute?.('data-type') === 'noteref') return true;
	if (link.classList?.contains('footnote-anchor')) return true;
	if (link.closest?.('sup.footnote-reference, sup[id^="fnref:"], span.footnote-hovercard-target')) return true;

	const targetEl = idMap.get(fragment);
	if (targetEl?.closest?.('[role="doc-footnotes"], [role="doc-endnotes"], .footnotes, ol.footnotes, .footnote-definitions')) {
		return true;
	}

	return false;
}

function resolveBestFigureImages(figure: any, pageUrl: string, baseUrl: string): void {
	// Resolve <picture> elements inside figure into clean <img> with srcset + src
	for (const picture of Array.from(figure.querySelectorAll?.('picture') || []) as any[]) {
		const img = picture.querySelector('img') || figure.ownerDocument.createElement('img');
		const sources = Array.from(picture.querySelectorAll('source')) as any[];
		let bestSrcset = img.getAttribute('srcset') || '';
		if (!bestSrcset && sources.length > 0) {
			for (const source of sources) {
				const ss = source.getAttribute('srcset') || source.getAttribute('data-srcset') || '';
				if (ss) {
					bestSrcset = ss;
					break;
				}
			}
		}
		if (bestSrcset) {
			img.setAttribute('srcset', bestSrcset);
			if (!img.getAttribute('src') || img.getAttribute('src')?.startsWith('data:')) {
				const firstUrl = bestSrcset.trim().split(/\s+/)[0]?.replace(/^,/, '');
				if (firstUrl) img.setAttribute('src', firstUrl);
			}
		}
		if (!img.parentNode) {
			picture.appendChild(img);
		}
		for (const s of sources) s.remove();
	}

	// Resolve lazy-loaded image attributes and relative URLs
	for (const img of Array.from(figure.querySelectorAll?.('img') || []) as any[]) {
		const src = img.getAttribute('src') || '';
		const dataSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || '';
		const dataSrcset = img.getAttribute('data-srcset') || '';
		if (dataSrcset && !img.getAttribute('srcset')) {
			img.setAttribute('srcset', dataSrcset);
		}
		if (dataSrc && (!src || src.startsWith('data:'))) {
			img.setAttribute('src', dataSrc);
		}
		const curSrc = img.getAttribute('src') || '';
		const curSrcset = img.getAttribute('srcset') || '';
		if (curSrcset && (!curSrc || curSrc.startsWith('data:'))) {
			const best = getBestSrcFromSrcset(curSrcset);
			if (best) img.setAttribute('src', best);
		}
		img.removeAttribute('data-src');
		img.removeAttribute('data-srcset');
		img.removeAttribute('data-lazy-src');
		img.removeAttribute('data-original');
		img.removeAttribute('loading');
	}

	resolveUrlsAndSanitize(figure, pageUrl, baseUrl);
}

function getBestSrcFromSrcset(srcset: string): string {
	if (!srcset) return '';
	const tokens = srcset.trim().split(/\s+/);
	let bestUrl = '';
	let bestWidth = 0;
	let urlParts: string[] = [];

	for (const token of tokens) {
		const widthMatch = token.match(/^(\d+)w,?$/);
		if (widthMatch) {
			const width = parseInt(widthMatch[1], 10);
			if (urlParts.length > 0 && width > bestWidth) {
				const candidate = urlParts.join(' ').replace(/^,\s*/, '');
				if (candidate) {
					bestWidth = width;
					bestUrl = candidate;
				}
			}
			urlParts = [];
		} else if (/^\d+(?:\.\d+)?x,?$/.test(token)) {
			if (urlParts.length > 0 && !bestUrl) {
				bestUrl = urlParts.join(' ').replace(/^,\s*/, '');
			}
			urlParts = [];
		} else {
			urlParts.push(token);
		}
	}
	return bestUrl;
}

function getBestImageSrc(img: any): string {
	const srcset = img.getAttribute?.('srcset') || '';
	if (srcset) {
		const best = getBestSrcFromSrcset(srcset);
		if (best) return best;
	}
	return img.getAttribute?.('src') || '';
}

function cleanElementAttributesForAcademicHtml(el: any, allowedAttrs: Set<string>, keepDataLatex = false): void {
	for (const attr of Array.from(el.attributes || []) as any[]) {
		const lower = attr.name.toLowerCase();
		if (keepDataLatex && (lower === 'data-latex' || lower === 'display' || lower === 'xmlns')) continue;
		if (!allowedAttrs.has(lower)) {
			el.removeAttribute(attr.name);
		}
	}
	for (const child of Array.from(el.children || []) as any[]) {
		cleanElementAttributesForAcademicHtml(child, allowedAttrs, keepDataLatex || getTagName(child) === 'math');
	}
}

export function extractRawArticleHtml(doc: any, url: string): string {
	const baseUrl = getBaseUrl(doc, url);
	const mainArticle = findMainArticleContainer(doc);
	if (!mainArticle) return '';
	const rawClone = mainArticle.cloneNode(true);
	const rawTargetIds = new Set(Array.from(buildIdElementMap(rawClone).keys()));
	resolveUrlsAndSanitize(rawClone, url, baseUrl, rawTargetIds);
	return rawClone.outerHTML || '';
}

export function countHtmlWords(html: string): number {
	const text = (html || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#\d+;/g, ' ')
		.replace(/&\w+;/g, ' ')
		.trim();
	if (!text) return 0;
	return text.split(/\s+/).filter(Boolean).length;
}

export function prepareDocumentForAcademicClip(
	doc: any,
	url: string,
	options: ResolvedAcademicOptions,
	documentParser?: DocumentParserLike
): AcademicPreprocessState {
	const tokens = new Map<string, AcademicTokenData>();
	const unplacedBibliographies: string[] = [];
	let tokenSeq = 0;
	const nextTokenId = () => `t${tokenSeq++}`;

	const attachToken = (el: any, patch: Partial<AcademicTokenData>): string => {
		const mergeIdArrays = (a?: string[], b?: string[]): string[] | undefined => {
			if (!a?.length && !b?.length) return undefined;
			return Array.from(new Set([...(a || []), ...(b || [])]));
		};
		const existingLang = el.getAttribute?.('data-lang') || '';
		if (existingLang.startsWith(TOKEN_PREFIX)) {
			const id = existingLang.slice(TOKEN_PREFIX.length);
			const data = tokens.get(id)!;
			const mergedExtraIds = mergeIdArrays(data.extraIds, patch.extraIds);
			const mergedBackupIds = mergeIdArrays(data.backupIds, patch.backupIds);
			Object.assign(data, patch);
			if (mergedExtraIds) data.extraIds = mergedExtraIds;
			if (mergedBackupIds) data.backupIds = mergedBackupIds;
			return id;
		}
		const id = nextTokenId();
		tokens.set(id, {
			origDataLang: existingLang || null,
			...patch,
		});
		el.setAttribute('data-lang', `${TOKEN_PREFIX}${id}`);
		return id;
	};

	const baseUrl = getBaseUrl(doc, url);
	const root = doc?.body || doc?.documentElement;

	if (!root || !options.anyEnabled) {
		return {
			options,
			url,
			tokens,
			unplacedBibliographies,
			rawContentHtml: '',
			referencedIds: new Set(),
			bibIds: new Set(),
		};
	}

	// Step A: Unhide and adopt external bibliography & true footnote sections
	const bibContainers = (options.preserveCitationLinks || options.preserveReferenceAnchors)
		? findBibliographyContainers(doc)
		: [];

	for (const bib of bibContainers) {
		unhideElementAndAncestors(bib);
	}

	const footnoteContainers = Array.from(
		root.querySelectorAll('[role="doc-footnotes"], [role="doc-endnotes"], section.footnotes, div.footnotes, ol.footnotes')
	) as any[];
	for (const fnCont of footnoteContainers) {
		unhideElementAndAncestors(fnCont);
	}

	const mainArticle = findMainArticleContainer(doc);
	if (mainArticle) {
		for (const bib of bibContainers) {
			if (!mainArticle.contains(bib) && !bib.contains(mainArticle)) {
				mainArticle.appendChild(bib);
			}
		}
		for (const fnCont of footnoteContainers) {
			if (!mainArticle.contains(fnCont) && !fnCont.contains(mainArticle)) {
				mainArticle.appendChild(fnCont);
			}
		}
	}

	// Step B: Capture clean pre-standardization rawContentHtml
	let rawContentHtml = '';
	if (mainArticle) {
		const rawClone = mainArticle.cloneNode(true);
		const rawTargetIds = new Set(Array.from(buildIdElementMap(rawClone).keys()));
		resolveUrlsAndSanitize(rawClone, url, baseUrl, rawTargetIds);
		rawContentHtml = rawClone.outerHTML || '';
	}

	// Step C: Math & Equation normalization
	if (options.preserveMath) {
		preprocessEquationContainersAndMath(doc, options, documentParser);
	}

	// Promote empty anchors before bibliography collection & ID mapping
	if (options.preserveReferenceAnchors || options.preserveCitationLinks) {
		promoteEmptyAnchors(root);
	}

	// Collect bibliography IDs & footnote container IDs
	const bibIds = new Set<string>();
	for (const bib of bibContainers) {
		for (const id of collectBibliographyItemIds(bib)) {
			bibIds.add(id);
		}
	}

	const footnoteContainerIds = new Set<string>();
	for (const fnCont of footnoteContainers) {
		for (const el of Array.from(fnCont.querySelectorAll?.('[id]') || []) as any[]) {
			if (el.id) footnoteContainerIds.add(el.id);
		}
	}

	const idMap = buildIdElementMap(root);
	const allTargetIds = new Set<string>([...idMap.keys(), ...bibIds]);

	// Step D: Isolate bibliography containers from Defuddle's standardizeFootnotes and PARTIAL_SELECTORS
	if (options.preserveCitationLinks || options.preserveReferenceAnchors) {
		bibContainers.forEach((bib, idx) => {
			if (!bib.parentNode) return;
			resolveUrlsAndSanitize(bib, url, baseUrl, allTargetIds);
			if (!bib.getAttribute('role')) {
				bib.setAttribute('role', 'doc-bibliography');
			}
			for (const el of Array.from(bib.querySelectorAll('*')) as any[]) {
				stripDestructiveCitationClasses(el);
			}
			// Convert button triggers inside bibliography if any, or remove UI-only buttons without links
			for (const btn of Array.from(bib.querySelectorAll('button')) as any[]) {
				if (!btn.querySelector('a') && !(btn.getAttribute('data-rid') || btn.getAttribute('data-bib-id'))) {
					btn.remove();
				}
			}
			// Preserve data-counter on Springer <li> by ensuring <ol> start matches if needed
			if (getTagName(bib) === 'ol' || bib.querySelector('ol')) {
				const ol = getTagName(bib) === 'ol' ? bib : bib.querySelector('ol');
				const firstLi = ol?.querySelector('li[data-counter]');
				if (firstLi && !ol.getAttribute('start')) {
					const numMatch = (firstLi.getAttribute('data-counter') || '').match(/^(\d+)/);
					if (numMatch && numMatch[1] !== '1') {
						ol.setAttribute('start', numMatch[1]);
					}
				}
			}

			// Strip non-essential attributes inside bibliography while keeping id, href, src, data-latex, etc.
			if (!options.preserveReferenceAnchors) {
				for (const el of Array.from([bib, ...Array.from(bib.querySelectorAll('*'))]) as any[]) {
					el.removeAttribute?.('id');
					el.removeAttribute?.('data-acad-extra-ids');
				}
			}

			const bibHtml = bib.outerHTML || '';
			unplacedBibliographies.push(bibHtml);

			const placeholder = doc.createElement('p');
			const tokenId = attachToken(placeholder, { bibliographyHtml: bibHtml });
			placeholder.textContent = `__ACAD_BIB_${idx}_${tokenId}__`;
			bib.replaceWith(placeholder);
		});
	}

	// Step E: Convert JS/Button citations & shield in-text citation/cross-reference links
	const referencedIds = new Set<string>();

	if (options.preserveCitationLinks) {
		// Convert button/span/javascript: triggers targeting bibliography or cross-ref IDs
		const jsTriggers = Array.from(
			root.querySelectorAll('button, span[role="button"], a[href^="javascript:"], a:not([href])')
		) as any[];
		for (const trigger of jsTriggers) {
			if (!trigger.parentNode) continue;
			if (trigger.closest?.('pre, code')) continue;
			const rawTarget =
				trigger.getAttribute('data-rid') ||
				trigger.getAttribute('data-bib-id') ||
				trigger.getAttribute('data-ref-id') ||
				trigger.getAttribute('data-reference-id') ||
				trigger.getAttribute('data-citation-id') ||
				trigger.getAttribute('data-target') ||
				trigger.getAttribute('aria-controls') ||
				'';
			const cleanTarget = rawTarget.trim().replace(/^#/, '').split(/\s+/)[0];
			if (!cleanTarget || !allTargetIds.has(cleanTarget)) continue;

			const link = doc.createElement('a');
			link.setAttribute('href', `#${cleanTarget}`);
			while (trigger.firstChild) {
				link.appendChild(trigger.firstChild);
			}
			trigger.replaceWith(link);
		}

		// Shield citation & cross-reference <a> links from Defuddle's EXACT_SELECTORS, PARTIAL_SELECTORS, and FootnoteHandler
		for (const link of Array.from(root.querySelectorAll('a[href]')) as any[]) {
			if (!link.parentNode) continue;
			if (link.closest?.('pre, code')) continue;

			const rawHref = link.getAttribute('href') || '';
			const normalized = normalizeHrefToFragmentIfSamePage(rawHref, url, baseUrl, allTargetIds);
			if (normalized !== rawHref) {
				link.setAttribute('href', normalized);
			}
			if (!normalized.startsWith('#')) continue;

			const frag = normalized.slice(1);
			if (!frag) continue;

			// Leave true article footnotes for Defuddle's FootnoteHandler
			if (isTrueFootnoteLink(link, frag, bibIds, footnoteContainerIds, idMap)) {
				continue;
			}

			const isAcademicCitationOrCrossref =
				bibIds.has(frag) ||
				allTargetIds.has(frag) ||
				link.getAttribute('role') === 'doc-biblioref' ||
				link.classList?.contains('ltx_ref') ||
				link.classList?.contains('bibLink') ||
				link.classList?.contains('citation') ||
				CROSSREF_PREFIX_RE.test(frag) ||
				CROSSREF_TEXT_RE.test((link.textContent || '').trim()) ||
				!!link.closest?.('cite.ltx_cite');

			if (!isAcademicCitationOrCrossref) continue;

			referencedIds.add(frag);

			// Unwrap inner .ltx_ref_tag / .ltx_text spans so Defuddle doesn't replace a.ltx_ref with plain text
			for (const tagSpan of Array.from(link.querySelectorAll?.('span.ltx_ref_tag, span.ltx_text') || []) as any[]) {
				while (tagSpan.firstChild) {
					tagSpan.parentNode?.insertBefore(tagSpan.firstChild, tagSpan);
				}
				tagSpan.remove();
			}

			// Strip classes/attributes on link and inline parents that match Defuddle's removal/footnote selectors
			const origRole = link.getAttribute('role');
			if (origRole === 'doc-biblioref') {
				attachToken(link, { role: 'doc-biblioref' });
				link.removeAttribute('role');
			}
			if ((link.getAttribute('id') || '').toLowerCase().startsWith('ref-link')) {
				const linkId = link.getAttribute('id');
				if (linkId && options.preserveReferenceAnchors && allTargetIds.has(linkId)) {
					attachToken(link, { id: linkId });
				}
				link.removeAttribute('id');
			}
			stripDestructiveCitationClasses(link);

			let parent = link.parentElement;
			while (parent && (getTagName(parent) === 'sup' || getTagName(parent) === 'cite' || getTagName(parent) === 'span')) {
				stripDestructiveCitationClasses(parent);
				// Convert <cite> wrapper if needed? No, <cite> is in INLINE_ELEMENTS and safe once ltx_cite class is stripped
				parent = parent.parentElement;
			}

			link.setAttribute('href', `${CITE_SHIELD_PREFIX}${encodeURIComponent(frag)}`);
		}
	}

	// Also collect #fragments referenced from detached bibliographies
	if (options.preserveReferenceAnchors) {
		for (const fragLink of Array.from(root.querySelectorAll('a[href^="#"]')) as any[]) {
			const f = (fragLink.getAttribute('href') || '').slice(1);
			if (f) referencedIds.add(f);
		}
	}

	// Step F: Preserve reference anchor IDs on targets, headings, figures, tables, equations
	if (options.preserveReferenceAnchors) {
		for (const el of Array.from(root.querySelectorAll('[id]')) as any[]) {
			const id = el.getAttribute('id') || '';
			if (!id) continue;
			if (/^(?:fn:|fnref:|footnotes$)/i.test(id)) continue;
			if (el.closest?.('#footnotes, [role="doc-footnotes"], [role="doc-endnotes"]')) continue;

			const tag = getTagName(el);
			const shouldKeep =
				referencedIds.has(id) ||
				/^h[1-6]$/.test(tag) ||
				tag === 'figure' ||
				tag === 'table' ||
				tag === 'section' ||
				!!el.querySelector?.('math[display="block"]') ||
				!!el.getAttribute('data-acad-extra-ids');

			if (shouldKeep) {
				const extraAttr = el.getAttribute('data-acad-extra-ids');
				const extraIds = extraAttr ? extraAttr.split('\n').filter(Boolean) : undefined;
				attachToken(el, {
					id,
					...(extraIds?.length ? { extraIds } : {}),
				});
				el.removeAttribute('data-acad-extra-ids');

				// Defuddle's flattenWrapperElements unwraps <section>/<div> wrappers even when referenced by #id.
				// Record backupIds on the first durable content child so restoreAcademicHtml can recover lost IDs.
				if (/^(?:section|div|article|aside|main|header)$/.test(tag)) {
					let backupTarget = el.firstElementChild;
					while (
						backupTarget &&
						/^(?:section|div)$/.test(getTagName(backupTarget)) &&
						backupTarget.firstElementChild
					) {
						const directHeading = Array.from(backupTarget.children || []).find((c: any) =>
							/^h[1-6]$/.test(getTagName(c))
						);
						if (directHeading) {
							backupTarget = directHeading;
							break;
						}
						backupTarget = backupTarget.firstElementChild;
					}
					if (backupTarget && !backupTarget.closest?.('pre, code')) {
						const allSectionIds = [id, ...(extraIds || [])];
						attachToken(backupTarget, { backupIds: allSectionIds });
					}
				}
			}
		}
	}

	// Step G: Snapshot data <table>s (when preserveComplexTables is enabled)
	if (options.preserveComplexTables) {
		const tables = Array.from(root.querySelectorAll('table')) as any[];
		tables.forEach((table, idx) => {
			if (!table.parentNode) return;
			// Skip nested tables — their outer table snapshot preserves them
			if (table.parentElement?.closest?.('table')) return;

			const isDataTable =
				!!table.querySelector('caption, thead, tfoot, th, [colspan], [rowspan]') ||
				table.getAttribute('role') === 'table' ||
				table.classList?.contains('table') ||
				Array.from(table.querySelectorAll('tr')).filter((tr: any) => tr.closest('table') === table).length >= 2;

			if (!isDataTable) return;

			resolveUrlsAndSanitize(table, url, baseUrl, allTargetIds);

			// Collect adjacent table footnotes (e.g. .table-foot, .tbl-fn, .table-wrap-foot)
			let tableFootnotesHtml = '';
			const nextSib = table.nextElementSibling;
			if (
				nextSib &&
				/table[-_]?(?:foot|fn|note)|tbl[-_]?fn/i.test(getClassName(nextSib))
			) {
				resolveUrlsAndSanitize(nextSib, url, baseUrl, allTargetIds);
				tableFootnotesHtml = nextSib.outerHTML || '';
				nextSib.remove();
			}

			// Keep table ID intact in snapshot if preserveReferenceAnchors
			const existingLang = table.getAttribute('data-lang') || '';
			let preservedTableId = table.getAttribute('id') || '';
			if (!preservedTableId && existingLang.startsWith(TOKEN_PREFIX)) {
				const tData = tokens.get(existingLang.slice(TOKEN_PREFIX.length));
				if (tData?.id) preservedTableId = tData.id;
			}
			const clonedTable = table.cloneNode(true);
			clonedTable.removeAttribute('data-lang');
			if (options.preserveReferenceAnchors && preservedTableId) {
				clonedTable.setAttribute('id', preservedTableId);
			} else if (!options.preserveReferenceAnchors) {
				clonedTable.removeAttribute('id');
			}

			attachToken(table, {
				tableHtml: clonedTable.outerHTML || '',
				...(tableFootnotesHtml ? { tableFootnotesHtml } : {}),
			});

			// Replace inner contents with a protected data-table placeholder so Defuddle doesn't unwrap or mutate it
			table.textContent = '';
			const thead = doc.createElement('thead');
			const htr = doc.createElement('tr');
			const th = doc.createElement('th');
			th.textContent = `__ACAD_TBL_${idx}__`;
			htr.appendChild(th);
			thead.appendChild(htr);
			const tbody = doc.createElement('tbody');
			const btr = doc.createElement('tr');
			const td = doc.createElement('td');
			td.textContent = `__ACAD_TBL_${idx}__`;
			btr.appendChild(td);
			tbody.appendChild(btr);
			table.appendChild(thead);
			table.appendChild(tbody);
		});
	}

	// Step H: Snapshot <figure>s (when preserveFigures is enabled)
	if (options.preserveFigures) {
		const figures = Array.from(root.querySelectorAll('figure')) as any[];
		figures.forEach((figure, idx) => {
			if (!figure.parentNode) return;

			// Restore any inner table placeholders inside this figure before snapshotting figure
			for (const innerTable of Array.from(figure.querySelectorAll('table')) as any[]) {
				const lang = innerTable.getAttribute('data-lang') || '';
				if (lang.startsWith(TOKEN_PREFIX)) {
					const tData = tokens.get(lang.slice(TOKEN_PREFIX.length));
					if (tData?.tableHtml) {
						const nodes = parseFragmentNodes(doc, tData.tableHtml + (tData.tableFootnotesHtml || ''), documentParser);
						replaceWithNodes(innerTable, nodes);
					}
				}
			}

			resolveBestFigureImages(figure, url, baseUrl);

			// Restore ID onto figure clone for the snapshot if preserveReferenceAnchors
			const existingLang = figure.getAttribute('data-lang') || '';
			let preservedFigId = figure.getAttribute('id') || '';
			if (!preservedFigId && existingLang.startsWith(TOKEN_PREFIX)) {
				const tData = tokens.get(existingLang.slice(TOKEN_PREFIX.length));
				if (tData?.id) preservedFigId = tData.id;
			}
			const clonedFigure = figure.cloneNode(true);
			clonedFigure.removeAttribute('data-lang');
			if (options.preserveReferenceAnchors && preservedFigId) {
				clonedFigure.setAttribute('id', preservedFigId);
			} else if (!options.preserveReferenceAnchors) {
				clonedFigure.removeAttribute('id');
			}

			attachToken(figure, {
				figureHtml: clonedFigure.outerHTML || '',
			});

			// Replace inner content with placeholder <p> (no <img> so Defuddle's images.ts & deduplication ignore it)
			figure.textContent = '';
			const p = doc.createElement('p');
			p.textContent = `__ACAD_FIG_${idx}__`;
			figure.appendChild(p);
		});
	}

	return {
		options,
		url,
		tokens,
		unplacedBibliographies,
		rawContentHtml,
		referencedIds,
		bibIds,
	};
}

export function restoreAcademicHtml(
	contentHtml: string,
	state: AcademicPreprocessState,
	documentParser?: DocumentParserLike
): string {
	if (!contentHtml || !state.options.anyEnabled) {
		return contentHtml;
	}

	const doc = parseHtmlDocument(contentHtml, documentParser);
	const body = doc?.body || doc?.documentElement;
	if (!body) return contentHtml;

	const restoredBibIndices = new Set<number>();
	const pendingBackups: Array<{ anchorTarget: any; ids: string[] }> = [];

	// 1. Restore tokens (figures, tables, bibliographies, ids, roles, extraIds)
	const tokenEls = Array.from(body.querySelectorAll(`[data-lang^="${TOKEN_PREFIX}"]`)) as any[];
	for (const el of tokenEls) {
		const rawLang = el.getAttribute('data-lang') || '';
		const tokenId = rawLang.slice(TOKEN_PREFIX.length);
		const data = state.tokens.get(tokenId);
		if (!data) continue;

		if (data.origDataLang) {
			el.setAttribute('data-lang', data.origDataLang);
		} else {
			el.removeAttribute('data-lang');
		}

		if (data.figureHtml) {
			const nodes = parseFragmentNodes(doc, data.figureHtml, documentParser);
			const firstNode = nodes[0] || null;
			replaceWithNodes(el, nodes);
			if (firstNode && data.backupIds?.length) {
				pendingBackups.push({ anchorTarget: firstNode, ids: data.backupIds });
			}
			continue;
		}

		if (data.tableHtml) {
			const footnotesDiv = data.tableFootnotesHtml
				? `<div class="academic-table-footnotes">${data.tableFootnotesHtml}</div>`
				: '';
			const nodes = parseFragmentNodes(doc, data.tableHtml + footnotesDiv, documentParser);
			const firstNode = nodes[0] || null;
			replaceWithNodes(el, nodes);
			if (firstNode && data.backupIds?.length) {
				pendingBackups.push({ anchorTarget: firstNode, ids: data.backupIds });
			}
			continue;
		}

		if (data.bibliographyHtml) {
			const match = (el.textContent || '').match(/__ACAD_BIB_(\d+)_/);
			if (match) {
				restoredBibIndices.add(parseInt(match[1], 10));
			}
			const nodes = parseFragmentNodes(doc, data.bibliographyHtml, documentParser);
			const firstNode = nodes[0] || null;
			replaceWithNodes(el, nodes);
			if (firstNode && data.backupIds?.length) {
				pendingBackups.push({ anchorTarget: firstNode, ids: data.backupIds });
			}
			continue;
		}

		if (state.options.preserveReferenceAnchors && data.id) {
			el.setAttribute('id', data.id);
		}
		if (data.role) {
			el.setAttribute('role', data.role);
		}
		if (state.options.preserveReferenceAnchors && data.extraIds && data.extraIds.length > 0) {
			for (const extraId of [...data.extraIds].reverse()) {
				const anchor = doc.createElement('a');
				anchor.setAttribute('id', extraId);
				el.insertBefore(anchor, el.firstChild);
			}
		}
		if (state.options.preserveReferenceAnchors && data.backupIds && data.backupIds.length > 0) {
			pendingBackups.push({ anchorTarget: el, ids: data.backupIds });
		}
	}

	// 2. Append any bibliography sections that Defuddle missed if it chose a narrower inner container
	if (state.unplacedBibliographies.length > 0) {
		const containerRoot = body.children?.length === 1 && getTagName(body.children[0]) === 'div'
			? body.children[0]
			: body;
		const footnotesEl = containerRoot.querySelector?.('#footnotes');
		state.unplacedBibliographies.forEach((bibHtml, idx) => {
			if (restoredBibIndices.has(idx)) return;
			const nodes = parseFragmentNodes(doc, bibHtml, documentParser);
			for (const node of nodes) {
				if (footnotesEl && footnotesEl.parentNode === containerRoot) {
					containerRoot.insertBefore(node, footnotesEl);
				} else {
					containerRoot.appendChild(node);
				}
			}
		});
	}

	// 2b. Recover any backup IDs whose enclosing <section>/<div> wrapper was flattened by Defuddle
	if (state.options.preserveReferenceAnchors && pendingBackups.length > 0) {
		const restoredIds = new Set<string>();
		for (const elWithId of Array.from(body.querySelectorAll('[id]')) as any[]) {
			const existingId = elWithId.getAttribute('id');
			if (existingId) restoredIds.add(existingId);
		}

		for (const { anchorTarget, ids } of pendingBackups) {
			if (!anchorTarget?.parentNode) continue;
			const missingIds = ids.filter(id => id && !restoredIds.has(id));
			if (missingIds.length === 0) continue;

			const targetTag = anchorTarget.nodeType === ELEMENT_NODE ? getTagName(anchorTarget) : '';
			const isContainerBlock = /^(?:figure|table|ul|ol)$/.test(targetTag);

			for (const bId of missingIds) {
				if (anchorTarget.nodeType === ELEMENT_NODE && !isContainerBlock && !anchorTarget.getAttribute('id')) {
					anchorTarget.setAttribute('id', bId);
				} else {
					const anchor = doc.createElement('a');
					anchor.setAttribute('id', bId);
					if (anchorTarget.nodeType === ELEMENT_NODE && !isContainerBlock) {
						anchorTarget.insertBefore(anchor, anchorTarget.firstChild);
					} else {
						anchorTarget.parentNode.insertBefore(anchor, anchorTarget);
					}
				}
				restoredIds.add(bId);
			}
		}
	}

	// 3. Decode shielded citation links back to #fragment
	for (const link of Array.from(body.querySelectorAll(`a[href^="${CITE_SHIELD_PREFIX}"]`)) as any[]) {
		const href = link.getAttribute('href') || '';
		const encodedFrag = href.slice(CITE_SHIELD_PREFIX.length);
		try {
			link.setAttribute('href', `#${decodeURIComponent(encodedFrag)}`);
		} catch {
			link.setAttribute('href', `#${encodedFrag}`);
		}
	}

	// 4. Populate data-latex on any <math> elements that Defuddle reconstructed without it
	if (state.options.preserveMath) {
		for (const mathEl of Array.from(body.querySelectorAll('math')) as any[]) {
			const existing = mathEl.getAttribute('data-latex') || '';
			if (!existing.trim()) {
				const extracted = extractLatexFromMathElement(mathEl, documentParser);
				if (extracted) {
					mathEl.setAttribute('data-latex', extracted);
				}
			}
		}
	}

	return body.innerHTML;
}

function isComplexTableElement(table: any): boolean {
	for (const cell of Array.from(table.querySelectorAll?.('td, th') || []) as any[]) {
		if (cell.closest?.('table') !== table) continue;
		const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
		const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);
		if (colspan > 1 || rowspan > 1) return true;

		if (cell.querySelector('table, ul, ol, pre, blockquote')) return true;
		const paragraphs = Array.from(cell.querySelectorAll('p')).filter((p: any) => p.closest('table') === table);
		if (paragraphs.length > 1) return true;
	}

	if (table.querySelector?.('tfoot')) return true;

	const thead = Array.from(table.children || []).find((c: any) => getTagName(c) === 'thead') as any;
	if (thead) {
		const theadRows = Array.from(thead.children || []).filter((c: any) => getTagName(c) === 'tr');
		if (theadRows.length > 1) return true;
	}

	return false;
}

function prepareMathElementsForMarkdown(node: any, documentParser?: DocumentParserLike): void {
	const mathNodes = Array.from(node.querySelectorAll?.('math, .katex') || []) as any[];
	for (const mNode of mathNodes) {
		if (!mNode.parentNode || mNode.closest?.('pre, code')) continue;
		if (mNode.parentElement?.closest?.('math, .katex')) continue;
		const isMathTag = getTagName(mNode) === 'math';
		const innerMath = isMathTag ? mNode : mNode.querySelector?.('.katex-mathml math');
		const latex = innerMath
			? extractLatexFromMathElement(innerMath, documentParser)
			: (mNode.getAttribute('data-latex') || '');
		if (!latex) continue;
		mNode.setAttribute('data-latex', latex);
		if (innerMath && innerMath !== mNode) {
			innerMath.setAttribute('data-latex', latex);
		}
		if (isMathTag) {
			// Ensure Defuddle's extractLatex() picks up normalized LaTeX cleanly even for non-standard annotation encodings
			const doc = mNode.ownerDocument;
			let xTex = mNode.querySelector?.('annotation[encoding="application/x-tex"]');
			if (!xTex && doc) {
				xTex = doc.createElement('annotation');
				xTex.setAttribute('encoding', 'application/x-tex');
				xTex.textContent = latex;
				mNode.appendChild(xTex);
			} else if (xTex && !xTex.textContent?.trim()) {
				xTex.textContent = latex;
			}
			if (!mNode.textContent?.trim()) {
				mNode.textContent = latex;
			}
		}
	}
}

function convertMathInsideNodeToInlineLatex(node: any, doc: any, documentParser?: DocumentParserLike): void {
	const mathNodes = Array.from(node.querySelectorAll?.('math, .katex') || []) as any[];
	for (const mNode of mathNodes) {
		if (!mNode.parentNode) continue;
		if (mNode.parentElement?.closest?.('math, .katex')) continue;
		const innerMath = getTagName(mNode) === 'math' ? mNode : mNode.querySelector?.('.katex-mathml math');
		const latex = innerMath
			? extractLatexFromMathElement(innerMath, documentParser)
			: (mNode.getAttribute('data-latex') || '');
		if (!latex) continue;
		const textNode = doc.createTextNode(`$${latex.trim()}$`);
		mNode.replaceWith(textNode);
	}
}

function serializeComplexTableHtml(
	table: any,
	doc: any,
	url: string,
	preserveMath: boolean,
	preserveReferenceAnchors: boolean,
	documentParser?: DocumentParserLike
): string {
	const clone = table.cloneNode(true);

	// Remove trivial colspan="1" / rowspan="1"
	for (const cell of Array.from(clone.querySelectorAll('td, th')) as any[]) {
		if (cell.getAttribute('colspan') === '1') cell.removeAttribute('colspan');
		if (cell.getAttribute('rowspan') === '1') cell.removeAttribute('rowspan');
	}

	if (preserveMath) {
		convertMathInsideNodeToInlineLatex(clone, doc, documentParser);
	}

	// Convert internal caption/cell links? Keep clean <a href="..."> inside HTML table so HTML stays valid
	cleanElementAttributesForAcademicHtml(clone, TABLE_ALLOWED_ATTRS, false);
	if (!preserveReferenceAnchors) {
		for (const el of Array.from([clone, ...Array.from(clone.querySelectorAll('[id]'))]) as any[]) {
			el.removeAttribute('id');
		}
	}

	let html = clone.outerHTML || '';
	// Only decode &amp; inside $...$ math blocks so LaTeX alignment (&) works,
	// while keeping &lt; / &gt; safe in prose (e.g. p &lt; 0.05).
	html = html.replace(/\$([^$]+)\$/g, (full: string, inner: string) => {
		return `$${inner.replace(/&amp;/g, '&')}$`;
	});
	return html;
}

function formatMarkdownDestination(href: string): string {
	if (!/\s/.test(href)) return href.replace(/([()])/g, '\\$1');
	return `<${href.replace(/>/g, '\\>')}>`;
}

function formatMarkdownTitle(title: string | null): string {
	if (!title) return '';
	return ` "${title.replace(/(\n+\s*)+/g, '\n').replace(/"/g, '\\"')}"`;
}

function hasInlineAcademicSignals(doc: any): boolean {
	if (!doc?.querySelector) return false;
	return !!doc.querySelector(
		'math, .katex, annotation, ' +
		'figure figcaption, figure img[srcset], ' +
		'table caption, table tfoot, table td[colspan], table td[rowspan], table th[colspan], table th[rowspan], ' +
		'.academic-table-footnotes, [role="doc-bibliography"], [role="doc-biblioref"], ' +
		'a[href^="#CR"], a[href*="-bib-"], a[href^="#bib"], a[href^="#fig"], a[href^="#tab"], a[href^="#eq"]'
	);
}

function convertNodeToMarkdownInlineOrBlock(
	html: string,
	url: string,
	options: ResolvedAcademicOptions,
	documentParser?: DocumentParserLike
): string {
	if (!html.trim()) return '';
	return createAcademicMarkdownContent(html, url, {
		academicMode: options.academicMode,
		preserveCitationLinks: options.preserveCitationLinks,
		preserveReferenceAnchors: options.preserveReferenceAnchors,
		preserveMath: options.preserveMath,
		preserveComplexTables: options.preserveComplexTables,
		preserveFigures: options.preserveFigures,
	}, documentParser);
}

export function createAcademicMarkdownContent(
	contentHtml: string,
	url: string,
	options?: AcademicOptions,
	documentParser?: DocumentParserLike
): string {
	if (!contentHtml) return '';
	const parser = documentParser ?? activeDocumentParser;

	const doc = parseHtmlDocument(contentHtml, parser);
	const body = doc?.body || doc?.documentElement;
	if (!body) {
		return createMarkdownContent(contentHtml, url);
	}

	const hasExplicitOptions = options !== undefined && (
		options.academicMode !== undefined ||
		options.preserveCitationLinks !== undefined ||
		options.preserveReferenceAnchors !== undefined ||
		options.preserveMath !== undefined ||
		options.preserveComplexTables !== undefined ||
		options.preserveFigures !== undefined
	);

	const resolved = hasExplicitOptions
		? resolveAcademicOptions(options, { doc, url })
		: resolveAcademicOptions(
			hasInlineAcademicSignals(doc) ? { academicMode: true } : { academicMode: false },
			{ doc, url }
		);

	if (!resolved.anyEnabled) {
		return createMarkdownContent(contentHtml, url);
	}

	const baseUrl = getBaseUrl(doc, url);
	const idMap = buildIdElementMap(body);
	const allIds = new Set<string>(idMap.keys());

	// Collect all referenced #fragments in the document
	const referencedIds = new Set<string>();
	for (const link of Array.from(body.querySelectorAll('a[href]')) as any[]) {
		const rawHref = link.getAttribute('href') || '';
		const norm = normalizeHrefToFragmentIfSamePage(rawHref, url, baseUrl, allIds);
		if (norm !== rawHref) link.setAttribute('href', norm);
		if (norm.startsWith('#') && norm.length > 1) {
			referencedIds.add(norm.slice(1));
		}
	}

	const blockSentinels = new Map<string, string>();
	const anchorSentinels = new Map<string, string>();
	let sentinelSeq = 0;

	const createBlockSentinel = (markdownBlock: string): any => {
		const token = `ACADBLOCK${sentinelSeq++}END`;
		blockSentinels.set(token, markdownBlock);
		const p = doc.createElement('p');
		p.textContent = token;
		return p;
	};

	const createAnchorSentinel = (ids: string[]): string => {
		const unique = Array.from(new Set(ids.filter(Boolean)));
		if (unique.length === 0) return '';
		const token = `ACADANCHOR${sentinelSeq++}END`;
		anchorSentinels.set(token, unique.map(id => `<a id="${id}"></a>`).join(''));
		return token;
	};

	// 1. Math preprocessing in standalone HTML passed directly (e.g. via |markdown filter)
	if (resolved.preserveMath) {
		prepareMathElementsForMarkdown(body, documentParser);
		for (const mathEl of Array.from(body.querySelectorAll('math')) as any[]) {
			if (mathEl.closest?.('pre, code')) continue;
			// Handle equation id on <math> or direct wrapper <p id="eq1">
			if (resolved.preserveReferenceAnchors && mathEl.getAttribute('display') === 'block') {
				const mathId = mathEl.getAttribute('id') || '';
				const parentP = mathEl.parentElement && getTagName(mathEl.parentElement) === 'p' && mathEl.parentElement.children?.length === 1
					? mathEl.parentElement
					: null;
				const eqId = mathId || (parentP?.getAttribute('id') || '');
				if (eqId && !/^(?:fn:|fnref:)/.test(eqId)) {
					const anchorToken = createAnchorSentinel([eqId]);
					if (mathId) mathEl.removeAttribute('id');
					if (parentP && parentP.getAttribute('id') === eqId) parentP.removeAttribute('id');
					const anchorP = doc.createElement('p');
					anchorP.textContent = anchorToken;
					const insertTarget = parentP || mathEl;
					insertTarget.parentNode?.insertBefore(anchorP, insertTarget);
				}
			}
		}
	}

	// 2. Figures (preserveFigures)
	if (resolved.preserveFigures) {
		for (const figure of Array.from(body.querySelectorAll('figure')) as any[]) {
			if (!figure.parentNode) continue;
			const imgs = Array.from(figure.querySelectorAll('img')).filter((img: any) => {
				const src = getBestImageSrc(img);
				return !!src && !/^data:image\/gif;base64,R0lGODlhAQAB/i.test(src);
			}) as any[];
			const figcaption = figure.querySelector('figcaption');
			const figId = figure.getAttribute('id') || '';

			// Non-image figures (e.g. table wrapped in <figure>, code figure, SVG figure):
			// preserve inner non-image blocks instead of dropping them.
			if (imgs.length === 0) {
				const innerTable = figure.querySelector('table');
				if (innerTable) {
					if (figId && !innerTable.getAttribute('id')) {
						innerTable.setAttribute('id', figId);
					} else if (figId && resolved.preserveReferenceAnchors) {
						const anchorP = doc.createElement('p');
						anchorP.textContent = createAnchorSentinel([figId]);
						figure.parentNode.insertBefore(anchorP, figure);
					}
					if (figcaption && !innerTable.querySelector('caption')) {
						const cap = doc.createElement('caption');
						while (figcaption.firstChild) cap.appendChild(figcaption.firstChild);
						innerTable.insertBefore(cap, innerTable.firstChild);
						figcaption.remove();
					}
				} else if (figId && resolved.preserveReferenceAnchors) {
					const anchorP = doc.createElement('p');
					anchorP.textContent = createAnchorSentinel([figId]);
					figure.parentNode.insertBefore(anchorP, figure);
				}
				while (figure.firstChild) {
					figure.parentNode.insertBefore(figure.firstChild, figure);
				}
				figure.remove();
				continue;
			}

			if (resolved.preserveFigures === 'html') {
				const figClone = figure.cloneNode(true);
				cleanElementAttributesForAcademicHtml(figClone, FIGURE_ALLOWED_ATTRS, false);
				if (!resolved.preserveReferenceAnchors) {
					figClone.removeAttribute('id');
				}
				figure.replaceWith(createBlockSentinel(figClone.outerHTML || ''));
				continue;
			}

			// Markdown figure: <a id="..."></a> + ![alt](bestSrc) per subfigure + rich Markdown caption
			const parts: string[] = [];
			if (resolved.preserveReferenceAnchors && figId) {
				parts.push(`<a id="${figId}"></a>`);
			}

			for (const img of imgs) {
				const alt = (img.getAttribute('alt') || '').replace(/[\r\n]+/g, ' ').trim();
				const src = getBestImageSrc(img);
				const title = img.getAttribute('title') || '';
				const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
				if (src) {
					parts.push(`![${alt}](${src}${titlePart})`);
				}
			}

			if (figcaption) {
				const capClone = figcaption.cloneNode(true);
				if (resolved.preserveMath) {
					prepareMathElementsForMarkdown(capClone, documentParser);
				}
				const capMd = convertNodeToMarkdownInlineOrBlock(capClone.innerHTML || '', url, resolved, documentParser).trim();
				if (capMd) {
					parts.push(capMd);
				}
			}

			if (parts.length > 0) {
				figure.replaceWith(createBlockSentinel(parts.join('\n\n')));
			}
		}
	}

	// 3. Tables (preserveComplexTables)
	if (resolved.preserveComplexTables) {
		for (const table of Array.from(body.querySelectorAll('table')) as any[]) {
			if (!table.parentNode) continue;
			if (table.parentElement?.closest?.('table')) continue;

			const tableId = table.getAttribute('id') || '';
			const caption = Array.from(table.children || []).find((c: any) => getTagName(c) === 'caption') as any;
			let captionMd = '';
			if (caption) {
				const capClone = caption.cloneNode(true);
				if (resolved.preserveMath) {
					prepareMathElementsForMarkdown(capClone, documentParser);
				}
				captionMd = convertNodeToMarkdownInlineOrBlock(capClone.innerHTML || '', url, resolved, documentParser).trim();
			}

			let footnotesMd = '';
			const nextSib = table.nextElementSibling;
			if (nextSib && (nextSib.classList?.contains('academic-table-footnotes') || /table[-_]?(?:foot|fn|note)|tbl[-_]?fn/i.test(getClassName(nextSib)))) {
				const fnClone = nextSib.cloneNode(true);
				if (resolved.preserveMath) {
					prepareMathElementsForMarkdown(fnClone, documentParser);
				}
				footnotesMd = convertNodeToMarkdownInlineOrBlock(fnClone.innerHTML || '', url, resolved, documentParser).trim();
				nextSib.remove();
			}

			if (isComplexTableElement(table)) {
				const htmlTable = serializeComplexTableHtml(
					table,
					doc,
					url,
					resolved.preserveMath,
					resolved.preserveReferenceAnchors,
					documentParser
				);
				const parts: string[] = [];
				if (resolved.preserveReferenceAnchors && tableId) {
					// id is already on <table>, plus if referenced in markdown an <a id> before table ensures cross-links jump cleanly
					parts.push(`<a id="${tableId}"></a>`);
				}
				parts.push(htmlTable);
				if (footnotesMd) parts.push(footnotesMd);
				table.replaceWith(createBlockSentinel(parts.join('\n\n')));
			} else {
				// Simple table: strip trivial span=1 so Turndown makes a pipe table, and preserve id, caption, footnotes
				for (const cell of Array.from(table.querySelectorAll('td, th')) as any[]) {
					if (cell.getAttribute('colspan') === '1') cell.removeAttribute('colspan');
					if (cell.getAttribute('rowspan') === '1') cell.removeAttribute('rowspan');
				}
				if (caption) caption.remove();

				if (resolved.preserveReferenceAnchors && tableId) {
					table.removeAttribute('id');
					const anchorP = doc.createElement('p');
					anchorP.textContent = createAnchorSentinel([tableId]);
					table.parentNode.insertBefore(anchorP, table);
				}
				if (captionMd) {
					const capP = doc.createElement('p');
					capP.textContent = `ACADRAWMD${sentinelSeq++}END`;
					blockSentinels.set(capP.textContent, captionMd);
					table.parentNode.insertBefore(capP, table);
				}
				if (footnotesMd) {
					const fnP = createBlockSentinel(footnotesMd);
					table.parentNode.insertBefore(fnP, table.nextSibling);
				}
			}
		}
	}

	// 4. Convert links inside <sup> / <sub> (excluding Defuddle fnref:* footnotes) to Markdown links
	if (resolved.preserveCitationLinks) {
		for (const supOrSub of Array.from(body.querySelectorAll('sup, sub')) as any[]) {
			if ((supOrSub.getAttribute('id') || '').startsWith('fnref:')) continue;
			const links = Array.from(supOrSub.querySelectorAll('a[href]')) as any[];
			if (links.length === 0) continue;
			for (const a of links) {
				const href = a.getAttribute('href') || '';
				if (!href || href.startsWith('#fn:')) continue;
				const innerHtml = a.innerHTML || '';
				let linkText = innerHtml
					? createMarkdownContent(innerHtml, url).trim()
					: (a.textContent || '').trim();
				// Avoid nested unescaped brackets breaking Markdown link parsing
				linkText = linkText.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
				const dest = formatMarkdownDestination(href);
				const title = formatMarkdownTitle(a.getAttribute('title'));
				a.replaceWith(doc.createTextNode(`[${linkText}](${dest}${title})`));
			}
			// Collapse spurious whitespace Defuddle's standardizeSpaces/removeEmptyLines inserts around range dashes (e.g. [12](#CR12) – [15](#CR15))
			supOrSub.normalize();
			for (const child of Array.from(supOrSub.childNodes || []) as any[]) {
				if (child.nodeType === TEXT_NODE && child.textContent) {
					child.textContent = child.textContent.replace(
						/(\]\((?:[^)\\]|\\.)+\))\s+([–—-])\s+(?=\[[^\]]+\]\((?:[^)\\]|\\.)+\))/g,
						'$1$2'
					);
				}
			}
		}
	}

	// 5. Inject anchor sentinels for bibliography items & referenced element IDs
	if (resolved.preserveReferenceAnchors) {
		const bibContainersInBody = new Set(
			Array.from(body.querySelectorAll(
				'[role="doc-bibliography"], .article-section__references, ol.c-article-references, ' +
				'ol.references, ol[class*="article-references"], ul.ltx_biblist, .references, .bibliography'
			)) as any[]
		);
		const bibItems = Array.from(
			body.querySelectorAll(
				'[role="doc-bibliography"] li, [role="doc-biblioentry"], ' +
				'ol.references li, ol.c-article-references li, ol[class*="article-references"] li, ' +
				'ul.ltx_biblist li, .article-section__references li, .references li, .bibliography li'
			)
		) as any[];
		const bibItemSet = new Set(bibItems);

		for (const el of Array.from(body.querySelectorAll('[id]')) as any[]) {
			const id = el.getAttribute('id') || '';
			if (!id) continue;
			if (id === 'footnotes' || /^(?:fn:|fnref:)/i.test(id)) continue;
			if (el.closest?.('#footnotes, [role="doc-footnotes"], [role="doc-endnotes"]')) continue;

			const tag = getTagName(el);
			const bibAncestor = el.closest?.(
				'[role="doc-bibliography"], .article-section__references, ol.c-article-references, ' +
				'ol.references, ol[class*="article-references"], ul.ltx_biblist, .references, .bibliography'
			);
			const isLeafBibEntry =
				!!bibAncestor &&
				!bibContainersInBody.has(el) &&
				(tag === 'p' || tag === 'div' || tag === 'dd') &&
				!el.querySelector?.('li, [role="doc-biblioentry"], p[id], div[id], dd[id]');
			const isBibItem = bibItemSet.has(el) || isLeafBibEntry;
			const isReferenced = referencedIds.has(id);
			if (!isBibItem && !isReferenced) continue;

			// Also collect any empty child <a id="..."></a> inside this element
			const idsToEmit = [id];
			for (const childAnchor of Array.from(el.querySelectorAll?.('a[id]') || []) as any[]) {
				const cId = childAnchor.getAttribute('id');
				const isEmpty = !(childAnchor.textContent || '').trim() && !childAnchor.querySelector('img, svg, math');
				if (cId && isEmpty) {
					idsToEmit.push(cId);
					childAnchor.remove();
				}
			}

			const sentinel = createAnchorSentinel(idsToEmit);
			if (tag === 'li') {
				const firstP = el.firstElementChild && getTagName(el.firstElementChild) === 'p' ? el.firstElementChild : null;
				const target = firstP || el;
				target.insertBefore(doc.createTextNode(`${sentinel} `), target.firstChild);
			} else if (/^(?:h[1-6]|p|div|dt|dd|blockquote|span)$/.test(tag)) {
				el.insertBefore(doc.createTextNode(`${sentinel} `), el.firstChild);
			} else if (/^(?:section|article|main|aside)$/.test(tag) && el.firstElementChild && /^h[1-6]$/.test(getTagName(el.firstElementChild))) {
				const headingChild = el.firstElementChild;
				headingChild.insertBefore(doc.createTextNode(`${sentinel} `), headingChild.firstChild);
			} else {
				const p = doc.createElement('p');
				p.textContent = sentinel;
				el.parentNode?.insertBefore(p, el);
			}
		}

		// Also handle any remaining standalone empty <a id="..."></a> anchors
		for (const a of Array.from(body.querySelectorAll('a[id]')) as any[]) {
			const id = a.getAttribute('id') || '';
			const isEmpty = !(a.textContent || '').trim() && !a.querySelector('img, svg, math');
			if (!id || !isEmpty || /^(?:fn:|fnref:)/.test(id)) continue;
			const sentinel = createAnchorSentinel([id]);
			a.replaceWith(doc.createTextNode(sentinel));
		}
	}

	// 6. Convert prepared HTML to Markdown via Defuddle's createMarkdownContent
	let markdown = createMarkdownContent(body.innerHTML, url);

	// 7. Restore block and anchor sentinels
	for (const [token, blockContent] of blockSentinels.entries()) {
		markdown = markdown.split(token).join(blockContent);
	}
	for (const [token, anchorHtml] of anchorSentinels.entries()) {
		// Strip extra trailing space immediately after inline anchor before text? Keep clean `<a id="..."></a>`
		markdown = markdown.split(`${token} `).join(anchorHtml);
		markdown = markdown.split(token).join(anchorHtml);
	}

	// Collapse excessive blank lines introduced by block replacements
	markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

	return markdown;
}
