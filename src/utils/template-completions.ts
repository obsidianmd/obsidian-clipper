// Adapted from knap's website/src/lib/playground-completions.ts (MIT).
// Copyright (c) 2026 Obsidian. See LICENSE for the MIT permission notice.
import { tokenize } from 'knap';

export interface FilterParameterSuggestion {
  name: string;
  values: string[];
  property?: boolean;
  repeat?: boolean;
}

export interface TemplateSuggestion {
  label: string;
  type: string;
  detail?: string;
  info?: string;
  boost?: number;
  parameterValues?: string[];
  parameters?: FilterParameterSuggestion[];
  apply?: string;
}

const logic = [
  ['if', 'Start a condition'], ['for', 'Iterate over an array'],
  ['set', 'Assign a variable'], ['elseif', 'Add another condition'],
  ['else', 'Use a fallback branch'], ['endif', 'Close a condition'],
  ['endfor', 'Close a loop'],
].map(([label, detail], index): TemplateSuggestion => ({ label, detail, type: 'keyword', boost: 7 - index }));

const operators = [
  ['==', 'Equal to'], ['!=', 'Not equal to'],
  ['>', 'Greater than'], ['<', 'Less than'],
  ['>=', 'Greater than or equal to'], ['<=', 'Less than or equal to'],
  ['contains', 'String substring or array member'],
  ['and', 'Both sides are true'], ['or', 'Either side is true'],
  ['&&', 'Both sides are true'], ['||', 'Either side is true'],
  ['??', 'Fallback value'], ['|', 'Apply a filter'],
].map(([label, detail], index): TemplateSuggestion => ({ label, detail, type: /^[a-z]/.test(label) ? 'keyword' : 'operator', boost: 13 - index }));

const conditionValues: TemplateSuggestion[] = [
  { label: 'not', type: 'keyword', detail: 'Negate an expression', boost: -2 },
  { label: '!', type: 'operator', detail: 'Negate an expression', boost: -3 },
  ...['true', 'false', 'null'].map((label) => ({ label, type: 'keyword', boost: -1 })),
];

function conditionOperatorRange(body: string, position: number, source: string) {
  const condition = body.match(/^\s*(?:if|elseif)\s+([\s\S]*)$/)?.[1];
  if (condition === undefined) return undefined;
  const partial = condition.match(/[\w$]+$|[!<>=&|?]+$/)?.[0] ?? '';
  const prefix = condition.slice(0, condition.length - partial.length);
  if (prefix.trimEnd().endsWith('.')) return null;
  // Use Knap's tokenizer so strings, numbers, property access, and grouped
  // expressions all have the same boundaries as the actual template language.
  const tokens = tokenize('{{' + prefix + '}}').tokens;
  const last = tokens[tokens.length - 3];
  if (!last || !['identifier', 'string', 'number', 'boolean', 'null', 'rparen', 'rbracket', 'rbrace'].includes(last.type)) return null;
  const suffix = source.slice(position).match(/^[\w$]+|^[!<>=&|?]+/)?.[0] ?? '';
  return { from: position - partial.length, to: position + suffix.length, options: operators };
}

// Scan delimiters outside strings, including unfinished tags while typing.
export function templateTags(source: string) {
  const tags: { from: number; body: string; kind: string; closed: boolean; quoted: boolean }[] = [];
  const opener = /\{[{%#]/g;
  let match: RegExpExecArray | null;
  while ((match = opener.exec(source))) {
    const kind = match[0];
    const close = kind === '{{' ? '}}' : kind === '{%' ? '%}' : '#}';
    const from = match.index + 2;
    let quote = '';
    const groups: string[] = [];
    let index = from;
    for (; index < source.length; index++) {
      const char = source[index];
      if (kind === '{#') {
        if (source.startsWith(close, index)) break;
      } else if (quote) {
        if (char === '\\') index++;
        else if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (!groups.length && (source.startsWith(close, index) || source.startsWith('-' + close, index))) break;
      else if ('([{'.includes(char)) groups.push(({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[char]);
      else if (groups[groups.length - 1] === char) groups.pop();
    }
    const closed = index < source.length;
    tags.push({ from, body: source.slice(from, index).replace(/^-/, ' '), kind, closed, quoted: !!quote });
    opener.lastIndex = index + (source[index] === '-' ? 3 : 2);
  }
  return tags;
}

type Scope = Map<string, unknown[]>;
function resolve(path: string, scope: Scope): unknown[] {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let values = scope.get(parts.shift()!) ?? [];
  for (const part of parts) {
    values = values.flatMap((value) => value !== null && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, part)
      ? [(value as Record<string, unknown>)[part]] : []);
  }
  return values;
}

function scopeAt(source: string, variables: Record<string, unknown>) {
  let scope: Scope = new Map(Object.entries(variables).map(([key, value]) => [key, [value]]));
  const loops: Scope[] = [];
  for (const tag of templateTags(source)) {
    if (!tag.closed || tag.kind !== '{%') continue;
    const loop = tag.body.match(/^\s*for\s+(\w+)\s+in\s+([\w.\[\]]+)\s*$/);
    const assignment = tag.body.match(/^\s*set\s+(\w+)\s*=\s*([\s\S]+?)\s*$/);
    if (loop) {
      const items = resolve(loop[2], scope).flatMap((value) => Array.isArray(value) ? value : []);
      loops.push(scope);
      scope = new Map(scope);
      scope.set(loop[1], items);
      scope.set(`${loop[1]}_index`, [0]);
      scope.set('loop', [{ index: 1, index0: 0, first: true, last: false, length: 0 }]);
    } else if (/^\s*endfor\s*$/.test(tag.body)) {
      scope = loops.pop() ?? scope;
    } else if (assignment) {
      let values = resolve(assignment[2], scope);
      if (!values.length) {
        try { values = [JSON.parse(assignment[2])]; } catch { /* Unknown expression type. */ }
      }
      scope.set(assignment[1], values);
    }
  }
  return scope;
}

function filterParameterCompletions(body: string, position: number, source: string, filters: TemplateSuggestion[], scope: Scope) {
  let pipe = -1;
  let quote = '';
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '|' && body[index - 1] !== '|' && body[index + 1] !== '|') pipe = index;
  }
  if (pipe < 0) return null;
  const filterMatch = body.slice(pipe + 1).match(/^\s*(\w+)\s*:\s*(?:\(\s*)?/);
  if (!filterMatch) return null;
  const filter = filters.find((filter) => filter.label === filterMatch[1]);
  const slots = filter?.parameters ?? (filter?.parameterValues ? [{ name: '', values: filter.parameterValues }] : undefined);
  if (!slots) return null;
  const start = pipe + 1 + filterMatch[0].length;
  let argumentStart = start;
  let argumentIndex = 0;
  let depth = 0;
  quote = '';
  // Only top-level separators advance to the next argument. Colons in
  // replacements are separators; colons in URLs, strings, or objects are not.
  for (let index = start; index < body.length; index++) {
    const char = body[index];
    if (quote) {
      if (char === '\\') index++;
      else if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) { if (--depth < 0) return null; }
    else if (depth === 0 && filterMatch[1] !== 'nth' && (char === ',' || (char === ':' && /^(replace|replace_tags)$/.test(filterMatch[1])))) {
      argumentStart = index + 1;
      argumentIndex++;
    }
  }
  if (depth !== 0) return null;
  const slot = slots[filterMatch[1] === 'replace' ? argumentIndex % 2 : argumentIndex] ?? (slots[slots.length - 1]?.repeat ? slots[slots.length - 1] : undefined);
  if (!slot) return { from: position, to: position, options: [] };
  const argument = body.slice(argumentStart).match(/^\s*(["']?)([\s\S]*)$/)!;
  const openingQuote = argument[1];
  const prefix = argument[2];
  if (openingQuote ? quote !== openingQuote : /[\s"'(){}]/.test(prefix)) return null;
  const from = position - prefix.length;
  let to = position;
  if (openingQuote) {
    while (to < source.length && source[to] !== openingQuote) {
      if (source.startsWith('}}', to) || source.startsWith('%}', to)) break;
      if (source[to] === '\\') to++;
      to++;
    }
  } else {
    to += source.slice(position).match(/^[\w.$*+\/-]*/)?.[0].length ?? 0;
  }
  const values = [...slot.values];
  if (slot.property) {
    const inputPath = body.slice(0, pipe).trim().match(/(?:^|(?:if|elseif|in|=)\s+)([\w$]+(?:\[\d+\]|\.[\w$]+)*)\s*(?:\|[\s\S]*)?$/)?.[1];
    const paths = new Set<string>();
    const visit = (value: unknown, prefix = '', depth = 0) => {
      if (depth > 4 || value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.forEach((item) => visit(item, prefix, depth + 1)); return; }
      for (const [key, child] of Object.entries(value)) {
        if (key.includes('.')) continue;
        const path = prefix ? `${prefix}.${key}` : key;
        paths.add(path);
        visit(child, path, depth + 1);
      }
    };
    if (inputPath) resolve(inputPath, scope).forEach((value) => visit(value));
    values.unshift(...[...paths].map((path) => JSON.stringify(path)));
  }
  const options = [...new Set(values)].map((value, index): TemplateSuggestion => {
    const quoted = value.startsWith('"');
    const label: string = quoted ? JSON.parse(value) : value;
    let apply = value;
    if (openingQuote) {
      apply = label.split('\\').join('\\\\').split(openingQuote).join(`\\${openingQuote}`).split('\n').join('\\n').split('\r').join('\\r');
      if (source[to] !== openingQuote) apply += openingQuote;
    }
    return { label: label.trim() ? label.split('\n').join('\\n') : value, apply, detail: slot.name || undefined, type: 'enum', boost: values.length - index };
  });
  return {
    from, to, options,
  };
}

export function templateCompletions(source: string, position: number, variables: Record<string, unknown>, filters: TemplateSuggestion[]) {
  const before = source.slice(0, position);
  const tags = templateTags(before);
  const tag = tags[tags.length - 1];
  if (!tag || tag.closed || tag.kind === '{#') return null;
  const body = tag.body;
  const scope = scopeAt(source.slice(0, tag.from - 2), variables);
  const parameters = filterParameterCompletions(body, position, source, filters, scope);
  if (parameters) return parameters;
  if (tag.quoted) return null;
  const word = body.match(/[\w$]*$/)![0];
  const from = position - word.length;
  const to = position + source.slice(position).match(/^[\w$]*/)![0].length;
  if (tag.kind === '{%' && /^\s*\w*$/.test(body)) return { from, to, options: logic };
  // A single pipe introduces a filter; || is a logical expression.
  if (/(?:^|[^|])\|\s*\w*$/.test(body)) return { from, to, options: filters };
  if (/^\s*(?:selectorHtml|selector|schema|meta|prompt):/.test(body)) return null;
  if (tag.kind === '{%' && /^\s*(?:for|set)\s+\w*\s*$/.test(body)) return null;

  const operatorResult = tag.kind === '{%' ? conditionOperatorRange(body, position, source) : undefined;
  if (operatorResult) return operatorResult;

  const path = body.match(/([\w$]+(?:\[\d+\]|\.[\w$]+)*)\.[\w$]*$/);
  let options: TemplateSuggestion[];
  if (path) {
    const keys = new Set<string>();
    for (const value of resolve(path[1], scope)) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach((key) => { if (/^[a-zA-Z_$][\w$]*$/.test(key)) keys.add(key); });
      }
    }
    options = [...keys].map((label) => ({ label, type: 'property' }));
  } else {
    options = [...scope.keys()].filter((key) => /^[a-zA-Z_$][\w$]*$/.test(key))
      .map((label) => ({ label, type: 'variable' }));
    if (operatorResult === null) options.push(...conditionValues);
  }
  return { from, to, options };
}
