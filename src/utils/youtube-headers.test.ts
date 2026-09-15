import { describe, test, expect } from 'vitest';
import { rewriteYouTubeInnertubeHeaders } from './youtube-headers';

describe('rewriteYouTubeInnertubeHeaders', () => {
	describe('when the request belongs to a tab', () => {
		test('passes the referer through unchanged for a genuine youtube.com page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
			});
			expect(result).toEqual([{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]);
		});

		test('passes the origin through unchanged for a genuine youtube.com page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Origin', value: 'https://www.youtube.com' }],
			});
			expect(result).toEqual([{ name: 'Origin', value: 'https://www.youtube.com' }]);
		});

		test('rewrites Origin and Referer when the referer is a moz-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Referer', value: 'moz-extension://12345678-abcd-1234-abcd-1234567890ab/background.html' }],
			});
			expect(result).toEqual([
				{ name: 'Referer', value: 'https://www.youtube.com/' },
				{ name: 'Origin', value: 'https://www.youtube.com' },
			]);
		});

		test('rewrites Origin and Referer when the origin is a moz-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Origin', value: 'moz-extension://12345678-abcd-1234-abcd-1234567890ab' }],
			});
			expect(result).toEqual([
				{ name: 'Origin', value: 'https://www.youtube.com' },
				{ name: 'Referer', value: 'https://www.youtube.com/' },
			]);
		});

		test('rewrites Origin and Referer when the referer is a safari-web-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Referer', value: 'safari-web-extension://12345678-ABCD-1234-ABCD-1234567890AB/' }],
			});
			expect(result).toEqual([
				{ name: 'Referer', value: 'https://www.youtube.com/' },
				{ name: 'Origin', value: 'https://www.youtube.com' },
			]);
		});

		test('passes headers through unchanged when there are no Origin or Referer headers at all', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'User-Agent', value: 'Mozilla/5.0' }],
			});
			expect(result).toEqual([{ name: 'User-Agent', value: 'Mozilla/5.0' }]);
		});

		test('treats a missing requestHeaders array as not from the extension', () => {
			const result = rewriteYouTubeInnertubeHeaders({ tabId: 7 });
			expect(result).toEqual([]);
		});
	});

	describe('when the request has no tab (tabId -1)', () => {
		test('passes the referer through unchanged for a genuine youtube.com page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: -1,
				requestHeaders: [{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
			});
			expect(result).toEqual([{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]);
		});

		test('passes the origin through unchanged for a genuine youtube.com origin', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: -1,
				requestHeaders: [{ name: 'Origin', value: 'https://www.youtube.com' }],
			});
			expect(result).toEqual([{ name: 'Origin', value: 'https://www.youtube.com' }]);
		});

		test('passes headers through unchanged when there are no Origin or Referer headers at all', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: -1,
				requestHeaders: [{ name: 'User-Agent', value: 'Mozilla/5.0' }],
			});
			expect(result).toEqual([{ name: 'User-Agent', value: 'Mozilla/5.0' }]);
		});

		test('rewrites Origin and Referer when the origin is a moz-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: -1,
				requestHeaders: [{ name: 'Origin', value: 'moz-extension://12345678-abcd-1234-abcd-1234567890ab' }],
			});
			expect(result).toEqual([
				{ name: 'Origin', value: 'https://www.youtube.com' },
				{ name: 'Referer', value: 'https://www.youtube.com/' },
			]);
		});

		test('rewrites Origin and Referer when the referer is a moz-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: -1,
				requestHeaders: [{ name: 'Referer', value: 'moz-extension://12345678-abcd-1234-abcd-1234567890ab/background.html' }],
			});
			expect(result).toEqual([
				{ name: 'Referer', value: 'https://www.youtube.com/' },
				{ name: 'Origin', value: 'https://www.youtube.com' },
			]);
		});

		test('rewrites Origin and Referer when the referer is a safari-web-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: -1,
				requestHeaders: [{ name: 'Referer', value: 'safari-web-extension://12345678-ABCD-1234-ABCD-1234567890AB/' }],
			});
			expect(result).toEqual([
				{ name: 'Referer', value: 'https://www.youtube.com/' },
				{ name: 'Origin', value: 'https://www.youtube.com' },
			]);
		});
	});

	describe('when tabId is 0', () => {
		test('passes the referer through unchanged for a genuine youtube.com page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 0,
				requestHeaders: [{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
			});
			expect(result).toEqual([{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]);
		});

		test('rewrites Origin and Referer when the origin is a moz-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 0,
				requestHeaders: [{ name: 'Origin', value: 'moz-extension://12345678-abcd-1234-abcd-1234567890ab' }],
			});
			expect(result).toEqual([
				{ name: 'Origin', value: 'https://www.youtube.com' },
				{ name: 'Referer', value: 'https://www.youtube.com/' },
			]);
		});
	});

	describe('when tabId is undefined', () => {
		test('passes the referer through unchanged for a genuine youtube.com page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				requestHeaders: [{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
			});
			expect(result).toEqual([{ name: 'Referer', value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]);
		});

		test('rewrites Origin and Referer when the origin is a moz-extension page', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				requestHeaders: [{ name: 'Origin', value: 'moz-extension://12345678-abcd-1234-abcd-1234567890ab' }],
			});
			expect(result).toEqual([
				{ name: 'Origin', value: 'https://www.youtube.com' },
				{ name: 'Referer', value: 'https://www.youtube.com/' },
			]);
		});
	});

	describe('extension scheme detection requires a prefix match, not a substring match', () => {
		test('does not rewrite a genuine youtube.com referer that merely contains an extension scheme as a substring', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Referer', value: 'https://www.youtube.com/results?search_query=moz-extension://' }],
			});
			expect(result).toEqual([{ name: 'Referer', value: 'https://www.youtube.com/results?search_query=moz-extension://' }]);
		});

		test('does not rewrite a genuine youtube.com origin that merely contains an extension scheme as a substring', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [{ name: 'Origin', value: 'https://www.youtube.com/moz-extension://evil' }],
			});
			expect(result).toEqual([{ name: 'Origin', value: 'https://www.youtube.com/moz-extension://evil' }]);
		});
	});

	describe('header rewrite mechanics', () => {
		test('overwrites existing Origin and Referer values in place, case-insensitively and without duplicating entries', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [
					{ name: 'Referer', value: 'https://www.youtube.com/watch?v=abc' },
					{ name: 'origin', value: 'moz-extension://xyz/background.html' },
				],
			});
			expect(result).toEqual([
				{ name: 'Referer', value: 'https://www.youtube.com/' },
				{ name: 'origin', value: 'https://www.youtube.com' },
			]);
		});

		test('appends Origin after the existing headers, preserving them, when only Referer indicates the extension', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [
					{ name: 'Accept', value: '*/*' },
					{ name: 'Referer', value: 'moz-extension://xyz/background.html' },
				],
			});
			expect(result).toEqual([
				{ name: 'Accept', value: '*/*' },
				{ name: 'Referer', value: 'https://www.youtube.com/' },
				{ name: 'Origin', value: 'https://www.youtube.com' },
			]);
		});

		test('appends Referer after the existing headers, preserving them, when only Origin indicates the extension', () => {
			const result = rewriteYouTubeInnertubeHeaders({
				tabId: 7,
				requestHeaders: [
					{ name: 'Accept', value: '*/*' },
					{ name: 'Origin', value: 'moz-extension://xyz' },
				],
			});
			expect(result).toEqual([
				{ name: 'Accept', value: '*/*' },
				{ name: 'Origin', value: 'https://www.youtube.com' },
				{ name: 'Referer', value: 'https://www.youtube.com/' },
			]);
		});

		test('does not mutate the requestHeaders array it was given', () => {
			const requestHeaders = [{ name: 'Referer', value: 'moz-extension://xyz/background.html' }];
			const snapshot = requestHeaders.map(header => ({ ...header }));
			rewriteYouTubeInnertubeHeaders({ tabId: 7, requestHeaders });
			expect(requestHeaders).toEqual(snapshot);
		});
	});
});
