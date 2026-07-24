import { describe, expect, test } from 'vitest';
import { resolveCaptureResult } from './capture-source';
import { TextHighlightData } from './highlighter';

const highlight: TextHighlightData = {
	type: 'text', id: 'highlight-1', xpath: '', content: '<p>Highlight</p>', startOffset: 0, endOffset: 9,
};

describe('resolveCaptureResult', () => {
	test('gives selected text precedence over every other source', () => {
		expect(resolveCaptureResult({
			selectedHtml: '<p>Selected</p>',
			pickedElementHtml: '<article>Picked</article>',
			automaticHtml: '<main>Automatic</main>',
			highlights: [highlight],
			replaceContentWithHighlights: true,
		})).toMatchObject({ source: 'selected-text', html: '<p>Selected</p>' });
	});

	test('uses picked content before highlight replacement and automatic content', () => {
		expect(resolveCaptureResult({
			selectedHtml: '', pickedElementHtml: '<article>Picked</article>', automaticHtml: '<main>Automatic</main>',
			highlights: [highlight], replaceContentWithHighlights: true,
		})).toMatchObject({ source: 'picked-element', html: '<article>Picked</article>' });
	});

	test('preserves highlight replacement and automatic fallback when no explicit source exists', () => {
		expect(resolveCaptureResult({
			selectedHtml: '', pickedElementHtml: '', automaticHtml: '<main>Automatic</main>',
			highlights: [highlight], replaceContentWithHighlights: true,
		})).toMatchObject({ source: 'highlight-replacement', html: '<p>Highlight</p>' });
		expect(resolveCaptureResult({
			selectedHtml: '', pickedElementHtml: '', automaticHtml: '<main>Automatic</main>',
			highlights: [highlight], replaceContentWithHighlights: false,
		})).toMatchObject({ source: 'automatic-article', html: '<main>Automatic</main>' });
	});
});
