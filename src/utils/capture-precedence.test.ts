import { describe, expect, test } from 'vitest';
import { resolveCaptureContent } from './capture-precedence';
import { TextHighlightData } from './highlighter';

const highlight: TextHighlightData = {
	type: 'text',
	id: 'highlight-1',
	xpath: '',
	content: '<p>Highlight</p>',
	startOffset: 0,
	endOffset: 9,
};

describe('resolveCaptureContent', () => {
	test('prefers a picked element over selection, highlight replacement, and automatic content', () => {
		expect(resolveCaptureContent({
			pickedElementHtml: '<article>Picked</article>',
			selectedHtml: '<p>Selected</p>',
			automaticHtml: '<main>Automatic</main>',
			highlights: [highlight],
			replaceContentWithHighlights: true,
		})).toEqual({ html: '<article>Picked</article>', source: 'picked-element' });
	});

	test('prefers live text selection over highlight replacement', () => {
		expect(resolveCaptureContent({
			pickedElementHtml: '',
			selectedHtml: '<p>Selected</p>',
			automaticHtml: '<main>Automatic</main>',
			highlights: [highlight],
			replaceContentWithHighlights: true,
		})).toEqual({ html: '<p>Selected</p>', source: 'text-selection' });
	});

	test('uses highlight replacement before automatic content', () => {
		expect(resolveCaptureContent({
			pickedElementHtml: '',
			selectedHtml: '',
			automaticHtml: '<main>Automatic</main>',
			highlights: [highlight],
			replaceContentWithHighlights: true,
		})).toEqual({ html: '<p>Highlight</p>', source: 'highlight-replacement' });
	});

	test('falls back to automatic content when replacement is disabled', () => {
		expect(resolveCaptureContent({
			pickedElementHtml: '',
			selectedHtml: '',
			automaticHtml: '<main>Automatic</main>',
			highlights: [highlight],
			replaceContentWithHighlights: false,
		})).toEqual({ html: '<main>Automatic</main>', source: 'automatic' });
	});
});
