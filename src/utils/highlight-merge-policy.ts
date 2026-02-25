import type { AnyHighlightData } from './highlighter';

export type HighlightMergeRelationship = 'adjacent' | 'overlap';
const FALLBACK_HIGHLIGHT_COLOR = '#ffeb3b';

function resolveHighlightColor(highlight: AnyHighlightData): string {
	return highlight.color || FALLBACK_HIGHLIGHT_COLOR;
}

/**
 * Decides when two highlights should collapse into one record.
 * Why: support overlapping highlight layers (different selections/colors) while still
 * merging truly contiguous runs that represent one continuous mark.
 */
export function shouldAutoMergeHighlights(
	highlight1: AnyHighlightData,
	highlight2: AnyHighlightData,
	relationship: HighlightMergeRelationship
): boolean {
	if (relationship === 'overlap') {
		return false;
	}

	if (highlight1.type === 'text' && highlight2.type === 'text' && highlight1.xpath === highlight2.xpath) {
		return resolveHighlightColor(highlight1) === resolveHighlightColor(highlight2);
	}

	return true;
}
