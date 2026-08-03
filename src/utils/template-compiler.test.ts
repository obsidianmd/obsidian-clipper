import { describe, test, expect } from 'vitest';
import { compileTemplate } from './template-compiler';

const URL = 'https://www.bbc.co.uk/news/article';

function compile(template: string, variables: Record<string, string>) {
	return compileTemplate(0, template, variables, URL);
}

describe('compileTemplate', () => {
	describe('Regex Filter Arguments', () => {
		test('applies an unquoted regex literal', async () => {
			const output = await compile('{{domain|replace:/^www\\./:""}}', { '{{domain}}': 'www.bbc.co.uk' });
			expect(output).toBe('bbc.co.uk');
		});

		test('applies a quoted regex literal the same way', async () => {
			const output = await compile('{{domain|replace:"/^www\\./":""}}', { '{{domain}}': 'www.bbc.co.uk' });
			expect(output).toBe('bbc.co.uk');
		});

		test('honours regex flags', async () => {
			const output = await compile('{{title|replace:/hello/gi:"hi"}}', { '{{title}}': 'Hello hello' });
			expect(output).toBe('hi hi');
		});

		test('supports alternation inside the literal', async () => {
			const output = await compile('{{domain|replace:/^(www|m)\\./:""}}', { '{{domain}}': 'm.example.com' });
			expect(output).toBe('example.com');
		});

		test('keeps surrounding text when a regex literal is used in a path', async () => {
			const output = await compile('Clippings/{{domain|replace:/^www\\./:""|split:"."|first}}', {
				'{{domain}}': 'www.bbc.co.uk',
			});
			expect(output).toBe('Clippings/bbc');
		});

		test('still treats a bare slash as a separator argument', async () => {
			const output = await compile('{{path|split:/|join:"-"}}', { '{{path}}': 'a/b/c' });
			expect(output).toBe('a-b-c');
		});
	});

	describe('root_domain Filter', () => {
		test('resolves the registrable domain in a path', async () => {
			const output = await compile('Clippings/{{domain|root_domain|split:"."|first}}', {
				'{{domain}}': 'news.ycombinator.com',
			});
			expect(output).toBe('Clippings/ycombinator');
		});
	});
});
