import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import {
	buildDouyinUnavailableResult,
	extractAwemeId,
	parseDouyinTranscriptFromDocument,
} from './douyin';

const DOUYIN_URL = 'https://www.douyin.com/jingxuan?modal_id=7615143235619800697';

function buildDocument(videoDetail: any): Document {
	const payload = encodeURIComponent(JSON.stringify({ app: { videoDetail } }));
	const { document } = parseHTML(`<html><body><script id="RENDER_DATA" type="application/json">${payload}</script></body></html>`);
	return document as unknown as Document;
}

describe('Douyin transcript extraction', () => {
	test('extracts aweme id from common Douyin URLs', () => {
		expect(extractAwemeId(DOUYIN_URL)).toBe('7615143235619800697');
		expect(extractAwemeId('https://www.douyin.com/video/7615143235619800697')).toBe('7615143235619800697');
		expect(extractAwemeId('https://www.douyin.com/share/video/7615143235619800697')).toBe('7615143235619800697');
	});

	test('keeps chapters separate and reports missing transcript when full subtitles are unavailable', () => {
		const result = parseDouyinTranscriptFromDocument(buildDocument({
			awemeId: '7615143235619800697',
			desc: '小米龙虾首发上手体验，手机内置贾维斯的时代可能真快来了！',
			authorInfo: { nickname: '张大头同学' },
			createTime: 1773038701,
			video: {
				duration: 255100,
				cover: 'https://example.com/cover.jpg',
				playAddr: { src: 'https://example.com/video.mp4' },
			},
			chapterInfo: {
				status: true,
				chapterAbstract: '小米龙虾智能体 miclaw 的上手体验分享。',
				list: [
					{ timestamp: 0, desc: '引言', detail: '' },
					{ timestamp: 10000, desc: '自我介绍', detail: '小龙虾自我介绍，有记忆，回答简洁明了。' },
					{ timestamp: 36000, desc: '能力展示', detail: '展示整理短信、创建日程、推荐外卖等功能。' },
				],
			},
		}), DOUYIN_URL);

		expect(result).not.toBeNull();
		expect(result?.author).toBe('张大头同学');
		expect(result?.videoUrl).toBe('https://example.com/video.mp4');
		expect(result?.subtitleLang).toBe('');
		expect(result?.transcriptText).toBe('未获取到逐句字幕');
		expect(result?.transcriptHtml).toContain('未获取到逐句字幕');

		expect(result?.content).toContain('<a href="https://www.douyin.com/video/7615143235619800697">在抖音打开视频</a>');
		expect(result?.content).toContain('<video controls src="https://example.com/video.mp4"');
		expect(result?.content).not.toContain('<img');
		expect(result?.content).toContain('<h2>简介</h2>');
		expect(result?.content).toContain('小米龙虾智能体 miclaw 的上手体验分享。');
		expect(result?.content).toContain('<h2>Transcript</h2>');
		expect(result?.content).toContain('未获取到逐句字幕');
		expect(result?.content).toContain('<h2>章节</h2>');
		expect(result?.content).toContain('<h3>自我介绍</h3>');
		expect(result?.content).toContain('小龙虾自我介绍，有记忆，回答简洁明了。');
	});

	test('does not pick the first search result when modal_id points to another video', () => {
		const { document } = parseHTML(`<html><body><script id="RENDER_DATA" type="application/json">${encodeURIComponent(JSON.stringify({
			app: {
				searchData: {
					items: [{
						awemeId: '1111111111111111111',
						desc: '搜索页第一个结果，不应该被保存',
						video: { duration: 1000 },
						chapterInfo: { list: [{ timestamp: 0, desc: '错误结果', detail: '这不是弹窗视频。' }] },
					}],
				},
			},
		}))}</script></body></html>`);

		const result = parseDouyinTranscriptFromDocument(
			document as unknown as Document,
			'https://www.douyin.com/jingxuan/search/github?modal_id=7630065336796089650&type=general'
		);

		expect(result).toBeNull();
	});

	test('prefers embedded subtitle segments when present', () => {
		const result = parseDouyinTranscriptFromDocument(buildDocument({
			awemeId: '7615143235619800697',
			desc: '带字幕的视频',
			video: {
				duration: 12000,
				subtitleInfos: [{
					utterances: [
						{ start: 1000, end: 2800, text: '第一句字幕' },
						{ start: 3000, end: 4200, text: '第二句字幕' },
					],
				}],
			},
			chapterInfo: {
				list: [{ timestamp: 0, desc: '开场', detail: '章节摘要不应替代真实字幕。' }],
			},
		}), DOUYIN_URL);

		expect(result?.subtitleLang).toBe('中文 [AI]');
		expect(result?.transcriptText).toBe('第一句字幕\n第二句字幕');
		expect(result?.content).toContain('<code>00:01</code> 第一句字幕');
		expect(result?.transcriptHtml).toContain('data-timestamp="1"');
		expect(result?.content).toContain('<h2>章节</h2>');
		expect(result?.content).toContain('章节摘要不应替代真实字幕。');
	});

	test('does not output cover images when video url is unavailable', () => {
		const result = parseDouyinTranscriptFromDocument(buildDocument({
			awemeId: '7615143235619800697',
			desc: '只有封面，没有视频直链',
			video: {
				duration: 12000,
				cover: 'https://example.com/cover.jpg',
			},
			subtitles: [
				{ start: 1000, end: 2000, text: '真实字幕' },
			],
		}), DOUYIN_URL);

		expect(result?.videoUrl).toBe('');
		expect(result?.content).toContain('在抖音打开视频');
		expect(result?.content).not.toContain('<img');
		expect(result?.content).not.toContain('cover.jpg');
	});

	test('unavailable fallback does not include unrelated page content or screenshots', () => {
		const result = buildDouyinUnavailableResult('https://www.douyin.com/user/self?showTab=like');

		expect(result.content).toContain('未能获取当前抖音视频信息。');
		expect(result.content).toContain('未获取到逐句字幕');
		expect(result.content).not.toContain('我的喜欢');
		expect(result.content).not.toContain('默认收藏列表');
		expect(result.content).not.toContain('<img');
		expect(result.coverUrl).toBe('');
	});
});
