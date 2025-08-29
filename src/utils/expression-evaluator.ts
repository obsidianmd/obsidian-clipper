import { processSchema } from './variables/schema';

// Helper: JS-like truthiness
export function isTruthy(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

type Token =
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'string'; value: string }
  | { type: 'number'; value: number }
  | { type: 'bool'; value: boolean }
  | { type: 'ident'; value: string };

const OP_CHARS = new Set(['=', '!', '>', '<', '&', '|']);
const OP_TOKENS = new Set(['==', '!=', '>=', '<=', '>', '<', '&&', '||', '!', 'and', 'or', 'not']);

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function isDigit(ch: string): boolean {
  return /[0-9]/.test(ch);
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  // allow ., :, @, _, -, and brackets for array access like foo[0]
  return /[A-Za-z0-9_:\.@\-\[\]]/.test(ch);
}

function readString(input: string, i: number): { token: Token; next: number } {
  const quote = input[i];
  let j = i + 1;
  let out = '';
  while (j < input.length) {
    const ch = input[j];
    if (ch === '\\') {
      if (j + 1 < input.length) {
        out += input[j + 1];
        j += 2;
        continue;
      }
    }
    if (ch === quote) {
      return { token: { type: 'string', value: out }, next: j + 1 };
    }
    out += ch;
    j++;
  }
  // Unclosed string; treat as until end
  return { token: { type: 'string', value: out }, next: j };
}

function readNumber(input: string, i: number): { token: Token; next: number } {
  let j = i;
  let seenDot = false;
  while (j < input.length) {
    const ch = input[j];
    if (ch === '.') {
      if (seenDot) break;
      seenDot = true;
      j++;
      continue;
    }
    if (!isDigit(ch)) break;
    j++;
  }
  const num = Number(input.slice(i, j));
  return { token: { type: 'number', value: num }, next: j };
}

function readIdentOrOp(input: string, i: number): { token: Token; next: number } {
  // try double-char ops first
  const two = input.slice(i, i + 2);
  if (OP_TOKENS.has(two)) return { token: { type: 'op', value: two }, next: i + 2 };
  const one = input[i];
  if (OP_TOKENS.has(one)) return { token: { type: 'op', value: one }, next: i + 1 };

  // identifier-like (including schema:, dotted paths, etc.)
  let j = i;
  if (isIdentStart(input[j]) || input[j] === '$' || input[j] === ':' || input[j] === '.') {
    j++;
    while (j < input.length && isIdentPart(input[j])) j++;
    const raw = input.slice(i, j);
    const lower = raw.toLowerCase();
    if (lower === 'true') return { token: { type: 'bool', value: true }, next: j };
    if (lower === 'false') return { token: { type: 'bool', value: false }, next: j };
    if (OP_TOKENS.has(lower)) return { token: { type: 'op', value: lower }, next: j };
    return { token: { type: 'ident', value: raw }, next: j };
  }

  // fallback single-char operator
  return { token: { type: 'op', value: one }, next: i + 1 };
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (isWhitespace(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const { token, next } = readString(input, i);
      tokens.push(token);
      i = next;
      continue;
    }
    if (isDigit(ch)) {
      const { token, next } = readNumber(input, i);
      tokens.push(token);
      i = next;
      continue;
    }
    if (OP_CHARS.has(ch) || isIdentStart(ch) || ch === '$' || ch === ':' || ch === '.') {
      const { token, next } = readIdentOrOp(input, i);
      tokens.push(token);
      i = next;
      continue;
    }
    // Unknown char, skip
    i++;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  next(): Token | undefined {
    return this.tokens[this.pos++];
  }
  matchOp(value: string): boolean {
    const t = this.peek();
    if (t && t.type === 'op' && t.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }
}

async function evalIdent(value: string, variables: { [key: string]: any }, currentUrl: string): Promise<any> {
  const trimmed = value.trim();
  if (trimmed.startsWith('schema:')) {
    const schemaValue = await processSchema(`{{${trimmed}}}`, variables, currentUrl);
    try {
      return JSON.parse(schemaValue);
    } catch {
      return schemaValue;
    }
  }

  // Nested access like a.b[0].c
  const segments = [] as string[];
  let i = 0;
  while (i < trimmed.length) {
    let j = i;
    // read until dot or bracket
    while (j < trimmed.length && trimmed[j] !== '.' && trimmed[j] !== '[') j++;
    if (j > i) segments.push(trimmed.slice(i, j));
    if (j >= trimmed.length) break;
    if (trimmed[j] === '.') {
      i = j + 1;
      continue;
    }
    // bracket access
    if (trimmed[j] === '[') {
      const end = trimmed.indexOf(']', j + 1);
      if (end === -1) break;
      const indexStr = trimmed.slice(j + 1, end).trim();
      segments.push(indexStr);
      i = end + 1;
      if (i < trimmed.length && trimmed[i] === '.') i++;
    }
  }

  let obj: any = variables;
  for (const key of segments) {
    if (obj == null) return undefined;
    const idx = Number(key);
    if (!Number.isNaN(idx) && Array.isArray(obj)) {
      obj = obj[idx];
    } else {
      obj = obj[key as keyof typeof obj];
    }
  }
  if (obj !== undefined) return obj;
  // Fallbacks: plain key, then "{{key}}"
  if (trimmed in variables) return variables[trimmed];
  const curlyKey = `{{${trimmed}}}`;
  if (curlyKey in variables) return variables[curlyKey];
  return undefined;
}

async function parsePrimary(p: Parser, variables: { [key: string]: any }, currentUrl: string): Promise<any> {
  const t = p.peek();
  if (!t) return undefined;
  if (t.type === 'paren' && t.value === '(') {
    p.next();
    const val = await parseOr(p, variables, currentUrl);
    // consume closing paren if present
    if (p.peek() && p.peek()!.type === 'paren' && (p.peek() as any).value === ')') p.next();
    return val;
  }
  if (t.type === 'string') {
    p.next();
    return t.value;
  }
  if (t.type === 'number') {
    p.next();
    return t.value;
  }
  if (t.type === 'bool') {
    p.next();
    return t.value;
  }
  if (t.type === 'ident') {
    p.next();
    return await evalIdent(t.value, variables, currentUrl);
  }
  // Unknown token, consume and ignore
  p.next();
  return undefined;
}

async function parseComparison(p: Parser, variables: { [key: string]: any }, currentUrl: string): Promise<any> {
  let left = await parsePrimary(p, variables, currentUrl);
  const t = p.peek();
  if (t && t.type === 'op' && (t.value === '==' || t.value === '!=' || t.value === '>' || t.value === '<' || t.value === '>=' || t.value === '<=')) {
    const op = t.value;
    p.next();
    const right = await parsePrimary(p, variables, currentUrl);
    switch (op) {
      case '==':
        return (left as any) == (right as any);
      case '!=':
        return (left as any) != (right as any);
      case '>':
        return Number(left) > Number(right);
      case '<':
        return Number(left) < Number(right);
      case '>=':
        return Number(left) >= Number(right);
      case '<=':
        return Number(left) <= Number(right);
    }
  }
  return left;
}

async function parseNot(p: Parser, variables: { [key: string]: any }, currentUrl: string): Promise<any> {
  let negate = false;
  while (true) {
    const t = p.peek();
    if (t && t.type === 'op' && (t.value === 'not' || t.value === '!')) {
      negate = !negate;
      p.next();
    } else {
      break;
    }
  }
  const val = await parseComparison(p, variables, currentUrl);
  const b = isTruthy(val);
  return negate ? !b : b;
}

async function parseAnd(p: Parser, variables: { [key: string]: any }, currentUrl: string): Promise<boolean> {
  let left = await parseNot(p, variables, currentUrl);
  while (true) {
    const t = p.peek();
    if (t && t.type === 'op' && (t.value === 'and' || t.value === '&&')) {
      p.next();
      const right = await parseNot(p, variables, currentUrl);
      left = isTruthy(left) && isTruthy(right);
    } else {
      break;
    }
  }
  return isTruthy(left);
}

async function parseOr(p: Parser, variables: { [key: string]: any }, currentUrl: string): Promise<boolean> {
  let left = await parseAnd(p, variables, currentUrl);
  while (true) {
    const t = p.peek();
    if (t && t.type === 'op' && (t.value === 'or' || t.value === '||')) {
      p.next();
      const right = await parseAnd(p, variables, currentUrl);
      left = isTruthy(left) || isTruthy(right);
    } else {
      break;
    }
  }
  return isTruthy(left);
}

export async function evaluateBoolean(
  expression: string,
  variables: { [key: string]: any },
  currentUrl: string
): Promise<boolean> {
  const tokens = tokenize(expression);
  const parser = new Parser(tokens);
  const result = await parseOr(parser, variables, currentUrl);
  return isTruthy(result);
}

export async function evaluateExpression(
  expression: string,
  variables: { [key: string]: any },
  currentUrl: string
): Promise<any> {
  // If expression contains any boolean/logical/comparison syntax, use full parser
  // But first check if it's a quoted string - if so, skip logic parsing
  const exprTrimmed = expression.trim();
  const isQuotedString = (exprTrimmed.startsWith('"') && exprTrimmed.endsWith('"')) || (exprTrimmed.startsWith("'") && exprTrimmed.endsWith("'"));
  const hasLogic = !isQuotedString && /(\b(?:and|or|not)\b|&&|\|\||!|==|!=|>=|<=|>|<|\(|\))/.test(expression);
  if (hasLogic) {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens);
    // parseOr returns boolean, but comparisons may return boolean as well; for non-logic identifiers it falls back to primary
    const result = await parseOr(parser, variables, currentUrl);
    return result;
  }

  // Fallback simple evaluation: string/number/bool/identifier
  const trimmed = expression.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (!isNaN(Number(trimmed))) {
    return Number(trimmed);
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return await evalIdent(trimmed, variables, currentUrl);
}
