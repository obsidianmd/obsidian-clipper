import browser from './browser-polyfill';

interface DouyinChapter {
	title: string;
	detail: string;
	startTime: number;
	endTime: number;
}

interface DouyinSubtitleSegment {
	content: string;
	from: number;
	to: number;
}

interface DouyinVideoInfo {
	awemeId: string;
	title: string;
	author: string;
	description: string;
	summary: string;
	uploadDate: string;
	publishTime: string;
	coverUrl: string;
	videoUrl: string;
	duration: number;
	chapters: DouyinChapter[];
	subtitleSegments: DouyinSubtitleSegment[];
	subtitleLang: string;
}

export interface DouyinTranscriptResult {
	content: string;
	transcriptHtml: string;
	transcriptText: string;
	embedHtml: string;
	awemeId: string;
	title: string;
	author: string;
	description: string;
	uploadDate: string;
	publishTime: string;
	subtitleLang: string;
	coverUrl: string;
	videoUrl: string;
}

interface FetchProxyResponse {
	ok?: boolean;
	status?: number;
	text?: string;
	error?: string;
}

export function isDouyinUrl(url: string): boolean {
	try {
		const hostname = new URL(url).hostname;
		return hostname === 'douyin.com' || hostname.endsWith('.douyin.com');
	} catch {
		return false;
	}
}

export function extractAwemeId(url: string): string {
	try {
		const parsed = new URL(url);

		const videoMatch = parsed.pathname.match(/\/video\/(\d+)/);
		if (videoMatch?.[1]) return videoMatch[1];

		const modalId = parsed.searchParams.get('modal_id');
		if (modalId && /^\d+$/.test(modalId)) return modalId;

		const awemeId = parsed.searchParams.get('aweme_id');
		if (awemeId && /^\d+$/.test(awemeId)) return awemeId;
	} catch {}

	const match = url.match(/(?:\/video\/|modal_id=|aweme_id=)(\d+)/);
	return match?.[1] || '';
}

function formatDouyinTimestamp(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const secs = totalSeconds % 60;

	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function parseJsonText(text: string): any {
	const raw = text.trim();
	if (!raw) return null;

	try {
		return JSON.parse(raw);
	} catch {}

	try {
		return JSON.parse(decodeURIComponent(raw));
	} catch {}

	return null;
}

function parsePageData(doc: Document): any {
	const renderDataEl = doc.getElementById('RENDER_DATA');
	if (renderDataEl?.textContent) {
		const data = parseJsonText(renderDataEl.textContent);
		if (data) return data;
	}

	const universalDataEl = doc.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
	if (universalDataEl?.textContent) {
		const data = parseJsonText(universalDataEl.textContent);
		if (data) return data.__DEFAULT_SCOPE__ || data;
	}

	if (typeof window !== 'undefined') {
		const win = window as any;
		return win.__RENDER_DATA__ || win._ROUTER_DATA || win.__INITIAL_STATE__ || null;
	}

	return null;
}

function getNestedValue(obj: any, path: string): any {
	const keys = path.split('.');
	let current = obj;
	for (const key of keys) {
		if (current == null || typeof current !== 'object') return null;
		const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);
		if (arrayMatch) {
			current = current[arrayMatch[1]];
			if (!Array.isArray(current)) return null;
			current = current[Number(arrayMatch[2])];
		} else {
			current = current[key];
		}
	}
	return current;
}

function findVideoDetail(data: any, expectedAwemeId: string): any {
	if (!data || typeof data !== 'object') return null;

	const paths = [
		'app.videoDetail',
		'webapp.video-detail.itemInfo.itemStruct',
		'video_(id)/page.videoInfoRes.item_list[0]',
	];

	for (const path of paths) {
		const value = getNestedValue(data, path);
		if (isVideoDetail(value, expectedAwemeId)) return value;
	}

	return findVideoDetailRecursive(data, expectedAwemeId, 7);
}

function isVideoDetail(value: any, expectedAwemeId: string): boolean {
	if (!value || typeof value !== 'object') return false;
	const awemeId = String(value.aweme_id || value.awemeId || value.groupId || '');
	if (expectedAwemeId && awemeId !== expectedAwemeId) return false;
	return Boolean(awemeId && (value.video || value.desc || value.caption));
}

function findVideoDetailRecursive(obj: any, expectedAwemeId: string, maxDepth: number): any {
	if (!obj || typeof obj !== 'object' || maxDepth <= 0) return null;
	if (isVideoDetail(obj, expectedAwemeId)) return obj;

	for (const value of Object.values(obj)) {
		const found = findVideoDetailRecursive(value, expectedAwemeId, maxDepth - 1);
		if (found) return found;
	}
	return null;
}

function firstString(...values: any[]): string {
	for (const value of values) {
		if (typeof value === 'string' && value.trim()) return value.trim();
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	}
	return '';
}

function firstUrl(...values: any[]): string {
	for (const value of values) {
		if (!value) continue;
		if (typeof value === 'string' && /^https?:\/\//.test(value)) return value;
		if (Array.isArray(value)) {
			const found = firstUrl(...value);
			if (found) return found;
		}
		if (typeof value === 'object') {
			const found = firstUrl(
				value.src,
				value.url,
				value.Url,
				value.url_list,
				value.urlList,
				value.urlList_0
			);
			if (found) return found;
		}
	}
	return '';
}

function extractVideoInfo(data: any, url: string): DouyinVideoInfo | null {
	const expectedAwemeId = extractAwemeId(url);
	const detail = findVideoDetail(data, expectedAwemeId);
	if (!detail) return null;

	const awemeId = String(detail.aweme_id || detail.awemeId || detail.groupId || expectedAwemeId || '');
	if (!awemeId) return null;

	const description = firstString(detail.desc, detail.caption, detail.description);
	const chapterInfo = detail.chapterInfo || detail.chapter_info || {};
	const summary = firstString(chapterInfo.chapterAbstract, detail.chapterAbstract, detail.summary);
	const title = firstString(detail.itemTitle, detail.title, description).slice(0, 100);
	const createTime = Number(detail.createTime || detail.create_time || detail.createTimestamp || 0);
	const uploadDate = createTime > 0 ? new Date(createTime * 1000).toISOString().slice(0, 10) : '';
	const publishTime = createTime > 0 ? new Date(createTime * 1000).toISOString().replace('T', ' ').slice(0, 19) : '';
	const duration = Number(detail.video?.duration || detail.duration || 0);
	const subtitleSegments = extractSubtitleSegments(detail);

	return {
		awemeId,
		title,
		author: firstString(
			detail.authorInfo?.nickname,
			detail.author?.nickname,
			detail.author?.unique_id,
			detail.authorName
		),
		description,
		summary,
		uploadDate,
		publishTime,
		coverUrl: firstUrl(
			detail.video?.cover,
			detail.video?.coverUrlList,
			detail.video?.cover_url_list,
			detail.video?.originCover,
			detail.video?.originCoverUrlList,
			detail.video?.dynamicCover,
			detail.cover
		),
		videoUrl: firstUrl(
			detail.video?.playAddr,
			detail.video?.play_addr,
			detail.video?.playApi,
			detail.video?.downloadAddr
		),
		duration,
		chapters: extractChapters(detail, duration),
		subtitleSegments,
		subtitleLang: subtitleSegments.length > 0 ? '中文 [AI]' : '章节摘要',
	};
}

function extractChapters(detail: any, duration: number): DouyinChapter[] {
	const chapterInfo = detail.chapterInfo || detail.chapter_info;
	const source = Array.isArray(chapterInfo)
		? chapterInfo
		: Array.isArray(chapterInfo?.list)
			? chapterInfo.list
			: [];

	const chapters = source
		.map((item: any) => ({
			title: firstString(item.desc, item.title, item.chapterTitle, item.chapter_title),
			detail: firstString(item.detail, item.description, item.summary),
			startTime: Number(item.timestamp ?? item.startTime ?? item.start_time ?? item.start ?? 0),
			endTime: Number(item.endTime ?? item.end_time ?? item.end ?? 0),
		}))
		.filter((chapter: DouyinChapter) => chapter.title && Number.isFinite(chapter.startTime) && chapter.startTime >= 0)
		.sort((a: DouyinChapter, b: DouyinChapter) => a.startTime - b.startTime);

	for (let i = 0; i < chapters.length; i++) {
		if (chapters[i].endTime > chapters[i].startTime) continue;
		chapters[i].endTime = chapters[i + 1]?.startTime || duration || chapters[i].startTime;
	}

	return chapters;
}

function extractSubtitleSegments(detail: any): DouyinSubtitleSegment[] {
	const sources = [
		detail.subtitle,
		detail.subtitles,
		detail.video?.subtitle,
		detail.video?.subtitles,
		detail.video?.subtitleInfos,
		detail.video?.captionInfos,
		detail.video?.cla_info?.caption_infos,
		detail.video?.claInfo?.captionInfos,
		detail.auto_video_caption_info?.auto_captions,
		detail.autoVideoCaptionInfo?.autoCaptions,
	];

	for (const source of sources) {
		const segments = normalizeSubtitleSource(source);
		if (segments.length > 0) return segments;
	}

	return findSubtitleSegmentsRecursive(detail, 5);
}

function findSubtitleSegmentsRecursive(obj: any, maxDepth: number): DouyinSubtitleSegment[] {
	if (!obj || typeof obj !== 'object' || maxDepth <= 0) return [];

	const direct = normalizeSubtitleSource(obj);
	if (direct.length > 0) return direct;

	for (const value of Object.values(obj)) {
		const found = findSubtitleSegmentsRecursive(value, maxDepth - 1);
		if (found.length > 0) return found;
	}
	return [];
}

function normalizeSubtitleSource(source: any): DouyinSubtitleSegment[] {
	if (!source) return [];

	if (Array.isArray(source)) {
		const direct = normalizeSubtitleArray(source);
		if (direct.length > 0) return direct;

		for (const item of source) {
			const nested = normalizeSubtitleSource(item);
			if (nested.length > 0) return nested;
		}
	}

	if (typeof source === 'object') {
		for (const key of ['utterances', 'segments', 'subtitles', 'captions', 'captionList', 'list', 'body']) {
			const nested = normalizeSubtitleSource(source[key]);
			if (nested.length > 0) return nested;
		}
	}

	return [];
}

function normalizeSubtitleArray(items: any[]): DouyinSubtitleSegment[] {
	const segments = items
		.map(item => {
			if (!item || typeof item !== 'object') return null;
			const content = firstString(item.content, item.text, item.Text, item.words, item.sentence, item.utterance);
			const from = Number(item.from ?? item.start ?? item.startTime ?? item.start_time ?? item.time ?? item.timestamp);
			const to = Number(item.to ?? item.end ?? item.endTime ?? item.end_time ?? item.endTimestamp ?? from);
			if (!content || !Number.isFinite(from)) return null;
			return { content, from, to: Number.isFinite(to) ? to : from };
		})
		.filter((item): item is DouyinSubtitleSegment => Boolean(item));

	return segments.sort((a, b) => a.from - b.from);
}

function buildDouyinContent(info: DouyinVideoInfo): string {
	const parts: string[] = [];

	parts.push(buildEmbedHtml(info));

	const intro: string[] = [];
	if (info.description) intro.push(info.description);
	if (info.summary && info.summary !== info.description) intro.push(info.summary);
	if (intro.length > 0) {
		parts.push(`<h2>简介</h2>${intro.map(textToParagraphHtml).join('')}`);
	}

	const transcriptBody = info.subtitleSegments.length > 0
		? buildMarkdownTranscriptHtml(info.subtitleSegments, info.chapters)
		: buildChapterTranscriptHtml(info.chapters);
	if (transcriptBody) {
		parts.push(`<h2>字幕</h2>${transcriptBody}`);
	}

	return parts.join('');
}

function textToParagraphHtml(text: string): string {
	return text
		.split(/\n{2,}/)
		.map(paragraph => paragraph.trim())
		.filter(Boolean)
		.map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
		.join('');
}

function buildMarkdownTranscriptHtml(
	segments: DouyinSubtitleSegment[],
	chapters: DouyinChapter[]
): string {
	const subtitleItems = segments
		.map((segment, index) => ({
			...segment,
			index,
			content: segment.content.trim(),
		}))
		.filter(item => item.content);

	if (!subtitleItems.length) return '';

	if (!chapters.length) {
		return `<p>${subtitleItems.map(formatMarkdownTranscriptLine).join('<br>')}</p>`;
	}

	const parts: string[] = [];
	const usedIndexes = new Set<number>();
	chapters.forEach((chapter, index) => {
		const next = chapters[index + 1];
		const end = next?.startTime && next.startTime > chapter.startTime
			? next.startTime
			: chapter.endTime > chapter.startTime
				? chapter.endTime
				: Infinity;
		const sectionItems = subtitleItems.filter(item => item.from + 0.001 >= chapter.startTime && item.from < end);
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

function formatMarkdownTranscriptLine(segment: DouyinSubtitleSegment): string {
	return `<code>${formatDouyinTimestamp(segment.from)}</code> ${escapeHtml(segment.content.trim())}`;
}

function buildChapterTranscriptHtml(chapters: DouyinChapter[]): string {
	if (!chapters.length) return '';

	return chapters.map(chapter => {
		const detail = chapter.detail ? `<p><code>${formatDouyinTimestamp(chapter.startTime)}</code> ${escapeHtml(chapter.detail)}</p>` : '';
		return `<h3>${escapeHtml(chapter.title)}</h3>${detail}`;
	}).join('');
}

function buildTranscriptHtml(segments: DouyinSubtitleSegment[]): string {
	if (!segments.length) return '';

	const lines = segments.map(segment => {
		const text = segment.content.trim();
		if (!text) return '';
		const seconds = Math.floor(segment.from / 1000);
		return `<div class="transcript-segment"><strong class="timestamp" data-timestamp="${seconds}">${formatDouyinTimestamp(segment.from)}</strong> ${escapeHtml(text)}</div>`;
	}).filter(Boolean);

	return `<div class="youtube transcript">${lines.join('')}</div>`;
}

function buildChapterReaderTranscriptHtml(chapters: DouyinChapter[]): string {
	if (!chapters.length) return '';

	const lines = chapters.map(chapter => {
		const text = [chapter.title, chapter.detail].filter(Boolean).join('：');
		if (!text) return '';
		const seconds = Math.floor(chapter.startTime / 1000);
		return `<div class="transcript-segment"><strong class="timestamp" data-timestamp="${seconds}">${formatDouyinTimestamp(chapter.startTime)}</strong> ${escapeHtml(text)}</div>`;
	}).filter(Boolean);

	return lines.length > 0 ? `<div class="youtube transcript">${lines.join('')}</div>` : '';
}

function buildTranscriptText(info: DouyinVideoInfo): string {
	if (info.subtitleSegments.length > 0) {
		return info.subtitleSegments
			.map(segment => segment.content.trim())
			.filter(Boolean)
			.join('\n');
	}

	return info.chapters
		.map(chapter => [chapter.title, chapter.detail].filter(Boolean).join('：'))
		.filter(Boolean)
		.join('\n');
}

function buildEmbedHtml(info: DouyinVideoInfo): string {
	const link = `https://www.douyin.com/video/${encodeURIComponent(info.awemeId)}`;
	const parts = [`<p><a href="${link}">在抖音打开视频</a></p>`];

	if (info.videoUrl) {
		parts.push(`<video controls src="${escapeHtml(info.videoUrl)}"${info.coverUrl ? ` poster="${escapeHtml(info.coverUrl)}"` : ''} style="width:100%;max-height:70vh;"></video>`);
	} else if (info.coverUrl) {
		parts.push(`<a href="${link}"><img src="${escapeHtml(info.coverUrl)}" alt="${escapeHtml(info.title || '抖音视频')}" /></a>`);
	}

	return parts.join('');
}

export function parseDouyinTranscriptFromDocument(doc: Document, url: string): DouyinTranscriptResult | null {
	const pageData = parsePageData(doc);
	return parseDouyinTranscriptFromData(pageData, url);
}

function parseDouyinTranscriptFromData(pageData: any, url: string): DouyinTranscriptResult | null {
	if (!pageData) return null;

	const info = extractVideoInfo(pageData, url);
	if (!info) return null;

	return {
		content: buildDouyinContent(info),
		transcriptHtml: buildTranscriptHtml(info.subtitleSegments) || buildChapterReaderTranscriptHtml(info.chapters),
		transcriptText: buildTranscriptText(info),
		embedHtml: buildEmbedHtml(info),
		awemeId: info.awemeId,
		title: info.title,
		author: info.author,
		description: info.description,
		uploadDate: info.uploadDate,
		publishTime: info.publishTime,
		subtitleLang: info.subtitleLang,
		coverUrl: info.coverUrl,
		videoUrl: info.videoUrl,
	};
}

function parseDouyinTranscriptFromHtml(html: string, url: string): DouyinTranscriptResult | null {
	if (!html) return null;

	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');
	return parseDouyinTranscriptFromDocument(doc, url);
}

async function fetchDouyinPageData(awemeId: string): Promise<any> {
	const response: FetchProxyResponse = await browser.runtime.sendMessage({
		action: 'fetchProxy',
		url: `https://www.douyin.com/video/${encodeURIComponent(awemeId)}`,
		options: {
			credentials: 'include',
			cache: 'no-store',
			referrer: 'https://www.douyin.com/',
			referrerPolicy: 'strict-origin-when-cross-origin',
			headers: {
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
				'Cache-Control': 'no-cache',
				'Pragma': 'no-cache',
				'Referer': 'https://www.douyin.com/',
			},
		},
	});

	if (!response?.ok || !response.text) return null;
	return parseDouyinTranscriptFromHtml(response.text, `https://www.douyin.com/video/${awemeId}`);
}

export async function fetchDouyinTranscript(url: string): Promise<DouyinTranscriptResult | null> {
	const awemeId = extractAwemeId(url);
	if (!awemeId || typeof document === 'undefined') return null;
	const currentPageResult = parseDouyinTranscriptFromDocument(document, url);
	if (currentPageResult) return currentPageResult;
	return fetchDouyinPageData(awemeId);
}
