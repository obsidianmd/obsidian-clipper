// Renderer tests
// Run with: npx ts-node --compilerOptions '{"module":"CommonJS"}' src/utils/renderer.test.ts

import { render, renderTemplate, RenderContext } from './renderer';

// ============================================================================
// Test Utilities
// ============================================================================

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>): void {
	fn().then(() => {
		passed++;
		console.log(`✓ ${name}`);
	}).catch((error) => {
		failed++;
		console.log(`✗ ${name}`);
		console.log(`  ${error}`);
	});
}

function expect(actual: any) {
	return {
		toBe(expected: any) {
			if (actual !== expected) {
				throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
			}
		},
		toEqual(expected: any) {
			const actualStr = JSON.stringify(actual);
			const expectedStr = JSON.stringify(expected);
			if (actualStr !== expectedStr) {
				throw new Error(`Expected ${expectedStr}, got ${actualStr}`);
			}
		},
		toContain(expected: string) {
			if (typeof actual !== 'string' || !actual.includes(expected)) {
				throw new Error(`Expected "${actual}" to contain "${expected}"`);
			}
		},
		toHaveLength(expected: number) {
			if (actual.length !== expected) {
				throw new Error(`Expected length ${expected}, got ${actual.length}`);
			}
		},
	};
}

// Simple filter implementation for testing
function testApplyFilters(value: string, filters: string, _currentUrl: string): string {
	if (!filters) return value;

	const filterParts = filters.split('|');
	let result = value;

	for (const part of filterParts) {
		const [filterName] = part.split(':');
		switch (filterName.trim()) {
			case 'lower':
				result = result.toLowerCase();
				break;
			case 'upper':
				result = result.toUpperCase();
				break;
			case 'trim':
				result = result.trim();
				break;
			case 'default':
				// Simple default implementation
				if (!result) {
					const match = part.match(/default:"([^"]+)"/);
					if (match) result = match[1];
				}
				break;
			default:
				// Unknown filter, return as-is
				break;
		}
	}

	return result;
}

// Helper to create a basic context
function createContext(variables: Record<string, any> = {}): RenderContext {
	return {
		variables,
		currentUrl: 'https://example.com',
		applyFilters: testApplyFilters,
	};
}

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
	console.log('\n=== Renderer Tests ===\n');

	// --- Text Content ---

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

	// --- Variables ---

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

	// --- Filters ---

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

	// --- If Statements ---

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

	// --- For Loops ---

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
		expect(result.errors.length > 0).toBe(true);
	});

	// --- Set Statements ---

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

	// --- Whitespace Control ---

	test('renders with trim right', async () => {
		const result = await render('{% set x = 1 -%}\nHello', createContext());
		expect(result.errors).toHaveLength(0);
		expect(result.output).toBe('Hello');
	});

	test('renders with trim left on variable', async () => {
		const ctx = createContext({ name: 'World' });
		const result = await render('Hello {{- name }}', ctx);
		expect(result.errors).toHaveLength(0);
		// trimLeft is handled by the caller stripping trailing whitespace from previous node
		expect(result.output).toBe('Hello World');
	});

	// --- Complex Templates ---

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

	// --- Truthiness ---

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

	// --- Convenience Function ---

	test('renderTemplate convenience function works', async () => {
		const output = await renderTemplate('Hello {{name}}!', { name: 'World' });
		expect(output).toBe('Hello World!');
	});

	// Wait for all tests to complete
	await new Promise(resolve => setTimeout(resolve, 500));

	console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

	if (failed > 0) {
		process.exit(1);
	}
}

runTests();
