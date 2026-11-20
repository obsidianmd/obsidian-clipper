// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializePropertyTypesManager, updatePropertyTypesList } from './property-types-manager';
import { generalSettings } from '../utils/storage-utils';
import browser from '../utils/browser-polyfill';

beforeEach(() => {
	generalSettings.propertyTypes = [
		{ name: 'tags', type: 'multitext' },
		{ name: 'category', type: 'text' },
	];
	document.body.innerHTML = `<div id="property-types-list"></div>
		<div><button id="delete-unused-properties-btn"></button></div>`;
	vi.spyOn(browser.storage.sync, 'set');
	initializePropertyTypesManager();
});

afterEach(() => {
	document.body.replaceChildren();
	generalSettings.propertyTypes = [];
	vi.restoreAllMocks();
});

it.each(['tags', 'category'])('saves and restores the default value for %s', async (name) => {
	const row = Array.from(document.querySelectorAll('.property-editor'))
		.find(row => row.querySelector('.property-name')?.textContent === name)!;
	const input = row.querySelector<HTMLInputElement>('.property-default-value')!;
	input.value = 'research, reading';
	input.dispatchEvent(new Event('change'));

	expect(generalSettings.propertyTypes.find(property => property.name === name)?.defaultValue)
		.toBe('research, reading');
	await vi.waitFor(() => expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
		property_types: expect.arrayContaining([expect.objectContaining({ name, defaultValue: 'research, reading' })]),
	})));

	updatePropertyTypesList();
	const restoredRow = Array.from(document.querySelectorAll('.property-editor'))
		.find(row => row.querySelector('.property-name')?.textContent === name)!;
	expect(restoredRow.querySelector<HTMLInputElement>('.property-default-value')?.value)
		.toBe('research, reading');
	if (name === 'tags') {
		expect(restoredRow.querySelector<HTMLSelectElement>('.property-type')?.disabled).toBe(true);
		expect(generalSettings.propertyTypes.find(property => property.name === name)?.type).toBe('multitext');
	}
});
