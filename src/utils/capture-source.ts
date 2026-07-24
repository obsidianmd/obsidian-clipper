import { AnyHighlightData } from './highlighter';

export type CaptureSource = 'selected-text' | 'picked-element' | 'highlight-replacement' | 'automatic-article';

export interface CaptureResult {
	source: CaptureSource;
	html: string;
	selectedHtml: string;
	pickedElementHtml: string;
}

export interface CaptureResolutionInput {
	selectedHtml: string;
	pickedElementHtml: string;
	automaticHtml: string;
	highlights: Array<AnyHighlightData | string>;
	replaceContentWithHighlights: boolean;
}

export function resolveCaptureResult({
	selectedHtml,
	pickedElementHtml,
	automaticHtml,
	highlights,
	replaceContentWithHighlights,
}: CaptureResolutionInput): CaptureResult {
	if (selectedHtml) {
		return {
			source: 'selected-text',
			html: selectedHtml,
			selectedHtml,
			pickedElementHtml,
		};
	}

	if (pickedElementHtml) {
		return {
			source: 'picked-element',
			html: pickedElementHtml,
			selectedHtml: '',
			pickedElementHtml,
		};
	}

	if (replaceContentWithHighlights && highlights.length > 0) {
		return {
			source: 'highlight-replacement',
			html: highlights.map(highlight => typeof highlight === 'string' ? highlight : highlight.content).join(''),
			selectedHtml: '',
			pickedElementHtml: '',
		};
	}

	return {
		source: 'automatic-article',
		html: automaticHtml,
		selectedHtml: '',
		pickedElementHtml: '',
	};
}
