import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { cleanDocumentInPlace, cleanExtractedHtmlWithReport } from './ad-cleaner';

const linkedomParser = {
	parseFromString(html: string) {
		return parseHTML(html).document as unknown as Document;
	},
};

describe('clean-page ad cleaner', () => {
	it('removes Google AdSense and Google Publisher Tag remnants', () => {
		const { html, removed } = cleanExtractedHtmlWithReport(`
			<main>
				<article><p>Keep this article.</p></article>
				<ins class="adsbygoogle" data-ad-client="ca-pub-123"></ins>
				<div id="div-gpt-ad-123"><iframe src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></iframe></div>
				<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
			</main>
		`, { documentParser: linkedomParser });

		expect(html).toContain('Keep this article.');
		expect(html).not.toContain('adsbygoogle');
		expect(html).not.toContain('div-gpt-ad');
		expect(html).not.toContain('googlesyndication');
		expect(removed.googleAds + removed.adIframes + removed.genericAds).toBeGreaterThan(0);
	});

	it('removes generic ads, sponsored widgets, and overlays without removing article content', () => {
		const { document } = parseHTML(`
			<body>
				<article>
					<h1>Title</h1>
					<p>Real body.</p>
					<aside role="note">Important note to preserve.</aside>
				</article>
				<div class="ad-banner">Ad</div>
				<div class="taboola-widget">Sponsored links</div>
				<div role="dialog">Subscribe now</div>
			</body>
		`);

		const report = cleanDocumentInPlace(document as unknown as Document);
		const html = document.body.innerHTML || document.documentElement.innerHTML;

		expect(html).toContain('Real body.');
		expect(html).toContain('Important note to preserve.');
		expect(html).not.toContain('ad-banner');
		expect(html).not.toContain('taboola-widget');
		expect(html).not.toContain('Subscribe now');
		expect(report.genericAds).toBe(1);
		expect(report.sponsored).toBe(1);
		expect(report.overlays).toBe(1);
	});

	it('does not remove unrelated words that merely contain ad', () => {
		const { html } = cleanExtractedHtmlWithReport(`
			<article>
				<p class="roadmap">Roadmap should stay.</p>
				<p id="shadow-adventure">Adventure should stay.</p>
			</article>
		`, { documentParser: linkedomParser });

		expect(html).toContain('Roadmap should stay.');
		expect(html).toContain('Adventure should stay.');
	});
});
