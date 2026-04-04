interface MetaTag {
	name?: string | null;
	property?: string | null;
	content: string | null;
}

interface ResolvePageMetadataParams {
	url: string;
	document?: Document;
	title?: string;
	author?: string;
	published?: string;
	contentHtml?: string;
	metaTags?: MetaTag[];
}

interface WeiboMetadata {
	title?: string;
	author?: string;
	authorUrl?: string;
	published?: string;
}

export interface ResolvedPageMetadata {
	title: string;
	author: string;
	authorUrl: string;
	published: string;
}

const GENERIC_WEIBO_TITLES = new Set([
	'微博',
	'微博正文',
	'Sina Visitor System',
]);

const GENERIC_WEIBO_CONTENT_LINES = new Set([
	'公开',
	'仅自己可见',
	'好友圈',
	'粉丝可见',
	'置顶',
	'置顶微博',
	'已编辑',
]);

export function resolvePageMetadata(params: ResolvePageMetadataParams): ResolvedPageMetadata {
	const title = normalizeWhitespace(params.title);
	const author = normalizeWhitespace(params.author);
	const published = normalizeWhitespace(params.published);

	if (!isWeiboUrl(params.url)) {
		return {
			title,
			author,
			authorUrl: '',
			published,
		};
	}

	const weiboMetadata = extractWeiboMetadata(params.document, params.url, params.metaTags);
	const fallbackTitle = extractWeiboTitleFromContentHtml(params.contentHtml);
	const resolvedTitle = shouldReplaceWeiboTitle(title) ? weiboMetadata.title : title;
	const resolvedAuthor = author || weiboMetadata.author || '';
	const resolvedPublished = weiboMetadata.published || published;

	return {
		title: resolvedTitle || fallbackTitle || title,
		author: resolvedAuthor,
		authorUrl: weiboMetadata.authorUrl || '',
		published: resolvedPublished,
	};
}

function extractWeiboMetadata(document: Document | undefined, pageUrl: string, metaTags: MetaTag[] | undefined): WeiboMetadata {
	const metaTitle = extractWeiboTitleFromMeta(metaTags);
	const documentTitle = extractWeiboTitleFromDocument(document);
	const { author, authorUrl } = extractWeiboAuthor(document, pageUrl, metaTags);
	const published = extractWeiboPublished(document, pageUrl, metaTags);

	return {
		title: metaTitle || documentTitle,
		author,
		authorUrl,
		published,
	};
}

function extractWeiboTitleFromMeta(metaTags: MetaTag[] | undefined): string {
	if (!metaTags?.length) {
		return '';
	}

	const preferredKeys = new Set([
		'og:title',
		'twitter:title',
		'title',
	]);

	for (const meta of metaTags) {
		const key = (meta.property || meta.name || '').trim().toLowerCase();
		const content = normalizeWhitespace(meta.content);
		if (!content || !preferredKeys.has(key)) {
			continue;
		}

		const title = normalizeWeiboTitle(content);
		if (title) {
			return title;
		}
	}

	return '';
}

function extractWeiboTitleFromDocument(document: Document | undefined): string {
	if (!document) {
		return '';
	}

	const candidates = [
		document.title,
		document.querySelector('h1')?.textContent || '',
		document.querySelector('article h2')?.textContent || '',
	];

	for (const candidate of candidates) {
		const title = normalizeWeiboTitle(candidate);
		if (title) {
			return title;
		}
	}

	return '';
}

function extractWeiboTitleFromContentHtml(contentHtml: string | undefined): string {
	if (!contentHtml) {
		return '';
	}

	const firstLine = contentHtml
		.replace(/<(p|div|h1|h2|h3|li|blockquote|br)\b[^>]*>/gi, '\n')
		.replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.split('\n')
		.map(line => normalizeWhitespace(line))
		.find(line => line && !isGenericWeiboContentLine(line));

	if (!firstLine) {
		return '';
	}

	return firstLine.length > 50 ? firstLine.slice(0, 50) : firstLine;
}

function extractWeiboPublished(document: Document | undefined, pageUrl: string, metaTags: MetaTag[] | undefined): string {
	const metaPublished = extractWeiboPublishedFromMeta(metaTags);
	if (metaPublished) {
		return metaPublished;
	}

	const documentPublished = extractWeiboPublishedFromDocument(document, pageUrl);
	if (documentPublished) {
		return documentPublished;
	}

	return extractWeiboPublishedFromScripts(document);
}

function extractWeiboPublishedFromMeta(metaTags: MetaTag[] | undefined): string {
	if (!metaTags?.length) {
		return '';
	}

	const preferredKeys = new Set([
		'article:published_time',
		'og:published_time',
		'publication_date',
		'pubdate',
	]);

	for (const meta of metaTags) {
		const key = (meta.property || meta.name || '').trim().toLowerCase();
		if (!preferredKeys.has(key)) {
			continue;
		}

		const published = normalizeWeiboPublished(meta.content);
		if (published) {
			return published;
		}
	}

	return '';
}

function extractWeiboPublishedFromDocument(document: Document | undefined, pageUrl: string): string {
	if (!document) {
		return '';
	}

	const selectors = [
		'time[datetime]',
		'a[node-type="feed_list_item_date"][title]',
		'[node-type="feed_list_item_date"][title]',
		'a[href*="/status/"][title]',
		'a[href*="/detail/"][title]',
	];

	for (const selector of selectors) {
		const element = document.querySelector(selector);
		if (!element) {
			continue;
		}

		const candidate = normalizeWeiboPublished(
			element.getAttribute('datetime')
			|| element.getAttribute('title')
			|| element.textContent
		);

		if (candidate) {
			return candidate;
		}
	}

	const anchors = Array.from(document.querySelectorAll('a[href]'))
		.filter(anchor => !normalizeWeiboProfileUrl(anchor.getAttribute('href') || '', pageUrl));

	for (const anchor of anchors) {
		const candidate = normalizeWeiboPublished(anchor.getAttribute('title') || anchor.textContent);
		if (candidate) {
			return candidate;
		}
	}

	return '';
}

function extractWeiboPublishedFromScripts(document: Document | undefined): string {
	if (!document) {
		return '';
	}

	const scripts = Array.from(document.querySelectorAll('script'))
		.map(script => script.textContent || '')
		.filter(Boolean);

	for (const scriptText of scripts) {
		const match = scriptText.match(/"created_at"\s*:\s*"([^"]+)"/);
		if (!match) {
			continue;
		}

		const published = normalizeWeiboPublished(decodeEscapedString(match[1]));
		if (published) {
			return published;
		}
	}

	return '';
}

function extractWeiboAuthor(document: Document | undefined, pageUrl: string, metaTags: MetaTag[] | undefined): { author: string; authorUrl: string } {
	const fromMeta = extractWeiboAuthorFromMeta(metaTags, pageUrl);
	if (fromMeta.author && fromMeta.authorUrl) {
		return fromMeta;
	}

	const fromAnchor = extractWeiboAuthorFromAnchors(document, pageUrl);
	if (fromAnchor.author && fromAnchor.authorUrl) {
		return fromAnchor;
	}

	const fromScript = extractWeiboAuthorFromScripts(document, pageUrl);
	if (fromScript.author) {
		return fromScript;
	}

	return fromMeta.author ? fromMeta : { author: '', authorUrl: '' };
}

function extractWeiboAuthorFromMeta(metaTags: MetaTag[] | undefined, pageUrl: string): { author: string; authorUrl: string } {
	if (!metaTags?.length) {
		return { author: '', authorUrl: '' };
	}

	let author = '';
	let authorUrl = '';

	for (const meta of metaTags) {
		const key = (meta.property || meta.name || '').trim().toLowerCase();
		const content = normalizeWhitespace(meta.content);
		if (!content) {
			continue;
		}

		if ((key === 'author' || key === 'article:author') && !author && !looksLikeUrl(content)) {
			author = stripLeadingAt(content);
		}

		if (!authorUrl && looksLikeUrl(content)) {
			const normalizedUrl = normalizeWeiboProfileUrl(content, pageUrl);
			if (normalizedUrl) {
				authorUrl = normalizedUrl;
			}
		}
	}

	return { author, authorUrl };
}

function extractWeiboAuthorFromAnchors(document: Document | undefined, pageUrl: string): { author: string; authorUrl: string } {
	if (!document) {
		return { author: '', authorUrl: '' };
	}

	const anchors = Array.from(document.querySelectorAll('a[href]'))
		.map(anchor => {
			const href = normalizeWeiboProfileUrl(anchor.getAttribute('href') || '', pageUrl);
			const text = normalizeWhitespace(
				anchor.textContent
				|| anchor.getAttribute('title')
				|| anchor.getAttribute('aria-label')
				|| ''
			);
			return {
				href,
				text: stripLeadingAt(text),
				score: href ? scoreWeiboAuthorAnchor(anchor) : -1,
			};
		})
		.filter(candidate => candidate.href && isLikelyWeiboAuthorName(candidate.text))
		.sort((a, b) => b.score - a.score);

	if (anchors.length === 0) {
		return { author: '', authorUrl: '' };
	}

	return {
		author: anchors[0].text,
		authorUrl: anchors[0].href,
	};
}

function extractWeiboAuthorFromScripts(document: Document | undefined, pageUrl: string): { author: string; authorUrl: string } {
	if (!document) {
		return { author: '', authorUrl: '' };
	}

	const scripts = Array.from(document.querySelectorAll('script'))
		.map(script => script.textContent || '')
		.filter(Boolean);

	for (const scriptText of scripts) {
		const screenNameMatch = scriptText.match(/"screen_name"\s*:\s*"([^"]+)"/);
		if (!screenNameMatch) {
			continue;
		}

		const author = stripLeadingAt(decodeEscapedString(screenNameMatch[1]));
		if (!isLikelyWeiboAuthorName(author)) {
			continue;
		}

		const profileUrlMatch = scriptText.match(/"profile_url"\s*:\s*"([^"]+)"/);
		if (profileUrlMatch) {
			const authorUrl = normalizeWeiboProfileUrl(decodeEscapedString(profileUrlMatch[1]), pageUrl);
			if (authorUrl) {
				return { author, authorUrl };
			}
		}

		const idMatch = scriptText.match(/"idstr"\s*:\s*"(\d+)"/);
		if (idMatch) {
			return {
				author,
				authorUrl: `https://weibo.com/u/${idMatch[1]}`,
			};
		}

		return { author, authorUrl: '' };
	}

	return { author: '', authorUrl: '' };
}

function normalizeWeiboTitle(value: string | null | undefined): string {
	const normalized = normalizeWhitespace(value);
	if (!normalized || isGenericWeiboTitle(normalized)) {
		return '';
	}

	const quotedMatch = normalized.match(/(?:《|“|")(.*?)(?:》|”|")/);
	if (quotedMatch?.[1]) {
		return normalizeWhitespace(quotedMatch[1]);
	}

	const cleaned = normalized
		.replace(/\s*[-|｜_]\s*微博.*$/i, '')
		.replace(/\s*-\s*Sina Visitor System$/i, '')
		.trim();

	return isGenericWeiboTitle(cleaned) ? '' : cleaned;
}

function normalizeWeiboProfileUrl(rawUrl: string, pageUrl: string): string {
	if (!rawUrl || rawUrl.startsWith('javascript:') || rawUrl.startsWith('#')) {
		return '';
	}

	try {
		const url = new URL(rawUrl, pageUrl);
		const hostname = url.hostname.toLowerCase();
		const path = url.pathname.replace(/\/+$/, '');

		if (!hostname.includes('weibo.com') && hostname !== 'm.weibo.cn' && hostname !== 'weibo.cn') {
			return '';
		}

		if (/^\/(status|detail)\//.test(path) || /^\/ttarticle\//.test(path)) {
			return '';
		}

		if (/^\/u\/\d+$/.test(path) || /^\/n\/[^/]+$/.test(path)) {
			return `https://weibo.com${path}`;
		}

		if (/^\/profile\/\d+$/.test(path)) {
			return `https://m.weibo.cn${path}`;
		}

		if (hostname.includes('weibo.com') && /^\/[^/]+$/.test(path)) {
			return `https://weibo.com${path}`;
		}

		if (hostname === 'm.weibo.cn' && /^\/[^/]+$/.test(path)) {
			return `https://m.weibo.cn${path}`;
		}
	} catch (error) {
		return '';
	}

	return '';
}

function scoreWeiboAuthorAnchor(anchor: Element): number {
	let score = 0;
	const href = anchor.getAttribute('href') || '';
	const className = (anchor.getAttribute('class') || '').toLowerCase();

	if (/\/(u\/\d+|n\/[^/?#]+|profile\/\d+)$/.test(href)) {
		score += 8;
	}

	if (anchor.closest('header, article, [class*="head"], [class*="user"], [class*="author"], [class*="profile"], [class*="info"]')) {
		score += 4;
	}

	if (className.includes('author') || className.includes('user') || className.includes('profile')) {
		score += 3;
	}

	if (href.includes('/status/') || href.includes('/detail/')) {
		score -= 6;
	}

	return score;
}

function shouldReplaceWeiboTitle(title: string): boolean {
	return !title || isGenericWeiboTitle(title);
}

function isGenericWeiboTitle(title: string): boolean {
	if (!title) {
		return true;
	}

	if (GENERIC_WEIBO_TITLES.has(title)) {
		return true;
	}

	return /^(微博正文)(\s*[-|｜_]\s*微博.*)?$/i.test(title);
}

function isGenericWeiboContentLine(line: string): boolean {
	return GENERIC_WEIBO_CONTENT_LINES.has(line);
}

function isWeiboUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname === 'weibo.com'
			|| hostname.endsWith('.weibo.com')
			|| hostname === 'm.weibo.cn'
			|| hostname === 'weibo.cn';
	} catch (error) {
		return false;
	}
}

function normalizeWhitespace(value: string | null | undefined): string {
	return (value || '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function stripLeadingAt(value: string): string {
	return value.replace(/^@+/, '').trim();
}

function isLikelyWeiboAuthorName(value: string): boolean {
	if (!value || value.length > 40) {
		return false;
	}

	return !/^(微博|全文|网页链接|赞|评论|转发|收藏|关注|超话|热搜)$/i.test(value);
}

function looksLikeUrl(value: string): boolean {
	return /^https?:\/\//i.test(value);
}

function decodeEscapedString(value: string): string {
	return value
		.replace(/\\"/g, '"')
		.replace(/\\\//g, '/')
		.replace(/\\u([\dA-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeWeiboPublished(value: string | null | undefined): string {
	const normalized = normalizeWhitespace(value)
		.replace(/\s*来自.*$/i, '')
		.replace(/\s*发布于.*$/i, '')
		.trim();

	if (!normalized || /^(公开|微博|全文|网页链接|已编辑)$/i.test(normalized)) {
		return '';
	}

	if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(normalized)) {
		return normalized;
	}

	if (/^\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(normalized)) {
		return `20${normalized}`;
	}

	if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
		return normalized;
	}

	const parsed = new Date(normalized);
	if (!Number.isNaN(parsed.getTime())) {
		const year = parsed.getFullYear();
		const month = `${parsed.getMonth() + 1}`.padStart(2, '0');
		const day = `${parsed.getDate()}`.padStart(2, '0');
		const hour = `${parsed.getHours()}`.padStart(2, '0');
		const minute = `${parsed.getMinutes()}`.padStart(2, '0');
		return `${year}-${month}-${day} ${hour}:${minute}`;
	}

	return '';
}
