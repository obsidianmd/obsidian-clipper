export const SANS_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
export const SERIF_STACK = '"Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, "Times New Roman", Times, serif';

export function getFontCss(defaultFont: string): string | null {
	if (defaultFont === '__serif__') return SERIF_STACK;
	if (defaultFont) return `"${defaultFont}", ${SANS_STACK}`;
	return null;
}
