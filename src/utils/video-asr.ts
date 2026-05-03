export type VideoAsrPlatform = 'douyin' | 'youtube' | 'bilibili';

export interface VideoAsrTarget {
	platform: VideoAsrPlatform;
	url: string;
	requiresShareText: boolean;
}

export interface VideoAsrVariableUpdate {
	variables: Record<string, string>;
	updatedContent: boolean;
}

export interface VideoAsrResultMetadata {
	title?: string;
	author?: string;
	description?: string;
	published?: string;
	tags?: string;
	sourceUrl?: string;
	platform?: VideoAsrPlatform;
}

const TRANSCRIPT_HEADING = '## Transcript';
const DEFAULT_DOUYIN_TITLE = '抖音视频';
const DEFAULT_VIDEO_TAGS = 'text, clippings';

export function getVideoAsrTarget(url: string): VideoAsrTarget | null {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname.toLowerCase();

		if (host === 'douyin.com' || host.endsWith('.douyin.com')) {
			return {
				platform: 'douyin',
				url,
				requiresShareText: true,
			};
		}

		if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') {
			return { platform: 'youtube', url, requiresShareText: false };
		}

		if (host === 'bilibili.com' || host.endsWith('.bilibili.com')) {
			return { platform: 'bilibili', url, requiresShareText: false };
		}
	} catch {}

	return null;
}

export function hasTranscriptVariable(variables: Record<string, string>): boolean {
	return Boolean((variables['{{transcript}}'] || '').trim());
}

export function applyVideoAsrTranscript(
	variables: Record<string, string>,
	transcriptText: string,
	metadata: VideoAsrResultMetadata = {}
): VideoAsrVariableUpdate {
	const text = transcriptText.trim();
	const next: Record<string, string> = { ...variables, '{{transcript}}': text };
	let updatedContent = false;
	const isDouyin = metadata.platform === 'douyin' || next['{{domain}}'] === 'douyin.com';

	if (metadata.title) {
		next['{{title}}'] = metadata.title.trim();
		next['{{noteName}}'] = metadata.title.trim();
	} else if (isDouyin) {
		next['{{title}}'] = (next['{{title}}'] || DEFAULT_DOUYIN_TITLE).trim();
		next['{{noteName}}'] = (next['{{noteName}}'] || next['{{title}}'] || DEFAULT_DOUYIN_TITLE).trim();
	}
	if (metadata.author) {
		next['{{author}}'] = metadata.author.trim();
	}
	if (metadata.description) {
		next['{{description}}'] = metadata.description.trim();
	}
	if (metadata.published) {
		next['{{published}}'] = formatDouyinPublished(metadata.published);
	}
	next['{{tags}}'] = mergeTags(metadata.tags || next['{{tags}}'] || '', isDouyin ? DEFAULT_VIDEO_TAGS : 'clippings');
	if (metadata.sourceUrl) {
		next['{{url}}'] = metadata.sourceUrl.trim();
	}

	if (text) {
		if (metadata.platform === 'douyin') {
			next['{{content}}'] = buildDouyinContent(metadata.sourceUrl || next['{{url}}'] || '', text);
			updatedContent = true;
		} else {
			const content = next['{{content}}'] || '';
			if (!content.includes(text) && !content.includes(TRANSCRIPT_HEADING)) {
				next['{{content}}'] = `${content.trim()}\n\n${TRANSCRIPT_HEADING}\n\n${text}`.trim();
				updatedContent = true;
			}
		}
	}

	return { variables: next, updatedContent };
}

export function buildEmptyDouyinVariables(url: string): Record<string, string> {
	const timestamp = new Date().toISOString();
	return {
		'{{author}}': '',
		'{{content}}': '',
		'{{contentHtml}}': '',
		'{{selection}}': '',
		'{{selectionHtml}}': '',
		'{{date}}': timestamp,
		'{{time}}': timestamp,
		'{{description}}': '',
		'{{domain}}': 'douyin.com',
		'{{favicon}}': '',
		'{{fullHtml}}': '',
		'{{highlights}}': '',
		'{{image}}': '',
		'{{noteName}}': DEFAULT_DOUYIN_TITLE,
		'{{published}}': '',
		'{{site}}': '抖音',
		'{{title}}': DEFAULT_DOUYIN_TITLE,
		'{{url}}': url,
		'{{language}}': '',
		'{{words}}': '0',
		'{{tags}}': DEFAULT_VIDEO_TAGS,
		'{{transcript}}': '',
	};
}

function buildDouyinContent(sourceUrl: string, transcriptText: string): string {
	const source = sourceUrl.trim();
	const link = source ? `> 📝 原文链接: [在抖音打开](${source})\n\n` : '';
	return `${link}${TRANSCRIPT_HEADING}\n\n${transcriptText}`.trim();
}

function formatDouyinPublished(value: string): string {
	const trimmed = value.trim();
	if (/^\d+$/.test(trimmed)) {
		return new Date(Number(trimmed) * 1000).toISOString();
	}
	return trimmed;
}

function mergeTags(tags: string, fallback: string): string {
	const items = tags
		.split(',')
		.map(tag => tag.trim().replace(/^#/, ''))
		.filter(Boolean);
	if (fallback) {
		items.push(...fallback.split(',').map(tag => tag.trim()).filter(Boolean));
	}
	return [...new Set(items)].join(', ');
}
