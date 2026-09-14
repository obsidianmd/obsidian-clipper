// @vitest-environment jsdom
import { afterEach, describe, test, expect } from 'vitest';
import {
	createHighlighterMenu,
	createTextQuoteAnchor,
	getActiveHighlightColor,
	getHighlights,
	handleTextSelection,
	recolorHighlightRecords,
	resolveHighlighterTheme,
	setActiveHighlightColor,
	updateHighlights,
} from './highlighter';

function container(text: string): Element {
	const el = document.createElement('p');
	el.textContent = text;
	return el;
}

describe('createTextQuoteAnchor', () => {
	test('captures the text on each side of the selection', () => {
		const el = container('Intro. The term applies here. Outro.');
		const start = 'Intro. '.length;
		const end = start + 'The term applies here.'.length;
		expect(createTextQuoteAnchor(el, start, end)).toEqual({
			prefix: 'Intro. ',
			suffix: ' Outro.',
		});
	});

	test('returns an empty prefix when the selection starts the block', () => {
		const el = container('The term applies here. Outro.');
		const anchor = createTextQuoteAnchor(el, 0, 'The term applies here.'.length);
		expect(anchor?.prefix).toBe('');
		expect(anchor?.suffix).toBe(' Outro.');
	});

	test('caps context at 64 characters per side', () => {
		const pad = 'x'.repeat(100);
		const el = container(`${pad}MIDDLE${pad}`);
		const anchor = createTextQuoteAnchor(el, 100, 106)!;
		expect(anchor.prefix).toBe('x'.repeat(64));
		expect(anchor.suffix).toBe('x'.repeat(64));
	});

	test('returns undefined for a whitespace-only selection', () => {
		const el = container('before    after');
		expect(createTextQuoteAnchor(el, 'before'.length, 'before    '.length)).toBeUndefined();
	});
});

describe('getHighlights', () => {
	test('returns color metadata with the highlighted content', () => {
		updateHighlights([{
			id: 'colored',
			type: 'text',
			xpath: '/p[1]',
			content: 'example',
			startOffset: 0,
			endOffset: 7,
			color: 'red',
		}]);

		expect(getHighlights()).toEqual([expect.objectContaining({ content: 'example', color: 'red' })]);
	});
});

describe('recolorHighlightRecords', () => {
	const records = [
		{ id: 'one', type: 'text' as const, xpath: '/p[1]', content: 'First', startOffset: 0, endOffset: 5, groupId: 'group' },
		{ id: 'two', type: 'text' as const, xpath: '/p[2]', content: 'Second', startOffset: 0, endOffset: 6, groupId: 'group' },
		{ id: 'other', type: 'text' as const, xpath: '/p[3]', content: 'Other', startOffset: 0, endOffset: 5, color: 'blue' as const },
	];

	test('recolors every segment of one logical highlight group', () => {
		const recolored = recolorHighlightRecords(records, 'two', 'red');
		expect(recolored.map(highlight => highlight.color)).toEqual(['red', 'red', 'blue']);
	});

	test('removes the marker color when switching back to the default', () => {
		const colored = recolorHighlightRecords(records, 'one', 'purple');
		const reset = recolorHighlightRecords(colored, 'one');
		expect(reset[0]).not.toHaveProperty('color');
		expect(reset[1]).not.toHaveProperty('color');
		expect(reset[2].color).toBe('blue');
	});
});

describe('resolveHighlighterTheme', () => {
	test('uses the configured light theme when Reader appearance is light', () => {
		expect(resolveHighlighterTheme({
			lightTheme: 'flexoki',
			darkTheme: 'nord',
			appearance: 'light',
		}, true)).toEqual({ theme: 'flexoki', scheme: 'light' });
	});

	test('uses the separate dark theme when automatic appearance is dark', () => {
		expect(resolveHighlighterTheme({
			lightTheme: 'flexoki',
			darkTheme: 'nord',
			appearance: 'auto',
		}, true)).toEqual({ theme: 'nord', scheme: 'dark' });
	});

	test('uses the light theme palette in dark mode when dark theme is same', () => {
		expect(resolveHighlighterTheme({
			lightTheme: 'rose-pine',
			darkTheme: 'same',
			appearance: 'dark',
		}, false)).toEqual({ theme: 'rose-pine', scheme: 'dark' });
	});
});

describe('highlighter color mode', () => {
	afterEach(() => {
		document.body.classList.remove('obsidian-highlighter-active');
		setActiveHighlightColor();
		updateHighlights([]);
		document.body.textContent = '';
	});

	test('opens a separate color popover and keeps the action menu visible', () => {
		document.body.classList.add('obsidian-highlighter-active');
		updateHighlights([{
			id: 'menu-highlight',
			type: 'text',
			xpath: '/p[1]',
			content: 'Example',
			startOffset: 0,
			endOffset: 7,
		}]);
		createHighlighterMenu();

		const trigger = document.querySelector<HTMLButtonElement>('#obsidian-highlight-color-trigger')!;
		trigger.click();
		expect(document.querySelector('.obsidian-highlight-color-popover')).not.toBeNull();
		expect(document.querySelectorAll('.obsidian-highlight-color-popover .obsidian-highlight-color-option')).toHaveLength(7);
		expect(document.querySelector('#obsidian-clip-button')).not.toBeNull();
		expect(document.querySelector<HTMLButtonElement>('#obsidian-highlight-color-trigger')?.getAttribute('aria-expanded')).toBe('true');

		document.querySelector<HTMLButtonElement>('.obsidian-highlight-color-option[data-highlight="green"]')!.click();
		expect(getActiveHighlightColor()).toBe('green');
		expect(document.body.dataset.obsidianHighlightColor).toBe('green');
		expect(document.querySelector('.obsidian-highlight-color-popover')).toBeNull();
		expect(document.querySelector<HTMLButtonElement>('#obsidian-highlight-color-trigger')?.dataset.highlight).toBe('green');
	});

	test('applies the active color to subsequent text highlights', () => {
		class MockHighlight {
			priority = 0;
			add() {}
			delete() { return true; }
			clear() {}
		}
		(globalThis as unknown as { CSS: unknown }).CSS = { highlights: new Map() };
		(window as unknown as { Highlight: unknown }).Highlight = MockHighlight;
		document.body.innerHTML = '<p>Highlight this sentence.</p>';
		document.body.classList.add('obsidian-highlighter-active');
		setActiveHighlightColor('purple');
		const text = document.querySelector('p')!.firstChild!;
		const range = document.createRange();
		range.setStart(text, 0);
		range.setEnd(text, 9);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);

		handleTextSelection(selection);

		expect(getHighlights()).toEqual([
			expect.objectContaining({ content: '<p>Highlight</p>', color: 'purple' }),
		]);
	});
});
