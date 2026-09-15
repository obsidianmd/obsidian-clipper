// Adapted from knap's website/src/lib/playground-pairs.ts (MIT).
// Copyright (c) 2026 Obsidian. See LICENSE for the MIT permission notice.
import { templateTags } from './template-completions';

function activeTag(source: string) {
  const tags = templateTags(source);
  const tag = tags[tags.length - 1];
  return tag && !tag.closed ? tag : undefined;
}

export function pairTemplateInput(source: string, from: number, to: number, text: string) {
  if (from !== to) return null;
  const before = source.slice(0, from);
  const after = source.slice(to);
  const tag = activeTag(before);
  if (tag?.kind === '{#') return null;

  // Typing an existing closing delimiter moves past it instead of duplicating it.
  if (tag && !tag.quoted && after.startsWith(text)) {
    const closing = tag.kind === '{{' ? '}}' : '%}';
    if (text === closing || (text.length === 1 && closing.includes(text))) {
      return { from, to, insert: '', anchor: from + text.length };
    }
  }

  const opener = text === '{{' || text === '{%' ? text
    : before.endsWith('{') && (text === '{' || text === '%') ? '{' + text : null;
  if (!opener) return null;
  const start = text.length === 1 ? from - 1 : from;
  // Braces in tag expressions and quoted filter arguments remain literal input.
  if (activeTag(source.slice(0, start))) return null;
  const closing = opener === '{{' ? '}}' : '%}';
  // A first brace may already have a CodeMirror-generated closing brace.
  // Reuse it when growing {} into a Knap variable or logic tag.
  const reuseBrace = text.length === 1 && after.startsWith('}') && !after.startsWith(closing);
  return { from, to: reuseBrace ? to + 1 : to, insert: text + (after.startsWith(closing) ? '' : closing), anchor: from + text.length };
}

export function emptyTemplatePair(source: string, position: number) {
  const start = position - 2;
  if (start < 0 || activeTag(source.slice(0, start))) return null;
  const pair = source.slice(start, position + 2);
  return pair === '{{}}' || pair === '{%%}' ? { from: start, to: position + 2 } : null;
}
