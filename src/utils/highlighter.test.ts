// @vitest-environment jsdom
import { afterEach, describe, test, expect } from 'vitest';
import {
	createHighlighterMenu,
	createTextQuoteAnchor,
	getActiveHighlightColor,
	getHighlights,
	handleTextSelection,
	recolorHighlightRecords,
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

describe('highlighter color mode', () => {
	afterEach(() => {
		document.body.classList.remove('obsidian-highlighter-active');
		setActiveHighlightColor();
		updateHighlights([]);
		document.body.textContent = '';
	});

	test('transforms the menu into a color picker and restores it after selection', () => {
		document.body.classList.add('obsidian-highlighter-active');
		createHighlighterMenu();

		const trigger = document.querySelector<HTMLButtonElement>('#obsidian-highlight-color-trigger')!;
		trigger.click();
		expect(document.querySelector('.obsidian-highlighter-menu')?.classList.contains('is-color-picker')).toBe(true);
		expect(document.querySelectorAll('.obsidian-highlight-color-option')).toHaveLength(7);
		expect(document.querySelector('#obsidian-clip-button')).toBeNull();
		expect(document.querySelector('#obsidian-back-highlight-color')).toBeNull();

		document.querySelector<HTMLButtonElement>('.obsidian-highlight-color-option[data-highlight="green"]')!.click();
		expect(getActiveHighlightColor()).toBe('green');
		expect(document.body.dataset.obsidianHighlightColor).toBe('green');
		expect(document.querySelector('.obsidian-highlighter-menu')?.classList.contains('is-color-picker')).toBe(false);
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
