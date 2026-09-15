// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { undo } from '@codemirror/commands';
import { acceptCompletion, startCompletion } from '@codemirror/autocomplete';
import { createTemplateEditor, destroyTemplateEditors, setTemplateEditorValue } from './template-editor';

function field(tag: 'input' | 'textarea' = 'textarea') {
	const field = document.createElement(tag);
	field.id = 'note-content-format';
	field.value = '{{title}}';
	document.body.appendChild(field);
	return field;
}

afterEach(() => {
	destroyTemplateEditors(document.body);
	document.body.replaceChildren();
});

describe('template editor form integration', () => {
	it('synchronizes edits and undo with bubbling autosave events', () => {
		const input = field();
		const save = vi.fn();
		input.addEventListener('input', save);
		const view = createTemplateEditor(input);
		view.dispatch({ changes: { from: 2, to: 7, insert: 'author' } });
		expect(input.value).toBe('{{author}}');
		expect(save).toHaveBeenCalledOnce();
		expect(save.mock.calls[0][0].bubbles).toBe(true);
		undo(view);
		expect(input.value).toBe('{{title}}');
	});

	it('loads property defaults without generating user edits', () => {
		const input = field('input');
		const save = vi.fn();
		input.addEventListener('input', save);
		const view = createTemplateEditor(input);
		setTemplateEditorValue(input, '{{date}}');
		expect(view.state.doc.toString()).toBe('{{date}}');
		expect(save).not.toHaveBeenCalled();
	});

	it('normalizes multiline paste in inputs but preserves newlines in the body', () => {
		for (const tag of ['input', 'textarea'] as const) {
			const input = field(tag);
			const view = createTemplateEditor(input);
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'one\ntwo\nthree' } });
			expect(view.state.doc.toString()).toBe(tag === 'input' ? 'onetwothree' : 'one\ntwo\nthree');
			expect(input.value).toBe(view.state.doc.toString());
		}
	});

	it('clears undo history when switching templates and removes old editor DOM', () => {
		const input = field();
		const first = createTemplateEditor(input);
		first.dispatch({ changes: { from: 0, to: first.state.doc.length, insert: 'First template edit' } });
		destroyTemplateEditors(document.body);
		input.value = 'Second template';
		const second = createTemplateEditor(input);
		expect(document.querySelectorAll('.cm-editor')).toHaveLength(1);
		expect(undo(second)).toBe(false);
		expect(input.value).toBe('Second template');
	});

	it('forwards blur validation and label focus to the visible editor', () => {
		const input = field();
		const label = document.createElement('label');
		label.htmlFor = input.id;
		label.textContent = 'Note content';
		document.body.appendChild(label);
		const validate = vi.fn();
		input.addEventListener('blur', validate);
		const view = createTemplateEditor(input);
		label.click();
		expect(document.activeElement).toBe(view.contentDOM);
		view.contentDOM.dispatchEvent(new FocusEvent('blur'));
		expect(validate).toHaveBeenCalledOnce();
	});

	it('shows required-field errors on the visible control', () => {
		const input = field('input');
		input.required = true;
		input.value = '';
		const view = createTemplateEditor(input);
		expect(input.reportValidity()).toBe(false);
		expect(document.activeElement).toBe(view.contentDOM);
		expect(document.querySelector('.knap-editor-validation')?.textContent).toBe(input.validationMessage);
		view.dispatch({ changes: { from: 0, insert: '{{title}}' } });
		expect(view.contentDOM.hasAttribute('aria-invalid')).toBe(false);
		expect(document.querySelector<HTMLElement>('.knap-editor-validation')?.hidden).toBe(true);
	});

	it('accepts a filter completion and saves the resulting input value', async () => {
		const input = field('input');
		input.value = '{{title|up}}';
		const view = createTemplateEditor(input);
		view.dispatch({ selection: { anchor: 10 } });
		view.focus();
		startCompletion(view);
		await vi.waitFor(() => expect(document.querySelector('.cm-tooltip-autocomplete')).not.toBeNull());
		await vi.waitFor(() => expect(acceptCompletion(view)).toBe(true));
		expect(input.value).toBe('{{title|upper}}');
	});
});
