// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import { closeMoreDropdown } from './popup';

beforeEach(() => {
	document.body.innerHTML = '';
});

it('closes an open more-actions dropdown after a successful save', () => {
	document.body.innerHTML = '<div id="more-dropdown" class="menu show"></div>';

	closeMoreDropdown();

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(false);
});

it('does nothing when the more-actions dropdown is absent', () => {
	expect(() => closeMoreDropdown()).not.toThrow();
});
