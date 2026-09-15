import { describe, expect, it } from 'vitest';
import { templateCompletions } from './template-completions';
import { templateFilterSuggestions } from './template-filter-completions';
import { pairTemplateInput, emptyTemplatePair } from './template-pairs';

const variables = { title: '', authors: [{ name: 'Sam' }] };
const complete = (source: string, position = source.length) => templateCompletions(source, position, variables, templateFilterSuggestions);
const labels = (source: string) => complete(source)?.options.map(option => option.label);

describe('template completions adapted from the knap playground', () => {
	it('replaces the whole variable without disturbing surrounding text', () => {
		expect(complete('Note {{ title }}.md', 10)).toMatchObject({ from: 8, to: 13 });
		expect(labels('{{ ti')).toContain('title');
	});
	it('includes Clipper HTML filters and parameter completions', () => {
		expect(labels('{{ title|')).toEqual(expect.arrayContaining(['upper', 'markdown', 'remove_html', 'html_to_json']));
		expect(labels('{{ title|date:"')).toContain('YYYY-MM-DD');
		expect(labels('{{ title|callout:("note", "Title", ')).toEqual(['true', 'false']);
	});
	it('completes logic, loop locals, and assigned variables', () => {
		expect(labels('{% en')).toEqual(expect.arrayContaining(['endfor', 'endif']));
		expect(labels('{% for author in authors %}{{ author.')).toEqual(['name']);
		expect(labels('{% for author in authors %}{{ loop.')).toContain('index');
		expect(labels('{% for author in authors %}{% endfor %}{{ ')).not.toContain('author');
		expect(labels('{% set heading = title %}{{ ')).toContain('heading');
	});
	it('supports whitespace trimming and conditional operators', () => {
		expect(labels('{%- if title co')).toContain('contains');
		expect(labels('{%- for author in authors -%}{{ author.')).toEqual(['name']);
	});
	it.each(['plain text', '{{title}} text', '{{ "quoted', '{# {{ ti', '{# {{title}} #} text', '{{selector:article', '{{schema:@Article:'])('avoids irrelevant suggestions in %s', source => {
		expect(complete(source)).toBeNull();
	});
	it('still completes filters after a Clipper resolver', () => {
		expect(labels('{{selector:article|')).toContain('markdown');
	});
	it('pairs template delimiters and deletes empty pairs', () => {
		expect(pairTemplateInput('{', 1, 1, '{')).toMatchObject({ insert: '{}}', anchor: 2 });
		expect(pairTemplateInput('{{}}', 2, 2, '}')).toMatchObject({ insert: '', anchor: 3 });
		expect(emptyTemplatePair('{{}}', 2)).toEqual({ from: 0, to: 4 });
		expect(pairTemplateInput('{# {', 4, 4, '{')).toBeNull();
	});
});
