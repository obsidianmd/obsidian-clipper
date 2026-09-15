// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { undo } from '@codemirror/commands';
import { acceptCompletion, startCompletion } from '@codemirror/autocomplete';
import { EditorView, runScopeHandlers } from '@codemirror/view';
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
	it.each(['textarea', 'input'] as const)('ignores property row drops in a %s without blocking reorder events or ordinary text drops', tag => {
		const input = field(tag);
		const view = createTemplateEditor(input);
		vi.spyOn(view, 'posAtCoords').mockReturnValue(0);
		const save = vi.fn();
		input.addEventListener('input', save);
		const row = document.createElement('div');
		row.className = 'property-editor dragging';
		document.body.appendChild(row);
		const reorder = vi.fn();
		view.dom.parentElement!.addEventListener('drop', reorder);
		const drop = (text: string) => {
			const event = new Event('drop', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'dataTransfer', { value: { files: [], getData: () => text } });
			view.contentDOM.dispatchEvent(event);
			return event;
		};
		expect(drop('1712345678901abc123def').defaultPrevented).toBe(true);
		expect(input.value).toBe('{{title}}');
		expect(save).not.toHaveBeenCalled();
		expect(reorder).toHaveBeenCalledOnce();
		row.remove();
		drop('ordinary text');
		expect(input.value).toBe('ordinary text{{title}}');
		expect(save).toHaveBeenCalledOnce();
	});

	it.each(['textarea', 'input'] as const)('pairs typed Markdown and Knap syntax in the %s editor and saves each change', tag => {
		const input = field(tag);
		input.value = '';
		const view = createTemplateEditor(input);
		const type = (text: string) => {
			for (const char of text) {
				const { from, to } = view.state.selection.main;
				const insert = () => view.state.update(view.state.replaceSelection(char), { userEvent: 'input.type' });
				if (!view.state.facet(EditorView.inputHandler).some(handler => handler(view, from, to, char, insert))) view.dispatch(insert());
			}
		};
		type('**bold** [[link]] {{title}} ');
		expect(input.value).toBe('**bold** [[link]] {{title}} ');
		type('{%');
		expect(input.value).toBe('**bold** [[link]] {{title}} {%%}');
		runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Backspace' }), 'editor');
		expect(input.value).toBe('**bold** [[link]] {{title}} ');
		type('__');
		expect(input.value.endsWith('____')).toBe(true);
		runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Backspace' }), 'editor');
		expect(input.value.endsWith('__')).toBe(true);
	});

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
