import { describe, expect, test } from 'vitest';
import { parseHTML } from 'linkedom';
import {
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

	test('uses chapterInfo.list as subtitle fallback when full subtitles are unavailable', () => {
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
		expect(result?.subtitleLang).toBe('章节摘要');
		expect(result?.transcriptText).toContain('自我介绍：小龙虾自我介绍');
		expect(result?.transcriptHtml).toContain('data-timestamp="10"');

		expect(result?.content).toContain('<a href="https://www.douyin.com/video/7615143235619800697">在抖音打开视频</a>');
		expect(result?.content).toContain('<h2>简介</h2>');
		expect(result?.content).toContain('<h2>字幕</h2>');
		expect(result?.content).toContain('<h3>自我介绍</h3>');
		expect(result?.content).toContain('<code>00:10</code> 小龙虾自我介绍');
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
	});
});
