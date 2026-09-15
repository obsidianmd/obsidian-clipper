// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addPropertyToEditor, initializeTemplateValidation, showTemplateEditor } from './template-ui';
import { createTemplateEditor, destroyTemplateEditors } from '../utils/template-editor';

beforeEach(() => {
	vi.useFakeTimers();
	document.body.innerHTML = `<div id="template-editor"><form id="template-settings-form">
		<textarea id="note-content-format"></textarea>
		<input id="note-name-format">
		<input id="template-path-name">
		<textarea id="prompt-context"></textarea>
		<div id="template-properties"></div>
	</form></div>`;
	initializeTemplateValidation();
});

afterEach(() => {
	destroyTemplateEditors(document.body);
	document.body.replaceChildren();
	vi.runOnlyPendingTimers();
	vi.useRealTimers();
});

it('shows and clears note content errors while the CodeMirror editor stays focused', () => {
	const field = document.getElementById('note-content-format') as HTMLTextAreaElement;
	const view = createTemplateEditor(field);
	view.focus();
	view.dispatch({ changes: { from: 0, insert: 'Hello\n{{}}' } });
	vi.advanceTimersByTime(299);
	expect(document.querySelector('.validation-error')).toBeNull();
	vi.advanceTimersByTime(1);
	expect(document.querySelector('.validation-error')?.textContent).toContain('Line 2:');
	expect(document.getElementById('template-error-summary')?.classList.contains('has-errors')).toBe(true);
	expect(field.nextElementSibling?.nextElementSibling?.id).toBe('note-content-format-validation');
	expect(document.activeElement).toBe(view.contentDOM);

	view.dispatch({ changes: { from: 8, insert: 'title' } });
	vi.advanceTimersByTime(300);
	expect(document.querySelector('.validation-error')).toBeNull();
	expect(document.getElementById('template-error-summary')?.style.display).toBe('none');
	expect(document.activeElement).toBe(view.contentDOM);
});

it.each(['note-name-format', 'template-path-name', 'prompt-context'])('debounces successive edits in %s', (id) => {
	const field = document.getElementById(id) as HTMLInputElement;
	field.value = '{{}}';
	field.dispatchEvent(new Event('input'));
	vi.advanceTimersByTime(200);
	field.value = '{{title}}';
	field.dispatchEvent(new Event('input'));
	vi.advanceTimersByTime(100);
	expect(document.getElementById(`${id}-validation`)).toBeNull();
	vi.advanceTimersByTime(200);
	expect(document.getElementById(`${id}-validation`)?.style.display).toBe('none');
});

it('flushes validation on blur', () => {
	const field = document.getElementById('note-content-format') as HTMLTextAreaElement;
	field.value = '{{}}';
	field.dispatchEvent(new Event('input'));
	field.dispatchEvent(new Event('blur'));
	expect(document.querySelector('.validation-error')).not.toBeNull();
	const issue = document.querySelector('.validation-error');
	vi.advanceTimersByTime(300);
	expect(document.querySelector('.validation-error')).toBe(issue);
});

it('ignores pending validation for removed fields', () => {
	const field = document.getElementById('note-content-format') as HTMLTextAreaElement;
	field.value = '{{}}';
	field.dispatchEvent(new Event('input'));
	field.remove();
	vi.advanceTimersByTime(300);
	expect(document.querySelector('.template-validation')).toBeNull();
	expect(document.getElementById('template-error-summary')).toBeNull();
});

it('validates property values below their row and ignores edits pending at removal', () => {
	const row = addPropertyToEditor('description', '', 'description');
	const field = row.querySelector('.property-value') as HTMLInputElement;
	const view = createTemplateEditor(field);
	view.dispatch({ changes: { from: 0, insert: '{{}}' } });
	vi.advanceTimersByTime(300);
	expect(row.lastElementChild?.classList.contains('invalid')).toBe(true);
	view.dispatch({ changes: { from: 2, insert: 'title' } });
	row.querySelector<HTMLButtonElement>('.remove-property-btn')!.click();
	vi.advanceTimersByTime(300);
	expect(document.querySelector('.template-validation')).toBeNull();
});

it('cancels pending validation when switching templates', () => {
	const field = document.getElementById('note-content-format') as HTMLTextAreaElement;
	const view = createTemplateEditor(field);
	view.dispatch({ changes: { from: 0, insert: '{{}}' } });
	showTemplateEditor({
		id: 'next', name: 'Next', behavior: 'create',
		noteNameFormat: '{{title}}', noteContentFormat: 'Next\n{{}}',
		path: '', properties: [], triggers: [], context: '',
	});
	const issue = document.querySelector('#note-content-format-validation .validation-error');
	expect(issue?.textContent).toContain('Line 2:');
	vi.advanceTimersByTime(300);
	expect(document.querySelector('#note-content-format-validation .validation-error')).toBe(issue);
});
