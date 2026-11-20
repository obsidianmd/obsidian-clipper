// @vitest-environment jsdom
import { describe, test, expect, vi } from 'vitest';

vi.mock('./i18n', () => ({
	getMessage: (key: string) => key
}));

import {
	CUSTOM_PATH_VALUE,
	formatFolderLabel,
	populateFolderSelect,
	setFolderField,
	getFolderFieldValue,
	handleFolderInputChange
} from './folder-select';

function createFields(): { select: HTMLSelectElement; input: HTMLInputElement } {
	const select = document.createElement('select');
	const input = document.createElement('input');
	return { select, input };
}

describe('populateFolderSelect', () => {
	test('lists vault root, folders and the custom option', () => {
		const { select } = createFields();
		populateFolderSelect(select, ['Clippings', 'Clippings/Web'], '');

		expect(Array.from(select.options).map(o => o.value))
			.toEqual(['', 'Clippings', 'Clippings/Web', CUSTOM_PATH_VALUE]);
		expect(select.value).toBe('');
	});

	test('selects a recognized folder', () => {
		const { select } = createFields();
		populateFolderSelect(select, ['Clippings'], 'Clippings');
		expect(select.value).toBe('Clippings');
	});

	test('keeps an unrecognized path as a selectable option', () => {
		const { select } = createFields();
		populateFolderSelect(select, ['Clippings'], 'Clippings/{{date}}');

		expect(Array.from(select.options).map(o => o.value)).toContain('Clippings/{{date}}');
		expect(select.value).toBe('Clippings/{{date}}');
	});
});

describe('formatFolderLabel', () => {
	test('shows only the leaf name at the root', () => {
		expect(formatFolderLabel('Clippings')).toBe('Clippings');
	});

	test('indents nested folders by depth', () => {
		expect(formatFolderLabel('Clippings/Web')).toBe('\u00A0\u00A0Web');
		expect(formatFolderLabel('Clippings/Web/Daily')).toBe('\u00A0\u00A0\u00A0\u00A0Daily');
	});

	test('populate renders an indented tree', () => {
		const { select } = createFields();
		populateFolderSelect(select, ['Clippings', 'Clippings/Web'], '');

		const labels = Array.from(select.options).map(o => o.textContent);
		expect(labels).toContain('Clippings');
		expect(labels).toContain('\u00A0\u00A0Web');
	});
});

describe('folder field value resolution', () => {
	test('returns the select value and hides the input for a recognized folder', () => {
		const { select, input } = createFields();
		setFolderField(select, input, ['Clippings'], 'Clippings');

		expect(getFolderFieldValue(select, input)).toBe('Clippings');
		expect(input.style.display).toBe('none');
	});

	test('returns the input value when the custom option is selected', () => {
		const { select, input } = createFields();
		setFolderField(select, input, ['Clippings'], '');
		select.value = CUSTOM_PATH_VALUE;
		input.value = 'Drafts/{{title}}';

		expect(getFolderFieldValue(select, input)).toBe('Drafts/{{title}}');
	});

	test('reveals the input for an unrecognized saved path', () => {
		const { select, input } = createFields();
		setFolderField(select, input, ['Clippings'], 'Clippings/{{date}}');

		expect(input.value).toBe('Clippings/{{date}}');
		expect(input.style.display).not.toBe('none');
	});

	test('snaps the select back when the input matches a known folder', () => {
		const { select, input } = createFields();
		setFolderField(select, input, ['Clippings'], '');
		select.value = CUSTOM_PATH_VALUE;
		input.value = 'Clippings';

		handleFolderInputChange(select, input, ['Clippings']);

		expect(select.value).toBe('Clippings');
		expect(input.style.display).toBe('none');
	});
});
