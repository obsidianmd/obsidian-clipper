import { AnyHighlightData } from './highlighter';

export type CaptureSource = 'picked-element' | 'text-selection' | 'highlight-replacement' | 'automatic';

export interface CapturePrecedenceInput {
	pickedElementHtml: string;
	selectedHtml: string;
	automaticHtml: string;
	highlights: AnyHighlightData[];
	replaceContentWithHighlights: boolean;
}

export interface CapturePrecedenceResult {
	html: string;
	source: CaptureSource;
}

export function resolveCaptureContent({
	pickedElementHtml,
	selectedHtml,
	automaticHtml,
	highlights,
	replaceContentWithHighlights,
}: CapturePrecedenceInput): CapturePrecedenceResult {
	if (pickedElementHtml) {
		return { html: pickedElementHtml, source: 'picked-element' };
	}

	if (selectedHtml) {
		return { html: selectedHtml, source: 'text-selection' };
	}

	if (replaceContentWithHighlights && highlights.length > 0) {
		return {
			html: highlights.map(highlight => highlight.content).join(''),
			source: 'highlight-replacement',
		};
	}

	return { html: automaticHtml, source: 'automatic' };
}
