import { describe, expect, test, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { extractBilibiliContent, isBilibiliVideoUrl } from './bilibili';

function jsonResponse(data: unknown): Response {
	return new Response(JSON.stringify(data), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

describe('Bilibili extractor', () => {
	test('detects Bilibili video URLs', () => {
		expect(isBilibiliVideoUrl('https://www.bilibili.com/video/BV1soizB5Eog')).toBe(true);
		expect(isBilibiliVideoUrl('https://www.bilibili.com/video/av12345')).toBe(true);
		expect(isBilibiliVideoUrl('https://www.bilibili.com/read/cv12345')).toBe(false);
		expect(isBilibiliVideoUrl('https://evilbilibili.com/video/BV1soizB5Eog')).toBe(false);
	});

	test('builds reader content with iframe and transcript', async () => {
		const { document } = parseHTML(`
			<!doctype html>
			<html>
				<head><title>Fallback title</title></head>
				<body><script>window.__INITIAL_STATE__={"p":1};</script></body>
			</html>
		`);
		Object.defineProperty(document, 'URL', {
			value: 'https://www.bilibili.com/video/BVabc123?p=1',
			configurable: true,
		});

		const fetcher = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/x/web-interface/view')) {
				return jsonResponse({
					code: 0,
					data: {
						aid: 123,
						bvid: 'BVabc123',
						cid: 456,
						title: 'A Bilibili Video',
						desc: 'Video description\n0:12 Description chapter',
						pic: 'https://example.com/cover.jpg',
						pubdate: 1704067200,
						owner: { name: 'Creator' },
						pages: [{ cid: 456, page: 1, part: 'Part 1', duration: 30 }],
					},
				});
			}
			if (url.includes('/x/player/wbi/v2')) {
				return jsonResponse({
					code: 0,
					data: {
						subtitle: { subtitles: [] },
						view_points: [
							{ from: 0, to: 5, content: 'Opening' },
							{ from: 5, to: 10, content: 'Second chapter' },
						],
					},
				});
			}
			if (url.includes('/x/player/v2')) {
				return jsonResponse({
					code: 0,
					data: { subtitle: { subtitles: [] } },
				});
			}
			if (url.includes('/x/v2/dm/view')) {
				return jsonResponse({
					code: 0,
					data: {
						subtitle: {
							subtitles: [{
								lan: 'ai-zh',
								lan_doc: '中文（自动生成）',
								subtitle_url: 'http://aisubtitle.hdslb.com/subtitle.json',
							}],
						},
					},
				});
			}
			if (url.includes('aisubtitle.hdslb.com')) {
				return jsonResponse({
					lang: 'zh',
					body: [
						{ from: 0, to: 1, content: '你好' },
						{ from: 1, to: 2, content: '世界。' },
						{ from: 5, to: 6, content: '第二句。' },
						{ from: 12, to: 13, content: '第三句' },
					],
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const result = await extractBilibiliContent(document as unknown as Document, fetcher);

		expect(result?.title).toBe('A Bilibili Video');
		expect(result?.author).toBe('Creator');
		expect(result?.content).toContain('https://player.bilibili.com/player.html?');
		expect(result?.content).toContain('class="bilibili transcript"');
		expect(result?.content).toContain('<h3>Opening</h3>');
		expect(result?.content).toContain('<h3>Second chapter</h3>');
		expect(result?.content).toContain('<h3>Description chapter</h3>');
		expect(result?.content).toContain('data-timestamp="0"');
		expect(result?.variables?.transcript).toContain('### Opening');
		expect(result?.variables?.transcript).toContain('**0:00** · 你好 世界。');
		expect(result?.variables?.language).toBe('zh');
	});
});
