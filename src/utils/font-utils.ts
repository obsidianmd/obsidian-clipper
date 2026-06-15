export const SANS_STACK = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif';
export const SERIF_STACK = '"Iowan Old Style", "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, "Times New Roman", Times, serif';

// Strip anything that would break a CSS font-family value: straight quotes,
// backslashes, and the smart/curly quotes macOS substitutes automatically
// (otherwise they get baked into the font name and never match).
export function sanitizeFontName(name: string): string {
	return name.replace(/["'\\‘’“”]/g, '').trim();
}

export function getFontCss(defaultFont: string): string | null {
	if (defaultFont === '__serif__') return SERIF_STACK;
	if (defaultFont) return `"${sanitizeFontName(defaultFont)}", ${SANS_STACK}`;
	return null;
}

const FONT_PROBE_SAMPLE = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Best-effort check that a named font will actually render. The built-in
// stacks are always considered available. Pass `blocksCanvasProbe` for
// browsers (Safari, Firefox) that farble canvas text metrics as an
// anti-fingerprinting measure, in which case we fall back to the Font Loading
// API. Note that some browsers (e.g. Brave on web origins) restrict locally
// installed fonts entirely — this is exactly the case we want to detect so the
// reader can tell the user their font won't render.
export function isFontAvailable(
	fontName: string,
	{ doc = document, blocksCanvasProbe = false }: { doc?: Document; blocksCanvasProbe?: boolean } = {},
): boolean {
	if (!fontName || fontName === '__serif__') return true;
	const safeName = sanitizeFontName(fontName);
	if (!safeName) return true;

	const fontsCheck = (): boolean => {
		try {
			return doc.fonts ? doc.fonts.check(`16px "${safeName}"`) : true;
		} catch {
			return true;
		}
	};

	if (blocksCanvasProbe) return fontsCheck();

	const ctx = doc.createElement('canvas').getContext('2d');
	if (!ctx) return fontsCheck();

	// Compare against several generic baselines: a font that happens to match
	// one generic's metrics is unlikely to match all of them.
	for (const baseline of ['monospace', 'serif', 'sans-serif']) {
		ctx.font = `16px ${baseline}`;
		const baseWidth = ctx.measureText(FONT_PROBE_SAMPLE).width;
		ctx.font = `16px "${safeName}", ${baseline}`;
		if (ctx.measureText(FONT_PROBE_SAMPLE).width !== baseWidth) return true;
	}
	return false;
}
