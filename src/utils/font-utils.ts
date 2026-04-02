export const SANS_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
export const SERIF_STACK = '"Iowan Old Style", "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, "Times New Roman", Times, serif';

function sanitizeFontName(name: string): string {
	return name.replace(/["\\]/g, '');
}

export function getFontCss(defaultFont: string): string | null {
	if (defaultFont === '__serif__') return SERIF_STACK;
	if (defaultFont) return `"${sanitizeFontName(defaultFont)}", ${SANS_STACK}`;
	return null;
}
