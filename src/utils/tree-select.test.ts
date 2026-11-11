// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';

vi.mock('./i18n', () => ({
	getMessage: (key: string) => key
}));

vi.mock('../icons/icons', () => ({
	initializeIcons: () => {}
}));

import { buildTree } from './tree-select';

describe('buildTree', () => {
	test('nests children under their parent', () => {
		const tree = buildTree(['Clippings', 'Clippings/Web', 'Clippings/Web/Daily', 'Notes']);

		expect(tree.map(node => node.name)).toEqual(['Clippings', 'Notes']);
		expect(tree[0].path).toBe('Clippings');
		expect(tree[0].children.map(node => node.name)).toEqual(['Web']);
		expect(tree[0].children[0].path).toBe('Clippings/Web');
		expect(tree[0].children[0].children.map(node => node.name)).toEqual(['Daily']);
		expect(tree[1].children).toEqual([]);
	});

	test('does not duplicate a shared prefix', () => {
		const tree = buildTree(['A/B', 'A/C', 'A']);
		expect(tree).toHaveLength(1);
		expect(tree[0].children.map(node => node.name)).toEqual(['B', 'C']);
	});

	test('returns an empty list for no folders', () => {
		expect(buildTree([])).toEqual([]);
	});
});
