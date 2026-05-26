import { describe, expect, test } from 'vitest';
import {
	applyVideoAsrTranscript,
	buildEmptyDouyinVariables,
	getVideoAsrTarget,
	hasTranscriptVariable,
} from './video-asr';

describe('video ASR helpers', () => {
	test('detects supported video platforms', () => {
		expect(getVideoAsrTarget('https://www.douyin.com/?recommend=1')).toMatchObject({
			platform: 'douyin',
			requiresShareText: true,
		});
		expect(getVideoAsrTarget('https://www.douyin.com/video/123456')).toMatchObject({
			platform: 'douyin',
			requiresShareText: true,
		});
		expect(getVideoAsrTarget('https://v.douyin.com/abc/')).toMatchObject({
			platform: 'douyin',
			requiresShareText: true,
		});
		expect(getVideoAsrTarget('https://www.youtube.com/watch?v=abc')).toMatchObject({
			platform: 'youtube',
			requiresShareText: false,
		});
		expect(getVideoAsrTarget('https://www.bilibili.com/video/BV123')).toMatchObject({
			platform: 'bilibili',
			requiresShareText: false,
		});
		expect(getVideoAsrTarget('https://example.com')).toBeNull();
	});

	test('checks existing transcript variable', () => {
		expect(hasTranscriptVariable({ '{{transcript}}': 'hello' })).toBe(true);
		expect(hasTranscriptVariable({ '{{transcript}}': '   ' })).toBe(false);
		expect(hasTranscriptVariable({})).toBe(false);
	});

	test('applies ASR transcript to variables and content preview', () => {
		const result = applyVideoAsrTranscript({ '{{content}}': '正文' }, '转录文本');

		expect(result.variables['{{transcript}}']).toBe('转录文本');
		expect(result.variables['{{content}}']).toContain('## Transcript');
		expect(result.variables['{{content}}']).toContain('转录文本');
		expect(result.updatedContent).toBe(true);
	});

	test('does not duplicate transcript section', () => {
		const result = applyVideoAsrTranscript({
			'{{content}}': '正文\n\n## Transcript\n\n旧文本',
		}, '新文本');

		expect(result.variables['{{transcript}}']).toBe('新文本');
		expect(result.variables['{{content}}']).toBe('正文\n\n## Transcript\n\n旧文本');
		expect(result.updatedContent).toBe(false);
	});

	test('renders Douyin source link as blockquote', () => {
		const result = applyVideoAsrTranscript(
			buildEmptyDouyinVariables('https://www.douyin.com/?recommend=1'),
			'字幕文本',
			{
				platform: 'douyin',
				title: '测试标题',
				author: '作者',
				description: '测试描述 #标签一 #标签二',
				published: '1714752000',
				tags: '标签一,标签二',
				sourceUrl: 'https://v.douyin.com/abc/',
			}
		);

		expect(result.variables['{{title}}']).toBe('测试标题');
		expect(result.variables['{{author}}']).toBe('作者');
		expect(result.variables['{{description}}']).toBe('测试描述 #标签一 #标签二');
		expect(result.variables['{{published}}']).toBe('2024-05-03T16:00:00.000Z');
		expect(result.variables['{{tags}}']).toBe('标签一, 标签二, text, clippings');
		expect(result.variables['{{url}}']).toBe('https://v.douyin.com/abc/');
		expect(result.variables['{{content}}']).toContain('> 📝 原文链接: [在抖音打开](https://v.douyin.com/abc/)');
		expect(result.variables['{{content}}']).toContain('## Transcript');
		expect(result.variables['{{content}}']).toContain('字幕文本');
	});

	test('keeps default Douyin title and required tags before metadata resolves', () => {
		const result = applyVideoAsrTranscript(
			buildEmptyDouyinVariables('https://www.douyin.com/?recommend=1'),
			'',
			{ platform: 'douyin', sourceUrl: 'https://v.douyin.com/abc/' }
		);

		expect(result.variables['{{title}}']).toBe('抖音视频');
		expect(result.variables['{{noteName}}']).toBe('抖音视频');
		expect(result.variables['{{url}}']).toBe('https://v.douyin.com/abc/');
		expect(result.variables['{{tags}}']).toBe('text, clippings');
		expect(result.variables['{{date}}']).toBeTruthy();
	});

	test('keeps required Douyin tags when ASR returns no hashtags', () => {
		const result = applyVideoAsrTranscript(
			buildEmptyDouyinVariables('https://www.douyin.com/?recommend=1'),
			'字幕文本',
			{ platform: 'douyin' }
		);

		expect(result.variables['{{tags}}']).toBe('text, clippings');
	});
});
