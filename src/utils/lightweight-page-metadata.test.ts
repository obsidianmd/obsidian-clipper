// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { countWordsInHtml, getLightweightPageMetadata } from './lightweight-page-metadata';

describe('getLightweightPageMetadata', () => {
	test('reads page metadata without article extraction', () => {
		document.head.innerHTML = '<title>Lecture</title><meta name="author" content="Teacher"><meta property="og:site_name" content="Course"><meta property="og:image" content="/cover.png">';
		document.documentElement.lang = 'en';

		const metadata = getLightweightPageMetadata(document);

		expect(metadata.title).toBe('Lecture');
		expect(metadata.author).toBe('Teacher');
		expect(metadata.site).toBe('Course');
		expect(metadata.language).toBe('en');
		expect(countWordsInHtml('<p>One two three</p>', document)).toBe(3);
	});
});
