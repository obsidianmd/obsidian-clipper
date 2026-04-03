import { describe, test, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { resolvePageMetadata } from './page-metadata';

describe('resolvePageMetadata', () => {
	test('keeps non-weibo metadata unchanged', () => {
		const { document } = parseHTML('<html><head><title>Example</title></head><body></body></html>');
		const metadata = resolvePageMetadata({
			url: 'https://example.com/post',
			document: document as unknown as Document,
			title: 'Example title',
			author: 'Example author',
		});

		expect(metadata).toEqual({
			title: 'Example title',
			author: 'Example author',
			authorUrl: '',
		});
	});

	test('extracts weibo title and author profile link from page anchors', () => {
		const { document } = parseHTML(`
			<html>
				<head>
					<title>微博</title>
					<meta property="og:title" content="李老师发布了头条文章：《创业之前，你想过怎么给你的产品起名吗？》">
				</head>
				<body>
					<article>
						<header class="head-info">
							<a class="author" href="/u/1234567890">@李老师好文</a>
						</header>
					</article>
				</body>
			</html>
		`);

		const metadata = resolvePageMetadata({
			url: 'https://weibo.com/1234567890/AbCdEf',
			document: document as unknown as Document,
			title: '微博',
			author: '',
			metaTags: [
				{ property: 'og:title', name: null, content: '李老师发布了头条文章：《创业之前，你想过怎么给你的产品起名吗？》' },
			],
		});

		expect(metadata).toEqual({
			title: '创业之前，你想过怎么给你的产品起名吗？',
			author: '李老师好文',
			authorUrl: 'https://weibo.com/u/1234567890',
		});
	});

	test('falls back to script metadata for weibo author', () => {
		const { document } = parseHTML(`
			<html>
				<head><title>微博</title></head>
				<body>
					<script>
						window.__INITIAL_STATE__ = {"status":{"user":{"screen_name":"科技圈观察员","idstr":"99887766"}}};
					</script>
				</body>
			</html>
		`);

		const metadata = resolvePageMetadata({
			url: 'https://m.weibo.cn/status/AbCdEf',
			document: document as unknown as Document,
			title: '微博',
			author: '',
		});

		expect(metadata).toEqual({
			title: '微博',
			author: '科技圈观察员',
			authorUrl: 'https://weibo.com/u/99887766',
		});
	});
});
