import { describe, test, expect } from 'vitest';
import { render, renderTemplate, RenderContext } from './renderer';

// Simple filter implementation for testing (direct invocation)
function testApplyFilterDirect(value: string, filterName: string, _paramString: string | undefined, _currentUrl: string): string {
	switch (filterName) {
		case 'lower':
			return value.toLowerCase();
		case 'upper':
			return value.toUpperCase();
		case 'trim':
			return value.trim();
		case 'default':
			if (!value && _paramString) {
				const match = _paramString.match(/^"([^"]+)"$/);
				if (match) return match[1];
			}
			return value;
		case 'echo_param':
			return _paramString ?? '';
		default:
			return value;
	}
}

// Helper to create a basic context
function createContext(variables: Record<string, any> = {}): RenderContext {
	return {
		variables,
		currentUrl: 'https://example.com',
		applyFilterDirect: testApplyFilterDirect,
	};
}

describe('Renderer', () => {
	describe('Text Content', () => {
		test('renders plain text', async () => {
			const result = await render('Hello, world!', createContext());
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello, world!');
		});

		test('renders empty string', async () => {
			const result = await render('', createContext());
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('');
		});
	});

	describe('Variables', () => {
		test('renders simple variable', async () => {
			const ctx = createContext({ '{{title}}': 'Hello' });
			const result = await render('{{title}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello');
		});

		test('renders variable with plain key', async () => {
			const ctx = createContext({ title: 'Hello' });
			const result = await render('{{title}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello');
		});

		test('renders undefined variable as empty', async () => {
			const result = await render('{{missing}}', createContext());
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('');
		});

		test('renders nested property', async () => {
			const ctx = createContext({ author: { name: 'John' } });
			const result = await render('{{author.name}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('John');
		});

		test('renders number variable', async () => {
			const ctx = createContext({ count: 42 });
			const result = await render('{{count}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('42');
		});

		test('renders array as JSON', async () => {
			const ctx = createContext({ items: ['a', 'b', 'c'] });
			const result = await render('{{items}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('["a","b","c"]');
		});
	});

	describe('Filters', () => {
		test('renders variable with filter', async () => {
			const ctx = createContext({ title: 'HELLO' });
			const result = await render('{{title|lower}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('hello');
		});

		test('renders chained filters', async () => {
			const ctx = createContext({ title: '  HELLO  ' });
			const result = await render('{{title|trim|lower}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('hello');
		});

		test('unquoted identifier filter arg falls back to string literal', async () => {
			const ctx = createContext({ title: 'test' });
			const result = await render('{{title|echo_param:YYYY-MM-DD}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('YYYY-MM-DD');
		});

		test('unquoted identifier filter arg uses variable value when defined', async () => {
			const ctx = createContext({ title: 'test', fmt: 'custom-format' });
			ctx.variables['fmt'] = 'custom-format';
			const result = await render('{{title|echo_param:fmt}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('custom-format');
		});

		test('quoted string filter arg still works', async () => {
			const ctx = createContext({ title: 'test' });
			const result = await render('{{title|echo_param:"YYYY-MM-DD"}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('"YYYY-MM-DD"');
		});
	});

	describe('Prompt Templates', () => {
		test('prompt with split filter preserves quoted arg in reconstruction', async () => {
			const ctx = createContext({});
			const result = await render('{{"prompt text"|split:","}}', ctx);
			// Prompt templates are deferred — output should reconstruct the template correctly
			expect(result.hasDeferredVariables).toBe(true);
			expect(result.output).toBe('{{"prompt text"|split:","}}');
		});

		test('prompt with chained filters preserves args in reconstruction', async () => {
			const ctx = createContext({});
			const result = await render('{{"prompt text"|split:","|title|wikilink|join}}', ctx);
			expect(result.hasDeferredVariables).toBe(true);
			expect(result.output).toBe('{{"prompt text"|split:","|title|wikilink|join}}');
		});

		test('prompt with replace filter preserves quoted pairs in reconstruction', async () => {
			const ctx = createContext({});
			const result = await render('{{"prompt text"|replace:"old":"new"}}', ctx);
			expect(result.hasDeferredVariables).toBe(true);
			expect(result.output).toBe('{{"prompt text"|replace:"old":"new"}}');
		});
	});

	describe('If Statements', () => {
		test('renders if with truthy condition', async () => {
			const ctx = createContext({ show: true });
			const result = await render('{% if show %}visible{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('visible');
		});

		test('renders if with falsy condition', async () => {
			const ctx = createContext({ show: false });
			const result = await render('{% if show %}visible{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('');
		});

		test('renders if-else with truthy', async () => {
			const ctx = createContext({ show: true });
			const result = await render('{% if show %}yes{% else %}no{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('yes');
		});

		test('renders if-else with falsy', async () => {
			const ctx = createContext({ show: false });
			const result = await render('{% if show %}yes{% else %}no{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('no');
		});

		test('renders if with string equality', async () => {
			const ctx = createContext({ status: 'active' });
			const result = await render('{% if status == "active" %}on{% else %}off{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('on');
		});

		test('renders if with numeric comparison', async () => {
			const ctx = createContext({ count: 5 });
			const result = await render('{% if count > 0 %}positive{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('positive');
		});

		test('renders if with contains', async () => {
			const ctx = createContext({ title: 'Hello World' });
			const result = await render('{% if title contains "World" %}found{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('found');
		});

		test('renders if with array contains', async () => {
			const ctx = createContext({ tags: ['news', 'tech'] });
			const result = await render('{% if tags contains "tech" %}tech{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('tech');
		});

		test('renders if with and operator', async () => {
			const ctx = createContext({ a: true, b: true });
			const result = await render('{% if a and b %}both{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('both');
		});

		test('renders if with or operator', async () => {
			const ctx = createContext({ a: false, b: true });
			const result = await render('{% if a or b %}either{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('either');
		});

		test('renders if with not operator', async () => {
			const ctx = createContext({ hidden: false });
			const result = await render('{% if not hidden %}visible{% endif %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('visible');
		});

		test('renders elseif chain', async () => {
			const ctx = createContext({ val: 2 });
			const result = await render(
				'{% if val == 1 %}one{% elseif val == 2 %}two{% else %}other{% endif %}',
				ctx
			);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('two');
		});
	});

	describe('For Loops', () => {
		test('renders simple for loop', async () => {
			const ctx = createContext({ items: ['a', 'b', 'c'] });
			const result = await render('{% for item in items %}{{item}}{% endfor %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('a\nb\nc');
		});

		test('renders for loop with index', async () => {
			const ctx = createContext({ items: ['a', 'b'] });
			const result = await render('{% for item in items %}{{item_index}}: {{item}}{% endfor %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toContain('0: a');
			expect(result.output).toContain('1: b');
		});

		test('renders for loop with object properties', async () => {
			const ctx = createContext({
				users: [
					{ name: 'Alice', age: 30 },
					{ name: 'Bob', age: 25 },
				],
			});
			const result = await render('{% for user in users %}{{user.name}}{% endfor %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toContain('Alice');
			expect(result.output).toContain('Bob');
		});

		test('renders empty for loop', async () => {
			const ctx = createContext({ items: [] });
			const result = await render('{% for item in items %}{{item}}{% endfor %}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('');
		});

		test('renders for loop with non-array produces error', async () => {
			const ctx = createContext({ items: 'not-an-array' });
			const result = await render('{% for item in items %}{{item}}{% endfor %}', ctx);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('Set Statements', () => {
		test('renders set statement', async () => {
			const result = await render('{% set name = "John" %}Hello {{name}}', createContext());
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello John');
		});

		test('renders set with existing variable', async () => {
			const ctx = createContext({ '{{title}}': 'Original' });
			const result = await render('{% set name = title %}Name: {{name}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Name: Original');
		});

		test('renders set with filter', async () => {
			const ctx = createContext({ '{{title}}': 'HELLO WORLD' });
			const result = await render('{% set slug = title|lower %}{{slug}}', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('hello world');
		});

		test('renders set with number', async () => {
			const result = await render('{% set count = 42 %}{{count}}', createContext());
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('42');
		});
	});

	describe('Whitespace Control', () => {
		test('renders tags with whitespace trimming', async () => {
			const result = await render('Hello\n{% set x = 1 %}\nWorld', createContext());
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello\nWorld');
		});

		test('renders variables preserving whitespace', async () => {
			const ctx = createContext({ name: 'World' });
			const result = await render('Hello {{ name }}!', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello World!');
		});
	});

	describe('Complex Templates', () => {
		test('renders mixed content', async () => {
			const ctx = createContext({
				'{{name}}': 'John',
				'{{count}}': 3,
			});
			const result = await render('Hello {{name}}, you have {{count}} items.', ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toBe('Hello John, you have 3 items.');
		});

		test('renders nested structures', async () => {
			const ctx = createContext({
				items: [
					{ name: 'Item 1', active: true },
					{ name: 'Item 2', active: false },
					{ name: 'Item 3', active: true },
				],
			});
			const template = '{% for item in items %}{% if item.active %}{{item.name}}{% endif %}{% endfor %}';
			const result = await render(template, ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toContain('Item 1');
			expect(result.output).toContain('Item 3');
		});

		test('renders complete template', async () => {
			const ctx = createContext({
				'{{title}}': 'My Article',
				'{{author}}': 'Jane',
				published: true,
				tags: ['news', 'tech'],
			});
			const template = `# {{title}}
By {{author}}
{% if published %}Published{% else %}Draft{% endif %}
Tags:
{% for tag in tags %}- {{tag}}
{% endfor %}`;
			const result = await render(template, ctx);
			expect(result.errors).toHaveLength(0);
			expect(result.output).toContain('# My Article');
			expect(result.output).toContain('By Jane');
			expect(result.output).toContain('Published');
			expect(result.output).toContain('- news');
			expect(result.output).toContain('- tech');
		});
	});

	describe('Truthiness', () => {
		test('empty string is falsy', async () => {
			const ctx = createContext({ val: '' });
			const result = await render('{% if val %}yes{% else %}no{% endif %}', ctx);
			expect(result.output).toBe('no');
		});

		test('zero is falsy', async () => {
			const ctx = createContext({ val: 0 });
			const result = await render('{% if val %}yes{% else %}no{% endif %}', ctx);
			expect(result.output).toBe('no');
		});

		test('empty array is falsy', async () => {
			const ctx = createContext({ val: [] });
			const result = await render('{% if val %}yes{% else %}no{% endif %}', ctx);
			expect(result.output).toBe('no');
		});

		test('non-empty string is truthy', async () => {
			const ctx = createContext({ val: 'hello' });
			const result = await render('{% if val %}yes{% else %}no{% endif %}', ctx);
			expect(result.output).toBe('yes');
		});

		test('non-zero number is truthy', async () => {
			const ctx = createContext({ val: 42 });
			const result = await render('{% if val %}yes{% else %}no{% endif %}', ctx);
			expect(result.output).toBe('yes');
		});

		test('non-empty array is truthy', async () => {
			const ctx = createContext({ val: [1, 2, 3] });
			const result = await render('{% if val %}yes{% else %}no{% endif %}', ctx);
			expect(result.output).toBe('yes');
		});
	});

	describe('Schema Variables', () => {
		test('schema array access with [*] extracts property from all items', async () => {
			const ctx = createContext({
				'{{schema:director}}': JSON.stringify([
					{ name: 'Christopher Nolan' },
					{ name: 'Denis Villeneuve' },
				]),
			});
			const result = await render('{% for d in schema:director[*].name %}{{d}}{% endfor %}', ctx);
			expect(result.output).toBe('Christopher Nolan\nDenis Villeneuve');
		});

		test('schema array access with [0] extracts property from specific index', async () => {
			const ctx = createContext({
				'{{schema:director}}': JSON.stringify([
					{ name: 'Christopher Nolan' },
					{ name: 'Denis Villeneuve' },
				]),
			});
			const result = await render('{{schema:director[0].name}}', ctx);
			expect(result.output).toBe('Christopher Nolan');
		});

		test('schema array access with [*] without property returns full array', async () => {
			const ctx = createContext({
				'{{schema:director}}': JSON.stringify(['Nolan', 'Villeneuve']),
			});
			const result = await render('{% for d in schema:director[*] %}{{d}}{% endfor %}', ctx);
			expect(result.output).toBe('Nolan\nVilleneuve');
		});

		test('schema shorthand resolution with array access', async () => {
			const ctx = createContext({
				'{{schema:@Movie:director}}': JSON.stringify([
					{ name: 'Christopher Nolan' },
				]),
			});
			const result = await render('{{schema:director[0].name}}', ctx);
			expect(result.output).toBe('Christopher Nolan');
		});

		test('schema simple variable', async () => {
			const ctx = createContext({
				'{{schema:genre}}': 'Science Fiction',
			});
			const result = await render('{{schema:genre}}', ctx);
			expect(result.output).toBe('Science Fiction');
		});

		test('schema JSON array is parsed', async () => {
			const ctx = createContext({
				'{{schema:genre}}': JSON.stringify(['Sci-Fi', 'Action']),
			});
			const result = await render('{% for g in schema:genre %}{{g}}{% endfor %}', ctx);
			expect(result.output).toBe('Sci-Fi\nAction');
		});
	});

	describe('Map Filter', () => {
		test('map extracts property from array of objects', async () => {
			const ctx = createContext({
				items: [{ gem: 'obsidian', color: 'black' }, { gem: 'amethyst', color: 'purple' }],
			});
			// Use the real filter infrastructure via renderTemplate
			const output = await renderTemplate(
				'{{items|map:item => item.gem}}',
				{ items: JSON.stringify(ctx.variables.items) },
			);
			expect(output).toBe('["obsidian","amethyst"]');
		});

		test('map with object literal expression', async () => {
			const items = [{ gem: 'obsidian', color: 'black' }, { gem: 'amethyst', color: 'purple' }];
			const output = await renderTemplate(
				'{{items|map:item => ({name: item.gem, color: item.color})}}',
				{ items: JSON.stringify(items) },
			);
			const parsed = JSON.parse(output);
			expect(parsed).toEqual([
				{ name: 'obsidian', color: 'black' },
				{ name: 'amethyst', color: 'purple' },
			]);
		});

		test('map with string literal expression', async () => {
			const output = await renderTemplate(
				'{{items|map:item => "genres/${item}"}}',
				{ items: JSON.stringify(['rock', 'pop']) },
			);
			const parsed = JSON.parse(output);
			expect(parsed).toEqual(['genres/rock', 'genres/pop']);
		});

		test('map with string literal piped to template', async () => {
			const output = await renderTemplate(
				'{{items|map:item => "genres/${item}"|template:"- ${str}"}}',
				{ items: JSON.stringify(['rock', 'pop']) },
			);
			expect(output).toBe('- genres/rock\n\n- genres/pop');
		});

		test('map property then join with newlines', async () => {
			const highlights = [
				{"text":"First highlight text","timestamp":"2026-02-25T15:40:05.762Z"},
				{"text":"Second highlight text","timestamp":"2026-02-25T15:40:05.762Z"}
			];
			const output = await renderTemplate(
				'{{highlights|map: item => item.text|join:"\\n\\n"}}',
				{ highlights: JSON.stringify(highlights) },
			);
			expect(output).toBe('First highlight text\n\nSecond highlight text');
		});
	});

	describe('Convenience Function', () => {
		test('renderTemplate convenience function works', async () => {
			const output = await renderTemplate('Hello {{name}}!', { name: 'World' });
			expect(output).toBe('Hello World!');
		});
	});
});
