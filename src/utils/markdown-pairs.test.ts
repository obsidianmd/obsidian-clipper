import { expect, test } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { deleteBracketPair, insertBracket } from '@codemirror/autocomplete';
import { deleteMarkdownPair, insertMarkdownPair, markdownPairing } from './markdown-pairs';
import { emptyTemplatePair, pairTemplateInput } from './template-pairs';

function editor(doc = '', anchor = doc.length, head = anchor, multiline = true) {
  let state = EditorState.create({ doc, selection: { anchor, head }, extensions: markdownPairing(multiline) });
  return {
    get state() { return state; },
    type(text: string) {
      for (const char of text) {
        const { from, to } = state.selection.main;
        const template = pairTemplateInput(state.doc.toString(), from, to, char);
        state = (template ? state.update({ changes: template, selection: { anchor: template.anchor } })
          : insertMarkdownPair(state, char, multiline) || insertBracket(state, char)
          || state.update(state.replaceSelection(char))).state;
      }
    },
    backspace() {
      const target = { state, dispatch: (tr: ReturnType<EditorState['update']>) => { state = tr.state; } };
      if (deleteMarkdownPair(target) || deleteBracketPair(target)) return;
      const pair = emptyTemplatePair(state.doc.toString(), state.selection.main.head);
      if (pair) state = state.update({ changes: pair, selection: { anchor: pair.from } }).state;
    },
    move(pos: number) { state = state.update({ selection: { anchor: pos } }).state; },
  };
}

test.each([
  ['*', '**', 1], ['**', '****', 2], ['***', '******', 3],
  ['_', '__', 1], ['__', '____', 2], ['`', '``', 1],
  ['```', '```\n```', 3], ['---', '---\n\n---\n', 4],
  ['(', '()', 1], ['[', '[]', 1], ['[[', '[[]]', 2], ['{', '{}', 1],
  ['"', '""', 1], ["'", "''", 1], ['{{', '{{}}', 2], ['{%', '{%%}', 2],
])('pairs %j', (typed, expected, position) => {
  const input = editor();
  input.type(typed);
  expect(input.state.doc.toString()).toBe(expected);
  expect(input.state.selection.main.head).toBe(position);
});

test.each(['**bold**', '__bold__', '*italic*', '_italic_', '`code`', '[[link]]', '(text)', '"quote"', '{{title}}', '{% if title %}'])('types and skips closing delimiters in %j', text => {
  const input = editor();
  input.type(text);
  expect(input.state.doc.toString()).toBe(text);
  expect(input.state.selection.main.head).toBe(text.length);
});

test.each(['* item', '  * nested item', '2 * 3', '_ text', '** text', '__ text', '* * * ', '_ _ _ '])('keeps whitespace after an emphasis opener literal in %j', text => {
  const input = editor();
  input.type(text);
  expect(input.state.doc.toString()).toBe(text);
  expect(input.state.selection.main.head).toBe(text.length);
});

test('does not remove existing delimiters or closers after nonempty emphasis', () => {
  const existing = editor('**', 1);
  existing.type(' ');
  expect(existing.state.doc.toString()).toBe('* *');
  const emphasis = editor();
  emphasis.type('**two words**');
  expect(emphasis.state.doc.toString()).toBe('**two words**');
});

test.each(['**', '__', '[[', '==', '~~', '$', '$$', '%%', '`', '(', '"'])('wraps selected text with %j and keeps it selected', text => {
  const input = editor('word', 4, 0);
  input.type(text);
  const closing = text.replace(/\[/g, ']').replace(/\(/g, ')');
  expect(input.state.doc.toString()).toBe(text + 'word' + closing);
  expect(input.state.selection.main).toEqual(EditorSelection.range(4 + text.length, text.length));
});

test.each(['**', '__', '[[', '{{', '{%', '`', '('])('backspace removes empty %j pairs', text => {
  const input = editor();
  input.type(text);
  input.backspace();
  if (['**', '__', '[['].includes(text)) input.backspace();
  expect(input.state.doc.toString()).toBe('');
});

test('leaves literal closers, intraword characters, escapes, and selection-only delimiters alone', () => {
  for (const [doc, position, text, expected] of [
    ['word*', 4, '*', 'word**'], ['word', 4, '_', 'word_'],
    ['\\', 1, '*', '\\*'], ['\\', 1, '[', '\\['],
    ['', 0, '==', '=='], ['', 0, '~~', '~~'], ['', 0, '$$', '$$'], ['', 0, '%%', '%%'],
  ] as const) {
    const input = editor(doc, position);
    input.type(text);
    expect(input.state.doc.toString()).toBe(expected);
  }
});

test('does not pair Markdown or quotes inside Knap expressions', () => {
  for (const doc of ['{{ ', '{{ title|replace:"', '{% set text = "', '{# comment ']) {
    for (const char of ['*', '_', '`', '[', '(', "'"]) {
      const input = editor(doc);
      input.type(char);
      expect(input.state.doc.toString()).toBe(doc + char);
    }
  }
});

test('wraps a selection in a code fence on the third backtick', () => {
  const input = editor('first\nsecond', 0, 12);
  input.type('```');
  expect(input.state.doc.toString()).toBe('```\nfirst\nsecond\n```');
  expect(input.state.sliceDoc(input.state.selection.main.from, input.state.selection.main.to)).toBe('first\nsecond');
});

test('only inserts frontmatter at the start and avoids multiline pairs in single-line fields', () => {
  const input = editor('text\n');
  input.type('---');
  expect(input.state.doc.toString()).toBe('text\n---');
  for (const text of ['---', '```']) {
    const inline = editor('', 0, 0, false);
    inline.type(text);
    expect(inline.state.doc.toString()).toBe(text);
  }
});

test('retains indentation on closing code fences and skips the fence as a unit', () => {
  const input = editor('  ');
  input.type('```');
  expect(input.state.doc.toString()).toBe('  ```\n  ```');
  input.move(8);
  input.type('`');
  expect(input.state.selection.main.head).toBe(11);
  expect(input.state.doc.toString()).toBe('  ```\n  ```');
});

test('ignores paste and readonly input', () => {
  const input = editor();
  expect(insertMarkdownPair(input.state, '**pasted**')).toBeNull();
  const readonly = EditorState.create({ extensions: [markdownPairing(), EditorState.readOnly.of(true)] });
  expect(insertMarkdownPair(readonly, '*')).toBeNull();
});
