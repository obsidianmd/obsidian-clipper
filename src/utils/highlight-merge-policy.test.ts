import { describe, expect, test } from 'vitest';
import { shouldAutoMergeHighlights } from './highlight-merge-policy';

type TestHighlight = {
	type: 'text' | 'element';
	xpath: string;
	color?: string;
	startOffset?: number;
	endOffset?: number;
};

function textHighlight(startOffset: number, endOffset: number, color: string): TestHighlight {
	return {
		type: 'text',
		xpath: '/html/body/p[1]',
		color,
		startOffset,
		endOffset
	};
}

describe('highlight merge policy', () => {
	test('keeps overlapping green and yellow text highlights separate', () => {
		const innerGreen = textHighlight(6, 11, '#86d26f'); // "Clerk"
		const outerYellow = textHighlight(0, 19, '#ffeb3b'); // "James Clerk Maxwell"
		expect(shouldAutoMergeHighlights(innerGreen as any, outerYellow as any, 'overlap')).toBe(false);
	});

	test('does not merge overlap even when colors match', () => {
		const first = textHighlight(6, 11, '#86d26f');
		const second = textHighlight(0, 19, '#86d26f');
		expect(shouldAutoMergeHighlights(first as any, second as any, 'overlap')).toBe(false);
	});

	test('merges adjacent text highlights when colors match', () => {
		const first = textHighlight(0, 5, '#ffeb3b');
		const second = textHighlight(5, 11, '#ffeb3b');
		expect(shouldAutoMergeHighlights(first as any, second as any, 'adjacent')).toBe(true);
	});

	test('does not merge adjacent text highlights when colors differ', () => {
		const first = textHighlight(0, 5, '#86d26f');
		const second = textHighlight(5, 11, '#ffeb3b');
		expect(shouldAutoMergeHighlights(first as any, second as any, 'adjacent')).toBe(false);
	});

	test('keeps adjacency merge for non-text combinations', () => {
		const elementHighlight: TestHighlight = {
			type: 'element',
			xpath: '/html/body/figure[1]',
			color: '#ffeb3b'
		};
		const textInElement: TestHighlight = {
			type: 'text',
			xpath: '/html/body/figure[1]',
			color: '#86d26f',
			startOffset: 1,
			endOffset: 4
		};
		expect(shouldAutoMergeHighlights(elementHighlight as any, textInElement as any, 'adjacent')).toBe(true);
	});
});
