import { Annotation, EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { acceptCompletion, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { knapStreamParser } from 'knap/codemirror';
import { templateCompletions } from './template-completions';
import { templateFilterSuggestions } from './template-filter-completions';
import { emptyTemplatePair, pairTemplateInput } from './template-pairs';
import { markdownPairing } from './markdown-pairs';

type TemplateField = HTMLInputElement | HTMLTextAreaElement;
const editors = new Map<TemplateField, { view: EditorView; destroy: () => void }>();
const silentChange = Annotation.define<boolean>();

// Page-independent variables available when authoring a template in settings.
const variables: Record<string, unknown> = Object.fromEntries([
	'author', 'content', 'contentHtml', 'selection', 'selectionHtml', 'date', 'time',
	'description', 'domain', 'favicon', 'fullHtml', 'highlights', 'image', 'noteName',
	'published', 'site', 'title', 'url', 'language', 'words', 'model', 'modelId', 'modelProvider',
].map(name => [name, '']));

const language = StreamLanguage.define({
	...knapStreamParser,
	token(stream, state) {
		// Avoid spending a frame highlighting huge pasted HTML lines.
		if (stream.string.length > 20_000) {
			stream.skipToEnd();
			Object.assign(state, knapStreamParser.startState());
			return null;
		}
		return knapStreamParser.token(stream, state);
	},
});

// Follow Flexoki token roles, as in the Knap docs, using the reader palette.
const highlightStyle = HighlightStyle.define([
	{ tag: tags.variableName, class: 'knap-variable' },
	{ tag: tags.propertyName, class: 'knap-variable' },
	{ tag: tags.special(tags.variableName), class: 'knap-filter' },
	{ tag: tags.keyword, class: 'knap-keyword' },
	{ tag: tags.atom, class: 'knap-constant' },
	{ tag: tags.string, class: 'knap-string' },
	{ tag: tags.number, class: 'knap-number' },
	{ tag: tags.comment, class: 'knap-comment' },
	{ tag: [tags.punctuation, tags.operator], class: 'knap-punctuation' },
]);

/** Enhance a form field while keeping its value and events as the form's API. */
export function createTemplateEditor(field: TemplateField): EditorView {
	const existing = editors.get(field);
	if (existing) return existing.view;
	const singleLine = field instanceof HTMLInputElement;
	const host = document.createElement('div');
	host.className = `knap-editor${singleLine ? ' knap-editor-inline' : ''}`;
	if (field.id === 'note-content-format') host.classList.add('knap-editor-body');
	field.after(host);
	field.classList.add('knap-editor-source');
	const labels = Array.from(field.labels ?? []);
	const focus = (event: Event) => { event.preventDefault(); view.focus(); };
	let validityMessage: HTMLDivElement | undefined;
	const invalid = (event: Event) => {
		focus(event);
		if (!validityMessage) {
			validityMessage = document.createElement('div');
			validityMessage.id = `${field.id}-required`;
			validityMessage.className = 'knap-editor-validation';
			validityMessage.setAttribute('role', 'alert');
			host.after(validityMessage);
		}
		validityMessage.textContent = field.validationMessage;
		validityMessage.hidden = false;
		view.contentDOM.setAttribute('aria-invalid', 'true');
	};
	const extensions: Extension[] = [
		language, syntaxHighlighting(highlightStyle), history(),
		placeholder(() => {
			const span = document.createElement('span');
			span.textContent = field.placeholder;
			return span;
		}),
		EditorView.contentAttributes.of(() => ({
			role: 'textbox', 'aria-label': field.getAttribute('aria-label') || labels.map(label => label.textContent?.trim()).join(' ') || field.placeholder,
			'aria-multiline': String(!singleLine), 'aria-required': String(field.required),
			'aria-describedby': `${field.id}-validation ${field.id}-required`,
			spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
		})),
		EditorView.inputHandler.of((view, from, to, text, insert) => {
			if (view.composing || view.state.selection.ranges.length !== 1 || !insert().isUserEvent('input.type')) return false;
			const pair = pairTemplateInput(view.state.doc.toString(), from, to, text);
			if (!pair) return false;
			view.dispatch({ changes: pair, selection: { anchor: pair.anchor }, userEvent: pair.insert ? 'input.type' : 'select' });
			return true;
		}),
		markdownPairing(!singleLine),
		autocompletion({
			icons: false, activateOnTypingDelay: 80,
			override: [context => {
				const result = templateCompletions(context.state.doc.toString(), context.pos, variables, templateFilterSuggestions);
				if (result?.options.some(option => option.label === 'title' && option.type === 'variable')) {
					return { ...result, options: [...result.options, ...['selector:', 'selectorHtml:', 'schema:', 'meta:', 'prompt:'].map(label => ({ label, type: 'variable' }))] };
				}
				return result;
			}],
		}),
		keymap.of([
			...completionKeymap, { key: 'Tab', run: acceptCompletion },
			{ key: 'Backspace', run(view) {
				if (!view.state.selection.main.empty || view.state.selection.ranges.length !== 1) return false;
				const pair = emptyTemplatePair(view.state.doc.toString(), view.state.selection.main.head);
				if (!pair) return false;
				view.dispatch({ changes: pair, selection: { anchor: pair.from }, userEvent: 'delete.backward' });
				return true;
			} },
			...(singleLine ? [{ key: 'Enter', run: () => true }] : []),
			...defaultKeymap, ...historyKeymap,
		]),
		EditorView.updateListener.of(update => {
			if (!update.docChanged || update.transactions.every(transaction => transaction.annotation(silentChange))) return;
			field.value = update.state.doc.toString();
			field.dispatchEvent(new Event('input', { bubbles: true }));
			if (field.validity.valid) {
				if (validityMessage) validityMessage.hidden = true;
				update.view.contentDOM.removeAttribute('aria-invalid');
			}
		}),
		EditorView.domEventHandlers({
			blur() { field.dispatchEvent(new Event('blur')); },
			drop() {
				// Property reordering uses a plain-text ID. Let the event bubble to
				// the reorder handler, but prevent CodeMirror from inserting the ID.
				return !!field.ownerDocument.querySelector('.property-editor.dragging');
			},
		}),
	];
	if (singleLine) {
		extensions.push(EditorState.transactionFilter.of(transaction => {
			if (!transaction.docChanged || transaction.newDoc.lines === 1) return transaction;
			// Match native text inputs: pasted newlines are removed.
			return [transaction, {
				changes: Array.from({ length: transaction.newDoc.lines - 1 }, (_, index) => {
					const line = transaction.newDoc.line(index + 1);
					return { from: line.to, to: line.to + 1 };
				}), sequential: true,
			}];
		}));
	} else {
		extensions.push(EditorView.lineWrapping);
	}
	const view = new EditorView({ parent: host, state: EditorState.create({ doc: field.value, extensions }) });
	labels.forEach(label => label.addEventListener('click', focus));
	field.addEventListener('invalid', invalid);
	const sync = () => setTemplateEditorValue(field, field.value);
	field.addEventListener('input', sync);
	field.addEventListener('change', sync);
	editors.set(field, { view, destroy() {
		view.destroy();
		host.remove();
		validityMessage?.remove();
		field.classList.remove('knap-editor-source');
		labels.forEach(label => label.removeEventListener('click', focus));
		field.removeEventListener('invalid', invalid);
		field.removeEventListener('input', sync);
		field.removeEventListener('change', sync);
	} });
	return view;
}

export function setTemplateEditorValue(field: TemplateField, value: string): void {
	field.value = value;
	const view = editors.get(field)?.view;
	if (view && view.state.doc.toString() !== field.value) {
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: field.value }, annotations: silentChange.of(true) });
	}
}

export function destroyTemplateEditors(root: HTMLElement): void {
	for (const [field, editor] of editors) {
		if (!root.contains(field)) continue;
		editor.destroy();
		editors.delete(field);
	}
}
