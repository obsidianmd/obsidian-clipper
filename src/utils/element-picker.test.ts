// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ElementPicker } from './element-picker';

describe('ElementPicker', () => {
	beforeEach(() => {
		document.body.innerHTML = '<main><section><button>Choose</button></section></main>';
	});

	test('highlights without mutating the candidate and suppresses its click', () => {
		const button = document.querySelector('button')!;
		const original = button.outerHTML;
		vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
			left: 10, top: 20, width: 100, height: 30, right: 110, bottom: 50, x: 10, y: 20, toJSON: () => ({}),
		});
		const pageClick = vi.fn();
		button.addEventListener('click', pageClick);
		const onSelect = vi.fn();
		const picker = new ElementPicker({ document, onSelect });

		picker.start();
		button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
		const overlay = document.querySelector('[data-obsidian-element-picker-overlay]') as HTMLElement;
		expect(overlay.style.left).toBe('10px');
		expect(button.outerHTML).toBe(original);

		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		button.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(true);
		expect(pageClick).not.toHaveBeenCalled();
		expect(onSelect).toHaveBeenCalledWith(button);
		expect(document.querySelector('[data-obsidian-element-picker-overlay]')).toBeNull();
	});

	test('navigates to parent and child with arrow keys', () => {
		const button = document.querySelector('button')!;
		const section = document.querySelector('section')!;
		const picker = new ElementPicker({ document, onSelect: vi.fn() });
		picker.start();
		button.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		section.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(document.querySelector('[data-obsidian-element-picker-overlay]')).toBeNull();

		const childPickerSelect = vi.fn();
		const childPicker = new ElementPicker({ document, onSelect: childPickerSelect });
		childPicker.start();
		section.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(childPickerSelect).toHaveBeenCalledWith(button);
	});

	test('Escape cancels and tears down without selecting', () => {
		const onSelect = vi.fn();
		const onCancel = vi.fn();
		const picker = new ElementPicker({ document, onSelect, onCancel });
		picker.start();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

		expect(onCancel).toHaveBeenCalledOnce();
		expect(onSelect).not.toHaveBeenCalled();
		expect(picker.isActive()).toBe(false);
		expect(document.querySelector('[data-obsidian-element-picker-overlay]')).toBeNull();
	});
});
