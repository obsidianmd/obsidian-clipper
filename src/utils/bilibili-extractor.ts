import browser from './browser-polyfill';

export interface BilibiliParsedUrl {
	bvid: string | null;
	aid: number | null;
	page: number;
	hasExplicitPageParam: boolean;
}

export interface BilibiliChapter {
	title: string;
	from: number;
	to?: number;
}

export interface BilibiliTranscriptCue {
	from: number;
	to: number;
	content: string;
}

export interface BilibiliResolvedPage {
	cid: number;
	page: number;
	part: string;
	duration: number;
}

export interface BilibiliStructuredContent {
	title: string;
	author: string;
	description: string;
	published: string;
	image: string;
	bvid: string;
	aid: number | null;
	cid: number;
	page: number;
	chapters: BilibiliChapter[];
	transcript: BilibiliTranscriptCue[];
	transcriptText: string;
	transcriptMarkdown: string;
	chaptersMarkdown: string;
	structuredHtml: string;
	wordCount: number;
}

interface BilibiliViewPage {
	page?: number;
	cid?: number;
	duration?: number;
	part?: string;
}

interface BilibiliViewData {
	aid?: number;
	bvid?: string;
	title?: string;
	desc?: string;
	pubdate?: number;
	pic?: string;
	owner?: {
		name?: string;
	};
	cid?: number;
	duration?: number;
	pages?: BilibiliViewPage[];
}

interface BilibiliSubtitleTrack {
	id?: number;
	lan?: string;
	lan_doc?: string;
	subtitle_url?: string;
	is_ai_subtitle?: boolean;
}

interface BilibiliPlayerData {
	subtitle?: {
		subtitles?: BilibiliSubtitleTrack[];
	};
	view_points?: Array<{
		content?: string;
		from?: number;
		to?: number;
	}>;
}

interface BilibiliSubtitleResponse {
	body?: Array<{
		from?: number;
		to?: number;
		content?: string;
	}>;
}

/**
 * 判断 URL 是否为 B 站视频页。
 */
export function isBilibiliVideoUrl(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.hostname.includes('bilibili.com')
			&& /^\/video\/(BV[\w]+|av\d+)/i.test(parsedUrl.pathname);
	} catch {
		return false;
	}
}

/**
 * 解析 B 站视频 URL 中的 bvid/aid 与分 P。
 */
export function parseBilibiliUrl(url: string): BilibiliParsedUrl {
	try {
		const parsedUrl = new URL(url);
		const match = parsedUrl.pathname.match(/^\/video\/(BV[\w]+|av\d+)/i);
		const rawVideoId = match?.[1] || '';
		const pageParam = parsedUrl.searchParams.get('p');
		const page = Number.parseInt(pageParam || '1', 10);
		return {
			bvid: /^BV/i.test(rawVideoId) ? rawVideoId : null,
			aid: /^av/i.test(rawVideoId) ? Number.parseInt(rawVideoId.slice(2), 10) : null,
			page: Number.isFinite(page) && page > 0 ? page : 1,
			hasExplicitPageParam: parsedUrl.searchParams.has('p')
		};
	} catch {
		return {
			bvid: null,
			aid: null,
			page: 1,
			hasExplicitPageParam: false
		};
	}
}

/**
 * 从 view 接口数据中解析当前分 P 的 cid。
 */
export function resolveBilibiliPage(viewData: BilibiliViewData, page: number): BilibiliResolvedPage | null {
	const pages = Array.isArray(viewData.pages) ? viewData.pages : [];
	const matchedPage = pages.find((item) => item.page === page) || pages[page - 1];
	const cid = matchedPage?.cid ?? viewData.cid;
	if (!cid) {
		return null;
	}

	return {
		cid,
		page: matchedPage?.page ?? page,
		part: matchedPage?.part || '',
		duration: matchedPage?.duration ?? viewData.duration ?? 0
	};
}

/**
 * 规范化字幕 URL，处理协议相对地址。
 */
export function normalizeBilibiliSubtitleUrl(url: string): string {
	if (!url) return '';
	if (url.startsWith('//')) {
		return `https:${url}`;
	}
	return url;
}

/**
 * 将秒数格式化为 `mm:ss` 或 `hh:mm:ss`。
 */
export function formatBilibiliTimestamp(seconds: number): string {
	const totalSeconds = Math.max(0, Math.floor(seconds));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const secs = totalSeconds % 60;

	if (hours > 0) {
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
	}
	return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 生成章节 Markdown。
 */
export function buildBilibiliChaptersMarkdown(chapters: BilibiliChapter[]): string {
	return chapters
		.map((chapter) => `- \`${formatBilibiliTimestamp(chapter.from)}\` ${chapter.title}`)
		.join('\n');
}

/**
 * 将字幕按章节分组后输出 Markdown。
 */
export function buildBilibiliTranscriptMarkdown(
	transcript: BilibiliTranscriptCue[],
	chapters: BilibiliChapter[]
): string {
	if (!transcript.length) return '';

	return groupTranscriptByChapters(transcript, chapters)
		.map((group) => {
			const heading = group.title ? `### ${group.title}\n\n` : '';
			const lines = group.lines
				.map((cue) => `- \`${formatBilibiliTimestamp(cue.from)}\` ${cue.content}`)
				.join('\n');
			return `${heading}${lines}`.trim();
		})
		.join('\n\n');
}

/**
 * 构建 B 站结构化 HTML，避免混入推荐区和评论区等无关元素。
 */
export function buildBilibiliStructuredHtml(input: {
	description: string;
	chapters: BilibiliChapter[];
	transcript: BilibiliTranscriptCue[];
}): string {
	const sections: string[] = ['<section class="bilibili-structured-content">'];

	if (input.description.trim()) {
		sections.push('<section class="bilibili-section bilibili-description">');
		sections.push('<h2>简介</h2>');
		sections.push(`<p>${escapeHtml(input.description.trim())}</p>`);
		sections.push('</section>');
	}

	if (input.chapters.length) {
		sections.push('<section class="bilibili-section bilibili-chapters">');
		sections.push('<h2>章节</h2>');
		sections.push('<ol>');
		input.chapters.forEach((chapter) => {
			sections.push(
				`<li><span class="bilibili-timestamp" data-time="${Math.floor(chapter.from)}">${formatBilibiliTimestamp(chapter.from)}</span><span class="bilibili-chapter-title">${escapeHtml(chapter.title)}</span></li>`
			);
		});
		sections.push('</ol>');
		sections.push('</section>');
	}

	if (input.transcript.length) {
		sections.push('<section class="bilibili-section bilibili-transcript">');
		sections.push('<h2>字幕</h2>');

		const groupedTranscript = groupTranscriptByChapters(input.transcript, input.chapters);
		groupedTranscript.forEach((group) => {
			if (group.title) {
				sections.push(`<h3>${escapeHtml(group.title)}</h3>`);
			}
			sections.push('<ul>');
			group.lines.forEach((cue) => {
				sections.push(
					`<li><span class="bilibili-timestamp" data-time="${Math.floor(cue.from)}">${formatBilibiliTimestamp(cue.from)}</span><span class="bilibili-transcript-text">${escapeHtml(cue.content)}</span></li>`
				);
			});
			sections.push('</ul>');
		});

		sections.push('</section>');
	}

	sections.push('</section>');
	return sections.join('');
}

/**
 * 从当前文档提取 B 站结构化内容。
 */
export async function extractBilibiliStructuredContent(doc: Document): Promise<BilibiliStructuredContent | null> {
	if (!isBilibiliVideoUrl(doc.URL)) {
		return null;
	}

	const parsedUrl = parseBilibiliUrl(doc.URL);
	if (!parsedUrl.bvid && !parsedUrl.aid) {
		return null;
	}

	const viewUrl = new URL('https://api.bilibili.com/x/web-interface/view');
	if (parsedUrl.bvid) {
		viewUrl.searchParams.set('bvid', parsedUrl.bvid);
	}
	if (parsedUrl.aid) {
		viewUrl.searchParams.set('aid', String(parsedUrl.aid));
	}

	const viewResponse = await fetchBilibiliJson(viewUrl.toString());
	const viewData = viewResponse?.data as BilibiliViewData | undefined;
	if (!viewData) {
		return null;
	}

	const resolvedPage = resolveBilibiliPage(viewData, parsedUrl.page);
	if (!resolvedPage) {
		return null;
	}

	const playerData = await fetchBilibiliPlayerData({
		aid: viewData.aid ?? parsedUrl.aid,
		bvid: viewData.bvid ?? parsedUrl.bvid,
		cid: resolvedPage.cid
	});

	const chapters = normalizeBilibiliChapters(playerData?.view_points || []);
	const selectedTrack = selectBilibiliSubtitleTrack(playerData?.subtitle?.subtitles || []);
	const subtitleData = selectedTrack?.subtitle_url
		? await fetchBilibiliJson(normalizeBilibiliSubtitleUrl(selectedTrack.subtitle_url)) as BilibiliSubtitleResponse
		: null;
	const transcript = normalizeBilibiliTranscript(subtitleData?.body || []);
	const transcriptText = transcript.map((cue) => cue.content).join('\n');
	const transcriptMarkdown = buildBilibiliTranscriptMarkdown(transcript, chapters);
	const chaptersMarkdown = buildBilibiliChaptersMarkdown(chapters);
	const description = viewData.desc || readMetaContent(doc, 'meta[name="description"]') || '';
	const title = viewData.title || readMetaContent(doc, 'meta[property="og:title"]') || doc.title || '';
	const image = viewData.pic || readMetaContent(doc, 'meta[property="og:image"]') || '';
	const author = viewData.owner?.name
		|| readTextContent(doc, '.up-name')
		|| readTextContent(doc, '[data-user-name]')
		|| '';
	const published = viewData.pubdate ? new Date(viewData.pubdate * 1000).toISOString() : '';
	const structuredHtml = buildBilibiliStructuredHtml({
		description,
		chapters,
		transcript
	});
	const wordCount = `${description}\n${transcriptText}`.trim().split(/\s+/).filter(Boolean).length;

	return {
		title,
		author,
		description,
		published,
		image,
		bvid: viewData.bvid || parsedUrl.bvid || '',
		aid: viewData.aid ?? parsedUrl.aid,
		cid: resolvedPage.cid,
		page: resolvedPage.page,
		chapters,
		transcript,
		transcriptText,
		transcriptMarkdown,
		chaptersMarkdown,
		structuredHtml,
		wordCount
	};
}

/**
 * 通过 background 代理抓取 B 站 JSON，避免内容脚本直接跨域请求失败。
 */
async function fetchBilibiliJson(url: string): Promise<any> {
	const response = await browser.runtime.sendMessage({
		action: 'fetchBilibiliJson',
		url
	}) as { success?: boolean; data?: any; error?: string };

	if (!response?.success) {
		throw new Error(response?.error || 'Failed to fetch Bilibili data');
	}

	return response.data;
}

/**
 * 拉取播放器接口数据，并兼容新旧接口回退。
 */
async function fetchBilibiliPlayerData(input: {
	aid: number | null | undefined;
	bvid: string | null | undefined;
	cid: number;
}): Promise<BilibiliPlayerData | null> {
	const urls: string[] = [];

	if (input.aid && input.bvid) {
		const wbiUrl = new URL('https://api.bilibili.com/x/player/wbi/v2');
		wbiUrl.searchParams.set('aid', String(input.aid));
		wbiUrl.searchParams.set('bvid', input.bvid);
		wbiUrl.searchParams.set('cid', String(input.cid));
		urls.push(wbiUrl.toString());
	}

	const v2Url = new URL('https://api.bilibili.com/x/player/v2');
	v2Url.searchParams.set('cid', String(input.cid));
	if (input.bvid) {
		v2Url.searchParams.set('bvid', input.bvid);
	}
	if (input.aid) {
		v2Url.searchParams.set('aid', String(input.aid));
	}
	urls.push(v2Url.toString());

	for (const url of urls) {
		try {
			const data = await fetchBilibiliJson(url);
			if (data?.data) {
				return data.data as BilibiliPlayerData;
			}
		} catch {
			// Try next endpoint.
		}
	}

	return null;
}

/**
 * 章节数据标准化。
 */
function normalizeBilibiliChapters(viewPoints: Array<{ content?: string; from?: number; to?: number }>): BilibiliChapter[] {
	return viewPoints
		.filter((item) => typeof item.content === 'string' && typeof item.from === 'number')
		.map((item) => ({
			title: item.content!.trim(),
			from: item.from!,
			to: item.to
		}))
		.filter((item) => item.title.length > 0);
}

/**
 * 字幕数据标准化。
 */
function normalizeBilibiliTranscript(body: Array<{ from?: number; to?: number; content?: string }>): BilibiliTranscriptCue[] {
	return body
		.filter((item) => typeof item.from === 'number' && typeof item.to === 'number' && typeof item.content === 'string')
		.map((item) => ({
			from: item.from!,
			to: item.to!,
			content: item.content!.replace(/\s+/g, ' ').trim()
		}))
		.filter((item) => item.content.length > 0);
}

/**
 * 根据语言优先级选择最合适的字幕轨。
 */
function selectBilibiliSubtitleTrack(tracks: BilibiliSubtitleTrack[]): BilibiliSubtitleTrack | null {
	if (!tracks.length) return null;

	const scoreTrack = (track: BilibiliSubtitleTrack): number => {
		const language = `${track.lan || ''} ${track.lan_doc || ''}`.toLowerCase();
		if (language.includes('zh-cn') || language.includes('中文') || language.includes('汉语')) return 5;
		if (language.includes('zh-hans') || language.includes('简体')) return 4;
		if (language.includes('zh')) return 3;
		if (language.includes('en') || language.includes('english')) return 2;
		return 1;
	};

	return [...tracks]
		.sort((left, right) => scoreTrack(right) - scoreTrack(left))[0] || null;
}

function groupTranscriptByChapters(
	transcript: BilibiliTranscriptCue[],
	chapters: BilibiliChapter[]
): Array<{ title?: string; lines: BilibiliTranscriptCue[] }> {
	if (!chapters.length) {
		return [{ lines: transcript }];
	}

	const groups = chapters.map((chapter) => ({
		title: chapter.title,
		lines: transcript.filter((cue) => cue.from >= chapter.from && cue.from < (chapter.to ?? Number.POSITIVE_INFINITY))
	})).filter((group) => group.lines.length > 0);

	const groupedLines = new Set(groups.flatMap((group) => group.lines));
	const leftovers = transcript.filter((cue) => !groupedLines.has(cue));
	if (leftovers.length) {
		groups.push({
			title: '其他片段',
			lines: leftovers
		});
	}

	return groups;
}

function readMetaContent(doc: Document, selector: string): string {
	const element = doc.querySelector(selector) as HTMLMetaElement | null;
	return element?.content?.trim() || '';
}

function readTextContent(doc: Document, selector: string): string {
	return doc.querySelector(selector)?.textContent?.trim() || '';
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
