export interface BilibiliContentResult {
	content: string;
	title?: string;
	author?: string;
	published?: string;
	domain?: string;
	wordCount?: number;
	parseTime?: number;
	site?: string;
	favicon?: string;
	image?: string;
	description?: string;
	language?: string;
	variables?: Record<string, string>;
}

interface BilibiliPage {
	cid?: number;
	page?: number;
	part?: string;
	duration?: number;
}

interface BilibiliViewData {
	aid?: number;
	bvid?: string;
	cid?: number;
	title?: string;
	desc?: string;
	pic?: string;
	pubdate?: number;
	owner?: {
		name?: string;
		face?: string;
	};
	pages?: BilibiliPage[];
}

interface BilibiliSubtitleTrack {
	lan?: string;
	lan_doc?: string;
	subtitle_url?: string;
}

interface BilibiliSubtitleItem {
	from: number;
	to?: number;
	content?: string;
}

interface BilibiliSubtitleData {
	lang?: string;
	body?: BilibiliSubtitleItem[];
}

interface BilibiliViewPoint {
	from?: number;
	to?: number;
	content?: string;
}

interface BilibiliChapter {
	start: number;
	title: string;
}

interface BilibiliPlayerInfo {
	subtitleTracks: BilibiliSubtitleTrack[];
	chapters: BilibiliChapter[];
}

interface TranscriptSegment {
	start: number;
	text: string;
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const BILIBILI_VIDEO_RE = /^\/video\/(BV[0-9A-Za-z]+|av\d+)/i;
const SENTENCE_END_RE = /[.!?。！？]["'”’）)]?$/;
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const MAX_GROUP_SECONDS = 18;
const MAX_GROUP_CHARS = 80;

export function isBilibiliVideoUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();
		const isBilibiliHost = hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com');
		return isBilibiliHost && BILIBILI_VIDEO_RE.test(parsed.pathname);
	} catch {
		return false;
	}
}

export async function extractBilibiliContent(
	doc: Document,
	fetcher: FetchLike = globalThis.fetch.bind(globalThis)
): Promise<BilibiliContentResult | null> {
	const started = Date.now();
	const url = doc.URL;
	if (!isBilibiliVideoUrl(url)) return null;

	const initialState = parseInlineAssignment(doc, 'window.__INITIAL_STATE__');
	const identifiers = getVideoIdentifiers(url, initialState);
	if (!identifiers.bvid && !identifiers.aid) return null;

	const viewData = await fetchViewData(fetcher, identifiers)
		.catch(() => null)
		|| getViewDataFromInitialState(initialState)
		|| {};

	const bvid = viewData.bvid || identifiers.bvid || '';
	const aid = viewData.aid ?? identifiers.aid;
	const pageNo = getPageNo(url, initialState);
	const page = selectPage(viewData, pageNo);
	const cid = page?.cid ?? viewData.cid ?? identifiers.cid;

	if (!bvid && !aid) return null;
	if (!cid) return null;

	const title = viewData.title || getMeta(doc, 'name', 'title') || doc.title.replace(/_哔哩哔哩_bilibili$/i, '').trim();
	const author = viewData.owner?.name || getMeta(doc, 'name', 'author');
	const description = viewData.desc || getMeta(doc, 'property', 'og:description') || '';
	const image = absolutizeUrl(viewData.pic || getMeta(doc, 'property', 'og:image') || '', url);
	const published = typeof viewData.pubdate === 'number'
		? new Date(viewData.pubdate * 1000).toISOString()
		: getMeta(doc, 'itemprop', 'datePublished') || getMeta(doc, 'itemprop', 'uploadDate');

	const playerInfo = await fetchPlayerInfo(fetcher, { aid, bvid, cid })
		.catch(() => ({ subtitleTracks: [], chapters: [] }));
	const chapters = mergeChapters(playerInfo.chapters, parseDescriptionChapters(description));
	const subtitle = await fetchSubtitle(fetcher, { aid, bvid, cid }, playerInfo.subtitleTracks)
		.catch(() => null);
	const transcript = subtitle ? buildTranscript(subtitle.body || [], chapters) : null;
	const chaptersHtml = !transcript && chapters.length > 0
		? buildChaptersHtml(chapters)
		: '';

	const contentParts = [
		buildPlayerIframe({ aid, bvid, cid, pageNo }),
		description ? `<p>${escapeHtml(description).replace(/\n/g, '<br>')}</p>` : '',
		transcript?.html || '',
		chaptersHtml,
	].filter(Boolean);

	const transcriptText = transcript?.text || '';
	const variables: Record<string, string> = {
		videoId: bvid || (aid ? `av${aid}` : ''),
		bvid,
		aid: aid ? String(aid) : '',
		cid: String(cid),
		author: author || '',
		title: title || '',
		site: 'Bilibili',
		image,
		published: published || '',
		description: description.slice(0, 200).trim(),
	};
	if (transcriptText) variables.transcript = transcriptText;
	if (subtitle?.languageCode) {
		variables.language = subtitle.languageCode;
	}

	const plainText = `${description}\n${transcriptText}`;
	return {
		content: contentParts.join('\n'),
		title,
		author,
		published,
		domain: getDomain(url),
		wordCount: countWords(plainText),
		parseTime: Date.now() - started,
		site: 'Bilibili',
		favicon: 'https://www.bilibili.com/favicon.ico',
		image,
		description,
		language: subtitle?.languageCode,
		variables,
	};
}

function getVideoIdentifiers(url: string, initialState: any): { bvid?: string; aid?: number; cid?: number } {
	const parsed = new URL(url);
	const pathMatch = parsed.pathname.match(BILIBILI_VIDEO_RE);
	const rawId = pathMatch?.[1] || '';
	const videoData = initialState?.videoData || {};
	const bvid = rawId.toLowerCase().startsWith('bv')
		? rawId
		: parsed.searchParams.get('bvid') || videoData.bvid || initialState?.bvid || undefined;
	const aid = rawId.toLowerCase().startsWith('av')
		? Number(rawId.slice(2))
		: numberFrom(parsed.searchParams.get('aid')) ?? numberFrom(videoData.aid) ?? numberFrom(initialState?.aid);
	const cid = numberFrom(parsed.searchParams.get('cid')) ?? numberFrom(videoData.cid) ?? numberFrom(initialState?.cid);
	return { bvid, aid, cid };
}

function getPageNo(url: string, initialState: any): number {
	try {
		const parsed = new URL(url);
		return numberFrom(parsed.searchParams.get('p')) || numberFrom(initialState?.p) || 1;
	} catch {
		return 1;
	}
}

function selectPage(viewData: BilibiliViewData, pageNo: number): BilibiliPage | undefined {
	const pages = Array.isArray(viewData.pages) ? viewData.pages : [];
	return pages.find(p => p.page === pageNo) || pages[Math.max(0, pageNo - 1)] || pages[0];
}

async function fetchViewData(
	fetcher: FetchLike,
	identifiers: { bvid?: string; aid?: number }
): Promise<BilibiliViewData | null> {
	const params = new URLSearchParams();
	if (identifiers.bvid) {
		params.set('bvid', identifiers.bvid);
	} else if (identifiers.aid) {
		params.set('aid', String(identifiers.aid));
	}
	if (!params.toString()) return null;

	const data = await fetchJson(fetcher, `https://api.bilibili.com/x/web-interface/view?${params.toString()}`);
	return data?.code === 0 && data?.data ? data.data as BilibiliViewData : null;
}

async function fetchSubtitle(
	fetcher: FetchLike,
	ids: { aid?: number; bvid?: string; cid: number },
	initialTracks: BilibiliSubtitleTrack[] = []
): Promise<{ body: BilibiliSubtitleItem[]; languageCode?: string } | null> {
	const tracks = initialTracks.length > 0 ? initialTracks : await fetchSubtitleTracks(fetcher, ids);
	const track = pickSubtitleTrack(tracks);
	if (!track?.subtitle_url) return null;

	const subtitleUrl = normalizeSubtitleUrl(track.subtitle_url);
	const data = await fetchJson(fetcher, subtitleUrl) as BilibiliSubtitleData;
	const body = Array.isArray(data?.body) ? data.body : [];
	if (body.length === 0) return null;
	return {
		body,
		languageCode: data.lang || track.lan,
	};
}

async function fetchPlayerInfo(
	fetcher: FetchLike,
	ids: { aid?: number; bvid?: string; cid: number }
): Promise<BilibiliPlayerInfo> {
	const idParam = getIdParam(ids);
	const urls = [
		`https://api.bilibili.com/x/player/wbi/v2?cid=${encodeURIComponent(String(ids.cid))}&${idParam}`,
		`https://api.bilibili.com/x/player/v2?cid=${encodeURIComponent(String(ids.cid))}&${idParam}`,
	];

	const fallback: BilibiliPlayerInfo = { subtitleTracks: [], chapters: [] };
	for (const url of urls) {
		const data = await fetchJson(fetcher, url).catch(() => null);
		if (!data) continue;
		const info = {
			subtitleTracks: getSubtitleTracks(data),
			chapters: getChapters(data),
		};
		if (info.subtitleTracks.length > 0 || info.chapters.length > 0) {
			return info;
		}
	}
	return fallback;
}

async function fetchSubtitleTracks(
	fetcher: FetchLike,
	ids: { aid?: number; bvid?: string; cid: number }
): Promise<BilibiliSubtitleTrack[]> {
	const playerInfo = await fetchPlayerInfo(fetcher, ids);
	let tracks = playerInfo.subtitleTracks;
	if (tracks.length > 0) return tracks;

	const idParam = getIdParam(ids);
	const dmUrl = `https://api.bilibili.com/x/v2/dm/view?${idParam}&oid=${encodeURIComponent(String(ids.cid))}&type=1`;
	const dmData = await fetchJson(fetcher, dmUrl).catch(() => null);
	tracks = getSubtitleTracks(dmData);
	return tracks;
}

function getIdParam(ids: { aid?: number; bvid?: string }): string {
	return ids.aid ? `aid=${encodeURIComponent(String(ids.aid))}` : `bvid=${encodeURIComponent(ids.bvid || '')}`;
}

function getSubtitleTracks(data: any): BilibiliSubtitleTrack[] {
	const tracks = data?.data?.subtitle?.subtitles;
	return Array.isArray(tracks) ? tracks.filter(track => !!track?.subtitle_url) : [];
}

function getChapters(data: any): BilibiliChapter[] {
	const points = data?.data?.view_points;
	if (!Array.isArray(points)) return [];
	return points
		.map((point: BilibiliViewPoint) => ({
			start: numberFrom(point.from) ?? 0,
			title: (point.content || '').trim(),
		}))
		.filter((chapter: BilibiliChapter) => chapter.title)
		.sort((a: BilibiliChapter, b: BilibiliChapter) => a.start - b.start);
}

function parseDescriptionChapters(description: string): BilibiliChapter[] {
	return description
		.split(/\r?\n/)
		.map(line => {
			const match = line.match(/^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+?)\s*$/);
			if (!match) return null;
			const start = parseTimestampText(match[1]);
			const title = match[2].trim();
			return start === null || !title ? null : { start, title };
		})
		.filter((chapter): chapter is BilibiliChapter => !!chapter)
		.sort((a, b) => a.start - b.start);
}

function parseTimestampText(timestamp: string): number | null {
	const parts = timestamp.split(':').map(Number);
	if (parts.some(Number.isNaN)) return null;
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return null;
}

function mergeChapters(primary: BilibiliChapter[], secondary: BilibiliChapter[]): BilibiliChapter[] {
	const merged = [...primary];
	for (const chapter of secondary) {
		const duplicate = merged.some(existing => Math.abs(existing.start - chapter.start) <= 3);
		if (!duplicate) merged.push(chapter);
	}
	return merged.sort((a, b) => a.start - b.start);
}

function pickSubtitleTrack(tracks: BilibiliSubtitleTrack[]): BilibiliSubtitleTrack | undefined {
	return tracks.find(track => /(^|\b)(zh|ai-zh|zh-CN|zh-Hans)(\b|$)/i.test(track.lan || ''))
		|| tracks.find(track => /中文/.test(track.lan_doc || ''))
		|| tracks[0];
}

async function fetchJson(fetcher: FetchLike, url: string): Promise<any> {
	const response = await fetcher(url, {
		credentials: 'include',
		headers: {
			'Accept': 'application/json, text/plain, */*',
		},
	});
	if (!response.ok) throw new Error(`Bilibili request failed: ${response.status}`);
	return response.json();
}

function buildPlayerIframe(ids: { aid?: number; bvid?: string; cid: number; pageNo: number }): string {
	const params = new URLSearchParams();
	if (ids.aid) params.set('aid', String(ids.aid));
	if (ids.bvid) params.set('bvid', ids.bvid);
	params.set('cid', String(ids.cid));
	params.set('page', String(ids.pageNo || 1));
	params.set('danmaku', '0');
	params.set('autoplay', '0');
	return `<iframe width="560" height="315" src="https://player.bilibili.com/player.html?${params.toString()}" title="Bilibili video player" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
}

function buildTranscript(items: BilibiliSubtitleItem[], chapters: BilibiliChapter[] = []): { html: string; text: string } | null {
	const segments = groupSubtitleItems(items);
	if (segments.length === 0) return null;

	const sortedChapters = [...chapters].sort((a, b) => a.start - b.start);
	let chapterIndex = 0;
	const htmlParts: string[] = [];
	const textParts: string[] = [];
	for (const segment of segments) {
		while (chapterIndex < sortedChapters.length && sortedChapters[chapterIndex].start <= segment.start) {
			const title = sortedChapters[chapterIndex].title;
			htmlParts.push(`<h3>${escapeHtml(title)}</h3>`);
			if (textParts.length > 0) textParts.push('');
			textParts.push(`### ${title}`);
			textParts.push('');
			chapterIndex++;
		}

		const timestamp = formatTimestamp(segment.start);
		const tsHtml = `<strong><span class="timestamp" data-timestamp="${segment.start}">${timestamp}</span></strong>`;
		htmlParts.push(`<p class="transcript-segment">${tsHtml} · ${escapeHtml(segment.text)}</p>`);
		textParts.push(`**${timestamp}** · ${segment.text}`);
	}

	return {
		html: `<div class="bilibili transcript">\n<h2>Transcript</h2>\n${htmlParts.join('\n')}\n</div>`,
		text: textParts.join('\n'),
	};
}

function buildChaptersHtml(chapters: BilibiliChapter[]): string {
	const parts = chapters.map(chapter => {
		const timestamp = formatTimestamp(chapter.start);
		return `<h3>${escapeHtml(chapter.title)}</h3>\n<p><strong><span class="timestamp" data-timestamp="${chapter.start}">${timestamp}</span></strong></p>`;
	});
	return `<div class="bilibili chapters">\n<h2>Chapters</h2>\n${parts.join('\n')}\n</div>`;
}

function groupSubtitleItems(items: BilibiliSubtitleItem[]): TranscriptSegment[] {
	const sorted = items
		.filter(item => typeof item.from === 'number' && (item.content || '').trim())
		.sort((a, b) => a.from - b.from);

	const groups: TranscriptSegment[] = [];
	let start = 0;
	let lastFrom = 0;
	let text = '';

	const flush = () => {
		const clean = text.trim();
		if (clean) groups.push({ start, text: clean });
		text = '';
	};

	for (const item of sorted) {
		const content = (item.content || '').trim();
		if (!content) continue;
		if (!text) {
			start = item.from;
			lastFrom = item.from;
			text = content;
			continue;
		}

		const duration = item.from - start;
		const gap = item.from - lastFrom;
		const shouldFlush = SENTENCE_END_RE.test(text)
			|| duration >= MAX_GROUP_SECONDS
			|| text.length + content.length >= MAX_GROUP_CHARS
			|| gap > 8;

		if (shouldFlush) {
			flush();
			start = item.from;
			text = content;
		} else {
			text = joinSubtitleText(text, content);
		}
		lastFrom = item.from;
	}
	flush();
	return groups;
}

function joinSubtitleText(left: string, right: string): string {
	if (/\s$/.test(left) || /^\s/.test(right)) {
		return left + right;
	}
	return `${left} ${right}`;
}

function formatTimestamp(seconds: number): string {
	const safe = Math.max(0, Math.floor(seconds));
	const h = Math.floor(safe / 3600);
	const m = Math.floor((safe % 3600) / 60);
	const s = safe % 60;
	if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	return `${m}:${String(s).padStart(2, '0')}`;
}

function parseInlineAssignment(doc: Document, marker: string): any {
	const scripts = Array.from(doc.querySelectorAll('script'));
	for (const script of scripts) {
		const text = script.textContent || '';
		const markerIndex = text.indexOf(marker);
		if (markerIndex < 0) continue;
		const equalIndex = text.indexOf('=', markerIndex + marker.length);
		if (equalIndex < 0) continue;
		const jsonText = extractBalancedObject(text, equalIndex + 1);
		if (!jsonText) continue;
		try {
			return JSON.parse(jsonText);
		} catch {
			return null;
		}
	}
	return null;
}

function extractBalancedObject(text: string, from: number): string | null {
	const start = text.indexOf('{', from);
	if (start < 0) return null;

	let depth = 0;
	let inString = false;
	let quote = '';
	let escaped = false;

	for (let i = start; i < text.length; i++) {
		const char = text[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === quote) {
				inString = false;
			}
			continue;
		}

		if (char === '"' || char === "'") {
			inString = true;
			quote = char;
			continue;
		}
		if (char === '{') depth++;
		if (char === '}') {
			depth--;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return null;
}

function getViewDataFromInitialState(initialState: any): BilibiliViewData | null {
	return initialState?.videoData || null;
}

function getMeta(doc: Document, attr: string, value: string): string {
	return doc.querySelector(`meta[${attr}="${cssEscape(value)}"]`)?.getAttribute('content') || '';
}

function cssEscape(value: string): string {
	return value.replace(/["\\]/g, '\\$&');
}

function normalizeSubtitleUrl(url: string): string {
	if (url.startsWith('//')) return `https:${url}`;
	return url.replace(/^http:\/\//i, 'https://');
}

function absolutizeUrl(value: string, baseUrl: string): string {
	if (!value) return '';
	try {
		return new URL(value, baseUrl).href;
	} catch {
		return value;
	}
}

function getDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

function numberFrom(value: unknown): number | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	const n = Number(value);
	return Number.isFinite(n) ? n : undefined;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function countWords(text: string): number {
	const cjkCount = (text.match(new RegExp(CJK_RE.source, 'g')) || []).length;
	const latinText = text.replace(new RegExp(CJK_RE.source, 'g'), ' ').trim();
	const latinCount = latinText ? latinText.split(/\s+/).filter(Boolean).length : 0;
	return cjkCount + latinCount;
}
