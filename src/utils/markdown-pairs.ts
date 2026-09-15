import { EditorSelection, EditorState, StateEffect, StateField, type Extension, type StateCommand } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { templateTags } from './template-completions';

interface MarkdownPair {
  open: number;
  close: number;
  length: number;
  token: string;
}

const addPair = StateEffect.define<MarkdownPair>();
const removePair = StateEffect.define<number>();
const pairs = StateField.define<MarkdownPair[]>({
  create: () => [],
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(removePair)) value = value.filter(pair => pair.close !== effect.value);
    }
    value = value.map(pair => ({
      ...pair,
      open: tr.changes.mapPos(pair.open, 1),
      close: tr.changes.mapPos(pair.close, 1),
    })).filter(pair => tr.newDoc.sliceString(pair.close, pair.close + pair.length) === pair.token.repeat(pair.length));
    for (const effect of tr.effects) {
      if (effect.is(addPair)) value.push(effect.value);
    }
    return value;
  },
});

function inTemplate(state: EditorState, pos: number) {
  const tags = templateTags(state.sliceDoc(0, pos));
  return tags.length > 0 && !tags[tags.length - 1].closed;
}

function escaped(state: EditorState, pos: number) {
  const slashes = state.sliceDoc(0, pos).match(/\\+$/)?.[0].length || 0;
  return slashes % 2 === 1;
}

/** Markdown pairing alongside CodeMirror's bracket and quote handling. */
export function insertMarkdownPair(state: EditorState, text: string, multiline = true) {
  const range = state.selection.main;
  const { from, to } = range;
  if (state.readOnly || state.selection.ranges.length !== 1 || inTemplate(state, from) || escaped(state, from)) return null;

  // Whitespace immediately after an empty emphasis opener makes it literal
  // (for example, a list bullet or multiplication), so discard its closer.
  if (range.empty && /^\s+$/.test(text)) {
    const pair = state.field(pairs).find(pair => '*_'.includes(pair.token) && pair.close === from && pair.open + pair.length === from);
    if (pair && state.sliceDoc(pair.open, from) === pair.token.repeat(pair.length)) {
      return state.update({
        changes: { from, to: from + pair.length, insert: text }, selection: { anchor: from + text.length },
        effects: removePair.of(pair.close), userEvent: 'input.type',
      });
    }
  }

  if (multiline && range.empty && text === '-' && state.doc.lineAt(from).number === 1 && state.doc.lineAt(from).text === '--' && from === 2) {
    return state.update({ changes: { from, insert: '-\n\n---\n' }, selection: { anchor: from + 2 }, userEvent: 'input.type' });
  }
  if (text.length !== 1 || !'*_`=~$%'.includes(text)) return null;

  if (!range.empty) {
    if (multiline && text === '`' && state.sliceDoc(from - 2, from) === '``') {
      const prefix = state.sliceDoc(from, from + 1) === '\n' ? '`' : '`\n';
      const suffix = state.sliceDoc(to - 1, to) === '\n' ? '`' : '\n`';
      return state.update({
        changes: [{ from, insert: prefix }, { from: to, insert: suffix }],
        selection: EditorSelection.range(range.anchor + prefix.length, range.head + prefix.length),
        effects: [
          ...state.field(pairs).filter(pair => pair.token === '`' && pair.close >= to && pair.close <= to + 1).map(pair => removePair.of(pair.close)),
          addPair.of({ open: from - 2, close: to + prefix.length + suffix.length - 1, length: 3, token: text }),
        ],
        userEvent: 'input.type',
      });
    }
    // Obsidian replaces multiline selections for emphasis, but wraps code and
    // the selection-only delimiters (highlight, strike, math, and comments).
    if ('*_'.includes(text) && state.doc.lineAt(from).number !== state.doc.lineAt(to).number) {
      return state.update({
        changes: { from, to, insert: text + text }, selection: { anchor: from + 1 },
        effects: addPair.of({ open: from, close: from + 1, length: 1, token: text }), userEvent: 'input.type',
      });
    }
    return state.update({
      changes: [{ from, insert: text }, { from: to, insert: text }],
      selection: EditorSelection.range(range.anchor + 1, range.head + 1),
      effects: addPair.of({ open: from, close: to + 1, length: 1, token: text }), userEvent: 'input.type',
    });
  }
  if (!'*_`'.includes(text)) return null;

  const pair = state.field(pairs).find(pair => pair.close === from && pair.token === text);
  if (pair) {
    // Repeating an empty emphasis opener grows *|* into **|** (and ***|***).
    if (text !== '`' && pair.open + pair.length === from && state.sliceDoc(pair.open, from) === text.repeat(pair.length)) {
      return state.update({
        changes: { from, insert: text + text }, selection: { anchor: from + 1 },
        effects: [removePair.of(pair.close), addPair.of({ ...pair, close: from + 1, length: pair.length + 1 })], userEvent: 'input.type',
      });
    }
    const count = text === '`' ? pair.length : 1;
    return state.update({
      selection: { anchor: from + count },
      effects: [removePair.of(pair.close), ...(pair.length > count ? [addPair.of({ ...pair, close: from + count, length: pair.length - count })] : [])],
      userEvent: 'select',
    });
  }

  if (multiline && text === '`' && /^\s*``$/.test(state.doc.lineAt(from).text.slice(0, from - state.doc.lineAt(from).from))) {
    const indent = state.doc.lineAt(from).text.match(/^\s*/)?.[0] || '';
    const close = from + 2 + indent.length;
    return state.update({
      changes: { from, insert: '`\n' + indent + '```' }, selection: { anchor: from + 1 },
      effects: addPair.of({ open: from - 2, close, length: 3, token: text }), userEvent: 'input.type',
    });
  }

  const before = state.sliceDoc(from - 1, from);
  const after = state.sliceDoc(from, from + 1);
  if ((before && !/\s|[([{]/.test(before)) || (after && !/\s|[)\]}]/.test(after))) return null;
  return state.update({
    changes: { from, insert: text + text }, selection: { anchor: from + 1 },
    effects: addPair.of({ open: from, close: from + 1, length: 1, token: text }), userEvent: 'input.type',
  });
}

export const deleteMarkdownPair: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (state.readOnly || !range.empty || state.selection.ranges.length !== 1 || inTemplate(state, range.head)) return false;
  const pair = state.field(pairs).find(pair => pair.close === range.head && pair.open + pair.length === range.head);
  if (!pair || state.sliceDoc(pair.open, pair.close) !== pair.token.repeat(pair.length)) return false;
  dispatch(state.update({
    changes: { from: range.head - 1, to: range.head + 1 }, selection: { anchor: range.head - 1 },
    effects: [removePair.of(pair.close), ...(pair.length > 1 ? [addPair.of({ ...pair, close: pair.close - 1, length: pair.length - 1 })] : [])],
    userEvent: 'delete.backward',
  }));
  return true;
};

export function markdownPairing(multiline = true): Extension {
  return [
    pairs,
    EditorView.inputHandler.of((view, from, to, text, insert) => {
      if (view.composing || from !== view.state.selection.main.from || to !== view.state.selection.main.to || !insert().isUserEvent('input.type')) return false;
      const transaction = insertMarkdownPair(view.state, text, multiline);
      if (!transaction) return false;
      view.dispatch(transaction);
      return true;
    }),
    EditorState.languageData.of((state, pos) => [{
      closeBrackets: { brackets: inTemplate(state, pos) || escaped(state, pos) ? [] : ['(', '[', '{', "'", '"'] },
    }]),
    closeBrackets(),
    keymap.of([{ key: 'Backspace', run: deleteMarkdownPair }, ...closeBracketsKeymap]),
  ];
}
