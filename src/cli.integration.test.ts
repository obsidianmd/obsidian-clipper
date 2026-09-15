import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const projectRoot = resolve(__dirname, '..');
const cliPath = join(projectRoot, 'dist', 'cli.cjs');
let testDirectory = '';

beforeAll(() => {
	execFileSync(process.execPath, [join(projectRoot, 'scripts', 'build-cli.mjs')], {
		cwd: projectRoot,
		stdio: 'pipe',
	});
	testDirectory = mkdtempSync(join(tmpdir(), 'obsidian-clipper-cli-test-'));
});

afterAll(() => {
	if (testDirectory) {
		rmSync(testDirectory, { recursive: true, force: true });
	}
});

describe('CLI integration', () => {
	test('matches a schema template and extracts the article', () => {
		const templatesDirectory = join(testDirectory, 'templates');
		const htmlPath = join(projectRoot, 'src', 'utils', 'fixtures', 'templates', 'schema-rich.html');
		const outputPath = join(testDirectory, 'article.md');
		mkdirSync(templatesDirectory);

		writeFileSync(join(templatesDirectory, 'recipe.json'), JSON.stringify({
			id: 'recipe',
			name: 'Recipe',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings',
			noteContentFormat: '# {{title}}\n\n{{content}}',
			properties: [
				{ name: 'source', value: '{{url}}', type: 'text' },
			],
			triggers: ['schema:@Recipe'],
		}, null, 2));

		const processResult = spawnSync(process.execPath, [
			cliPath,
			'https://example.com/recipe/chocolate-cake',
			'--template', templatesDirectory,
			'--html', htmlPath,
			'--output', outputPath,
		], {
			cwd: projectRoot,
			encoding: 'utf8',
		});

		expect(processResult.status).toBe(0);
		expect(processResult.stderr).toContain('Matched template:');

		const output = readFileSync(outputPath, 'utf8');
		expect(output).toContain('# Best Chocolate Cake Recipe');
		expect(output).toContain("This is the most amazing chocolate cake you'll ever make.");
	});
});
