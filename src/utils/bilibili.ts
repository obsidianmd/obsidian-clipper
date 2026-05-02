import browser from './browser-polyfill';

interface BilibiliSubtitleTrack {
	id: string;
	lan: string;
	lanDoc: string;
	subtitleUrl: string;
	source?: string;
}

interface BilibiliVideoPage {
	cid: string;
	page: number;
	part: string;
	duration: number;
}

interface BilibiliChapter {
	title: string;
	from: number;
	to: number;
}

interface BilibiliVideoInfo {
	aid: string;
	bvid: string;
	cid: string;
	title: string;
	author: string;
	description: string;
	uploadDate: string;
	duration: number;
	page: number;
	subtitles: BilibiliSubtitleTrack[];
	chapters: BilibiliChapter[];
}

export interface BilibiliTranscriptSegment {
	content: string;
	from: number;
	to: number;
}

export interface BilibiliTranscriptResult {
	content: string;
	transcriptHtml: string;
	transcriptText: string;
	embedHtml: string;
	aid: string;
	bvid: string;
	cid: string;
	title: string;
	author: string;
	description: string;
	uploadDate: string;
	subtitleLang: string;
}

export function isBilibiliUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname;
		return hostname.includes('bilibili.com');
	} catch {
		return false;
	}
}

export function extractBvid(url: string): string {
	const match = url.match(/\/video\/(BV[0-9A-Za-z]+)/);
	if (match?.[1]) return match[1];

	try {
		const parsed = new URL(url);
		const fromQuery = String(parsed.searchParams.get('bvid') || '').trim();
		if (/^BV[0-9A-Za-z]+$/.test(fromQuery)) return fromQuery;
	} catch {}

	return '';
}

function extractPageIndex(url: string): number {
	try {
		const page = Number(new URL(url).searchParams.get('p') || '1');
		return Number.isFinite(page) && page > 0 ? page : 1;
	} catch {
		return 1;
	}
}

export function formatBiliTimestamp(seconds: number): string {
	const totalSeconds = Math.floor(seconds);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const secs = totalSeconds % 60;

	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function buildBilibiliEmbedHtml(aid: string, bvid: string, cid: string, page: number): string {
	const safeAid = encodeURIComponent(aid);
	const safeBvid = encodeURIComponent(bvid);
	const safeCid = encodeURIComponent(cid);
	const safePage = page > 0 ? page : 1;
	return `<iframe src="https://player.bilibili.com/player.html?aid=${safeAid}&bvid=${safeBvid}&cid=${safeCid}&page=${safePage}&autoplay=0" scrolling="no" border="0" frameborder="no" framespacing="0" allow="fullscreen; picture-in-picture" allowfullscreen="true" style="height:100%;width:100%; aspect-ratio: 16 / 9;"> </iframe>`;
}

function buildBilibiliContent(info: BilibiliVideoInfo, segments: BilibiliTranscriptSegment[]): string {
	const parts: string[] = [];

	parts.push(buildBilibiliEmbedHtml(info.aid, info.bvid, info.cid, info.page));

	if (info.description?.trim()) {
		parts.push(`<h2>简介</h2>${textToParagraphHtml(info.description.trim())}`);
	}

	if (info.chapters.length > 0) {
		parts.push(`<h2>章节</h2>${buildChapterListHtml(info.chapters)}`);
	}

	if (segments.length > 0) {
		parts.push(`<h2>字幕</h2>${buildMarkdownTranscriptHtml(segments, info.chapters)}`);
	}

	return parts.join('');
}

function buildChapterListHtml(chapters: BilibiliChapter[]): string {
	const items = chapters.map(chapter =>
		`<li><code>${formatBiliTimestamp(chapter.from)}</code> ${escapeHtml(chapter.title)}</li>`
	);
	return `<ul>${items.join('')}</ul>`;
}

function buildMarkdownTranscriptHtml(
	segments: BilibiliTranscriptSegment[],
	chapters: BilibiliChapter[]
): string {
	const subtitleItems = segments
		.map((segment, index) => ({
			...segment,
			index,
			content: segment.content.trim(),
		}))
		.filter(item => item.content);

	if (!subtitleItems.length) return '';

	const chapterItems = normalizeChapters(chapters);
	if (!chapterItems.length) {
		return `<p>${subtitleItems.map(formatMarkdownTranscriptLine).join('<br>')}</p>`;
	}

	const parts: string[] = [];
	const usedIndexes = new Set<number>();
	chapterItems.forEach((chapter, index) => {
		const next = chapterItems[index + 1];
		const end = next?.from && next.from > chapter.from
			? next.from
			: chapter.to > chapter.from
				? chapter.to
				: Infinity;
		const sectionItems = subtitleItems.filter(item => item.from + 0.001 >= chapter.from && item.from < end);
		if (!sectionItems.length) return;

		parts.push(`<h3>${escapeHtml(chapter.title)}</h3>`);
		parts.push(`<p>${sectionItems.map(item => {
			usedIndexes.add(item.index);
			return formatMarkdownTranscriptLine(item);
		}).join('<br>')}</p>`);
	});

	const remaining = subtitleItems.filter(item => !usedIndexes.has(item.index));
	if (remaining.length > 0) {
		parts.push('<h3>其他片段</h3>');
		parts.push(`<p>${remaining.map(formatMarkdownTranscriptLine).join('<br>')}</p>`);
	}

	return parts.length > 0 ? parts.join('') : `<p>${subtitleItems.map(formatMarkdownTranscriptLine).join('<br>')}</p>`;
}

function formatMarkdownTranscriptLine(segment: BilibiliTranscriptSegment): string {
	return `<code>${formatBiliTimestamp(segment.from)}</code> ${escapeHtml(segment.content.trim())}`;
}

function buildTranscriptHtml(segments: BilibiliTranscriptSegment[]): string {
	if (!segments.length) return '';

	const lines = segments.map(seg => {
		const text = seg.content.trim();
		if (!text) return '';
		const timestamp = formatBiliTimestamp(seg.from);
		return `<div class="transcript-segment"><strong class="timestamp" data-timestamp="${seg.from}">${timestamp}</strong> ${escapeHtml(text)}</div>`;
	}).filter(Boolean);

	return `<div class="youtube transcript">${lines.join('')}</div>`;
}

function textToParagraphHtml(text: string): string {
	return text
		.split(/\n{2,}/)
		.map(paragraph => paragraph.trim())
		.filter(Boolean)
		.map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
		.join('');
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

async function fetchJsonViaBackground(url: string): Promise<any> {
	const response: { ok?: boolean; status?: number; text?: string; error?: string } = await browser.runtime.sendMessage({
		action: 'fetchProxy',
		url,
		options: {
			credentials: 'include',
			cache: 'no-store',
			referrer: 'https://www.bilibili.com/',
			referrerPolicy: 'strict-origin-when-cross-origin',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache',
				'Referer': 'https://www.bilibili.com/',
				'Origin': 'https://www.bilibili.com',
			},
		},
	});

	if (!response?.ok) {
		throw new Error(`Bilibili API request failed: ${response?.status || response?.error || 'unknown'}`);
	}

	return JSON.parse(response.text || '{}');
}

async function fetchBilibiliVideoInfo(bvid: string, pageUrl: string): Promise<BilibiliVideoInfo> {
	const metaUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
	const metaPayload = await fetchJsonViaBackground(metaUrl);

	if (metaPayload.code !== 0) {
		throw new Error(`Bilibili meta API error: ${metaPayload.message || metaPayload.code}`);
	}

	const data = metaPayload.data || {};
	const pubdate = Number(data.pubdate || 0);
	const uploadDate = pubdate > 0 ? new Date(pubdate * 1000).toISOString().slice(0, 10) : '';
	const aid = String(data.aid || '');
	const page = extractPageIndex(pageUrl);
	const pages = normalizePages(data.pages);
	const selectedPage = pickPage(pages, page);
	const cid = selectedPage?.cid || String(data.cid || '');
	const duration = selectedPage?.duration || Number(data.duration || 0);

	const subtitleBundle = await fetchSubtitleBundle(bvid, cid, aid);

	return {
		aid,
		bvid,
		cid,
		title: String(data.title || ''),
		author: String(data.owner?.name || ''),
		description: String(data.desc || ''),
		uploadDate,
		duration,
		page,
		subtitles: subtitleBundle.tracks,
		chapters: subtitleBundle.chapters,
	};
}

function normalizePages(rawPages: any): BilibiliVideoPage[] {
	if (!Array.isArray(rawPages)) return [];

	return rawPages.map((item: any) => ({
		cid: String(item?.cid || ''),
		page: Number(item?.page || 0) || 0,
		part: String(item?.part || '').trim(),
		duration: Number(item?.duration || 0) || 0,
	})).filter(page => page.cid);
}

function pickPage(pages: BilibiliVideoPage[], pageIndex: number): BilibiliVideoPage | null {
	const safePageIndex = pageIndex > 0 ? pageIndex : 1;
	return pages[safePageIndex - 1]
		|| pages.find(page => page.page === safePageIndex)
		|| pages[0]
		|| null;
}

async function fetchSubtitleBundle(
	bvid: string,
	cid: string,
	aid: string
): Promise<{ tracks: BilibiliSubtitleTrack[]; chapters: BilibiliChapter[] }> {
	const requests = buildSubtitleInfoRequests(bvid, cid, aid);
	let fallbackError: unknown = null;

	for (const request of requests) {
		try {
			const payload = await fetchJsonViaBackground(request.url);
			if (payload.code !== 0) {
				throw new Error(`Bilibili subtitle API error: ${payload.message || payload.code}`);
			}

			const chapters = mapChaptersFromPlayerData(payload.data);
			const tracks = mapSubtitleTracks(payload.data?.subtitle?.subtitles || [], request.source);
			return { tracks: tracks.filter(track => track.subtitleUrl), chapters };
		} catch (error) {
			fallbackError = error;
		}
	}

	if (fallbackError) {
		throw fallbackError;
	}
	return { tracks: [], chapters: [] };
}

function buildSubtitleInfoRequests(bvid: string, cid: string, aid: string): Array<{ source: string; url: string }> {
	const safeBvid = encodeURIComponent(bvid);
	const safeCid = encodeURIComponent(cid);
	const safeAid = encodeURIComponent(aid);
	const requests: Array<{ source: string; url: string }> = [];

	if (aid) {
		requests.push({
			source: 'player-wbi-v2',
			url: `https://api.bilibili.com/x/player/wbi/v2?aid=${safeAid}&cid=${safeCid}&bvid=${safeBvid}`,
		});
	}

	requests.push({
		source: 'player-v2',
		url: `https://api.bilibili.com/x/player/v2?bvid=${safeBvid}&cid=${safeCid}${aid ? `&aid=${safeAid}` : ''}`,
	});

	return requests;
}

function mapSubtitleTracks(subtitles: any[], source: string): BilibiliSubtitleTrack[] {
	return subtitles.map((item: any) => ({
		id: String(item?.id ?? ''),
		lan: String(item?.lan || ''),
		lanDoc: String(item?.lan_doc || ''),
		subtitleUrl: normalizeSubtitleUrl(String(item?.subtitle_url || '')),
		source,
	}));
}

function mapChaptersFromPlayerData(data: any): BilibiliChapter[] {
	const raw = Array.isArray(data?.view_points) ? data.view_points : [];
	return normalizeChapters(raw.map((item: any) => ({
		title: String(item?.content || item?.title || item?.label || '').trim(),
		from: normalizeChapterTime(item?.from ?? item?.start ?? item?.start_time),
		to: normalizeChapterTime(item?.to ?? item?.end ?? item?.end_time),
	})));
}

function normalizeChapterTime(value: unknown): number {
	if (value === undefined || value === null || value === '') return 0;

	const num = Number(value);
	if (!Number.isFinite(num) || num < 0) return 0;
	return num > 60 * 60 * 24 ? num / 1000 : num;
}

function normalizeChapters(chapters: BilibiliChapter[]): BilibiliChapter[] {
	const normalized = chapters
		.map(chapter => ({
			title: String(chapter.title || '').trim(),
			from: Number(chapter.from || 0) || 0,
			to: Number(chapter.to || 0) || 0,
		}))
		.filter(chapter => chapter.title && chapter.from >= 0)
		.sort((a, b) => a.from - b.from);
	const unique: BilibiliChapter[] = [];
	const seen = new Set<string>();

	for (const chapter of normalized) {
		const key = `${Math.floor(chapter.from * 10)}|${chapter.title.toLowerCase()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(chapter);
	}

	return unique;
}

function normalizeSubtitleUrl(url: string): string {
	if (!url) return '';
	if (url.startsWith('//')) return `https:${url}`;
	if (url.startsWith('http://') || url.startsWith('https://')) return url;
	return `https://${url.replace(/^\/+/, '')}`;
}

function subtitlePriority(track: BilibiliSubtitleTrack): number {
	const lan = (track.lan || '').toLowerCase();
	const label = (track.lanDoc || '').toLowerCase();

	if (lan === 'zh-cn' || lan === 'zh-hans' || lan === 'ai-zh') return 0;
	if (lan === 'zh') return 1;
	if (lan.includes('zh')) return 2;
	if (label.includes('中文')) return 3;

	if (lan === 'en' || lan === 'en-us' || lan === 'en-gb') return 10;
	if (lan.includes('en')) return 11;
	if (label.includes('英文') || label.includes('英语') || label.includes('english')) return 12;

	return 50;
}

function sortedSubtitleTracks(subtitles: BilibiliSubtitleTrack[]): BilibiliSubtitleTrack[] {
	return [...subtitles].sort((a, b) => subtitlePriority(a) - subtitlePriority(b));
}

function validateSubtitleByDuration(segments: BilibiliTranscriptSegment[], videoDuration: number): boolean {
	if (!segments.length) return false;
	if (!(videoDuration > 0)) return true;

	let maxTo = 0;
	for (const seg of segments) {
		if (seg.to > maxTo) maxTo = seg.to;
		if (seg.from > maxTo) maxTo = seg.from;
	}

	const upperTolerance = Math.max(12, videoDuration * 0.15);
	if (maxTo > videoDuration + upperTolerance) return false;

	let minCoverageRatio = 0;
	if (videoDuration >= 600) minCoverageRatio = 0.18;
	else if (videoDuration >= 300) minCoverageRatio = 0.22;
	else if (videoDuration >= 180) minCoverageRatio = 0.25;

	if (minCoverageRatio > 0 && maxTo < videoDuration * minCoverageRatio) return false;

	return true;
}

function getVideoDurationFromDom(): number {
	try {
		const video = document.querySelector('video');
		const d = Number(video?.duration);
		return Number.isFinite(d) && d > 0 ? d : 0;
	} catch {
		return 0;
	}
}

async function fetchValidatedTranscript(
	tracks: BilibiliSubtitleTrack[],
	videoDuration: number
): Promise<{ segments: BilibiliTranscriptSegment[]; track: BilibiliSubtitleTrack | null }> {
	const candidates = sortedSubtitleTracks(tracks);
	for (const track of candidates) {
		try {
			const segments = await fetchBilibiliSubtitleText(track.subtitleUrl);
			if (segments.length > 0 && validateSubtitleByDuration(segments, videoDuration)) {
				return { segments, track };
			}
		} catch {
			// Try next track
		}
	}
	// If nothing validated, try first track without validation as last resort
	if (candidates.length > 0) {
		try {
			const segments = await fetchBilibiliSubtitleText(candidates[0].subtitleUrl);
			return { segments, track: candidates[0] };
		} catch {}
	}
	return { segments: [], track: null };
}

async function fetchBilibiliSubtitleText(url: string): Promise<BilibiliTranscriptSegment[]> {
	const data = await fetchJsonViaBackground(url);

	if (!Array.isArray(data)) {
		if (data?.body && Array.isArray(data.body)) {
			return data.body.map((item: any) => ({
				content: String(item.content || ''),
				from: Number(item.from || 0),
				to: Number(item.to || 0),
			}));
		}
		return [];
	}

	return data.map((item: any) => ({
		content: String(item.content || ''),
		from: Number(item.from || 0),
		to: Number(item.to || 0),
	}));
}

export async function fetchBilibiliTranscript(url: string): Promise<BilibiliTranscriptResult | null> {
	const bvid = extractBvid(url);
	if (!bvid) return null;

	const info = await fetchBilibiliVideoInfo(bvid, url);

	const videoDuration = info.duration || getVideoDurationFromDom();
	const { segments, track } = await fetchValidatedTranscript(info.subtitles, videoDuration);

	const transcriptText = segments.map(s => s.content.trim()).filter(Boolean).join('\n');
	const transcriptHtml = buildTranscriptHtml(segments);
	const content = buildBilibiliContent(info, segments);
	const embedHtml = buildBilibiliEmbedHtml(info.aid, info.bvid, info.cid, info.page);

	return {
		content,
		transcriptHtml,
		transcriptText,
		embedHtml,
		aid: info.aid,
		bvid: info.bvid,
		cid: info.cid,
		title: info.title,
		author: info.author,
		description: info.description,
		uploadDate: info.uploadDate,
		subtitleLang: track?.lanDoc || track?.lan || '',
	};
}

export async function fetchBilibiliTranscriptHtml(url: string): Promise<string> {
	const bvid = extractBvid(url);
	if (!bvid) return '';

	const info = await fetchBilibiliVideoInfo(bvid, url);
	if (!info.subtitles.length) return '';

	const videoDuration = info.duration || getVideoDurationFromDom();
	const { segments } = await fetchValidatedTranscript(info.subtitles, videoDuration);
	return buildTranscriptHtml(segments);
}
