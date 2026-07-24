import { describe, expect, test } from 'vitest';
import { resolveCaptureResult } from './capture-source';
import { FrameSelectionTracker } from './frame-selection';

describe('FrameSelectionTracker', () => {
	test('tracks an explicit selection in frame 0', () => {
		const tracker = new FrameSelectionTracker();
		tracker.report(1, 0, { hasSelection: true, selectedHtml: '<p>Top frame</p>', frameUrl: 'https://example.test/' });

		expect(tracker.getLatest(1)).toEqual({ frameId: 0, selectedHtml: '<p>Top frame</p>', frameUrl: 'https://example.test/' });
	});

	test('routes the latest explicit selection to a child frame', () => {
		const tracker = new FrameSelectionTracker();
		tracker.report(1, 0, { hasSelection: true, selectedHtml: '<p>Top frame</p>', frameUrl: 'https://example.test/' });
		tracker.report(1, 7, { hasSelection: true, selectedHtml: '<p>Child frame</p>', frameUrl: 'https://embed.example.test/transcript' });

		expect(tracker.getLatest(1)?.frameId).toBe(7);
	});

	test('prefers the context-menu frameId over the last active frame', () => {
		const tracker = new FrameSelectionTracker();
		tracker.report(1, 7, { hasSelection: true, selectedHtml: '<p>Child frame</p>', frameUrl: 'https://embed.example.test/transcript' });

		expect(tracker.getContextFrame(1, 3)).toBe(3);
	});

	test('uses the latest reporting frame and falls back to frame 0', () => {
		const tracker = new FrameSelectionTracker();
		tracker.report(1, 7, { hasSelection: false, selectedHtml: '', frameUrl: 'https://embed.example.test/transcript' });

		expect(tracker.getContextFrame(1)).toBe(7);
		expect(tracker.getContextFrame(2)).toBe(0);
	});

	test('clears a stale frame selection after its capture finds no selection', () => {
		const tracker = new FrameSelectionTracker();
		tracker.report(1, 7, { hasSelection: true, selectedHtml: '<p>Stale</p>', frameUrl: 'https://embed.example.test/transcript' });
		tracker.clear(1, 7);

		expect(tracker.getLatest(1)).toBeUndefined();
	});

	test('does not alter picked-element, highlight, or automatic extraction precedence', () => {
		expect(resolveCaptureResult({
			selectedHtml: '',
			pickedElementHtml: '<article>Picked</article>',
			automaticHtml: '<main>Automatic</main>',
			highlights: ['<p>Highlight</p>'],
			replaceContentWithHighlights: true,
		})).toMatchObject({ source: 'picked-element', html: '<article>Picked</article>' });

		expect(resolveCaptureResult({
			selectedHtml: '',
			pickedElementHtml: '',
			automaticHtml: '<main>Automatic</main>',
			highlights: ['<p>Highlight</p>'],
			replaceContentWithHighlights: true,
		})).toMatchObject({ source: 'highlight-replacement', html: '<p>Highlight</p>' });

		expect(resolveCaptureResult({
			selectedHtml: '',
			pickedElementHtml: '',
			automaticHtml: '<main>Automatic</main>',
			highlights: [],
			replaceContentWithHighlights: false,
		})).toMatchObject({ source: 'automatic-article', html: '<main>Automatic</main>' });
	});
});
