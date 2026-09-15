// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { closeMoreDropdown } from './popup';

it('closes an open more-actions dropdown after a successful save', () => {
	document.body.innerHTML = '<div id="more-dropdown" class="menu show"></div>';

	closeMoreDropdown();

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(false);
});
