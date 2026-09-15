// Argument suggestions from knap's website/lib/filter-completions.ts (MIT).
// Copyright (c) 2026 Obsidian. See LICENSE for the MIT permission notice.
import { standardFilters } from 'knap';
import { htmlFilters } from 'knap/html';
import type { FilterParameterSuggestion, TemplateSuggestion } from './template-completions';

const text = (name: string, ...values: string[]): FilterParameterSuggestion => ({ name, values: values.map((value) => JSON.stringify(value)) });
const raw = (name: string, ...values: string[]): FilterParameterSuggestion => ({ name, values });
const property = (name = 'Property'): FilterParameterSuggestion => ({ ...text(name, 'name'), property: true });
const language = text('Language', 'typescript', 'javascript', 'json', 'yaml', 'markdown', 'html', 'css', 'python', 'bash', 'sql', 'text');
const marker = raw('Marker', '*', '_');
const attributes = { ...text('Attribute', 'class', 'style', 'id', 'href', 'src', 'title', 'alt'), repeat: true };
const htmlTags = { ...text('Tag', 'div', 'span', 'p', 'a', 'b', 'strong', 'em', 'script', 'style'), repeat: true };
const formats = text('Format', 'YYYY-MM-DD', 'MMMM D, YYYY', 'YYYY-MM-DD HH:mm', 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DDTHH:mm:ssZ');

// Each slot describes an argument, rather than a complete parameter list.
// Values for unrestricted strings/numbers are editable examples, not restrictions.
export const filterParameters: Record<string, FilterParameterSuggestion[]> = {
  date: [formats, { ...formats, name: 'Data format' }],
  date_modify: [text('Interval', ...['year', 'month', 'week', 'day', 'hour', 'minute', 'second'].flatMap((unit) => [`+1 ${unit}`, `-1 ${unit}`]))],
  duration: [text('Format', 'HH:mm:ss', 'H:mm:ss', 'mm:ss', 'H', 'HH', 'm', 'mm', 's', 'ss')],
  replace: [text('Search', 'old', '/[aeiou]/g'), text('Replacement', 'new', '')],
  safe_name: [raw('Operating system', 'windows', 'mac', 'linux')],
  indent: [raw('Spaces', '2', '4', '0', '8')],
  truncate: [raw('Character limit', '100', '50', '200'), text('Suffix', '…', '...', '')],
  truncatewords: [raw('Word limit', '20', '50', '100'), text('Suffix', '…', '...', '')],
  bold: [marker], italic: [marker],
  callout: [text('Type', 'info', 'note', 'abstract', 'todo', 'tip', 'success', 'question', 'warning', 'failure', 'danger', 'bug', 'example', 'quote'), text('Title', 'Title', ''), raw('Collapsed', 'true', 'false')],
  code: [language], code_block: [language],
  embed: [text('Alias', 'Preview')], wikilink: [text('Alias', 'Alias')],
  fragment_link: [text('Source URL', 'https://example.com', 'Source:https://example.com')],
  highlight: [raw('Color', 'red', 'orange', 'yellow', 'green', 'blue', 'purple')],
  hr: [raw('Position', 'after', 'before', 'both')],
  image: [text('Alt text', 'Alt text')], link: [text('Link text', 'Link text')],
  list: [raw('List type', 'numbered', 'task', 'numbered-task')],
  table: [{ ...text('Column header', 'Column 1', 'Column 2'), property: true, repeat: true }],
  table_pretty: [{ ...text('Column header', 'Column 1', 'Column 2'), property: true, repeat: true }],
  yaml: [raw('Style', 'flow')], yaml_property: [text('Property name', 'name')],
  calc: [text('Expression', '+10', '-10', '*2', '/2', '**2', '^2')],
  number_format: [raw('Decimal places', '2', '0', '1'), text('Decimal separator', '.', ','), text('Thousands separator', ',', '.', ' ', '')],
  round: [raw('Decimal places', '2', '0', '1')],
  join: [text('Separator', ', ', ',', '\n', ' ', '')],
  map: [{ ...property('Property or expression'), values: ['"name"', 'item => item.name', 'item => ({name: item.name})', 'item => "prefix/${item}"'] }],
  merge: [{ ...text('Value', 'value'), repeat: true }],
  nth: [raw('Pattern', '3', '2n', 'n+3', '2,3:4')],
  object: [text('Mode', 'keys', 'values', 'array')],
  slice: [raw('Start index', '0', '1', '-1'), raw('End index', '4', '5', '-1')],
  sort: [{ ...property('Property or direction'), values: ['"asc"', '"desc"'] }, text('Direction', 'asc', 'desc')],
  split: [text('Separator or pattern', ',', ' ', '\n', '[0-9]')],
  sum: [property()],
  template: [text('Item template', '${name}', '${str}')],
  where: [property(), raw('Value', 'true', 'false', 'null', '0', '1', '"draft"')],
  remove_attr: [attributes], strip_attr: [attributes],
  remove_tags: [htmlTags], strip_tags: [htmlTags],
  replace_tags: [text('Original tag', 'strong', 'b', 'div'), text('Replacement tag', 'h2', 'em', 'p')],
  remove_html: [{ ...text('Selector', 'script', '.ad', '#promo'), repeat: true }],
};

export const templateFilterSuggestions: TemplateSuggestion[] = Object.keys({
	...standardFilters, ...htmlFilters, markdown: true,
}).map(label => ({
	label, type: 'function', parameters: filterParameters[label],
	detail: filterParameters[label]?.map(parameter => parameter.name).join(', '),
}));
