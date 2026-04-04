import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename, extname } from 'path';
import { parseHTML } from 'linkedom';
import DefuddleClass from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { buildVariables, generateFrontmatter, formatPropertyValue } from './shared';
import { compileTemplate } from './template-compiler';
import { createAsyncResolver, createSelectorProcessor } from '../api';
import { resolvePageMetadata } from './page-metadata';

// ---------------------------------------------------------------------------
// Freeze time so {{date}} is deterministic in expected output
// ---------------------------------------------------------------------------

const FROZEN_DATE = new Date('2025-01-15T12:00:00Z');

beforeAll(() => { vi.useFakeTimers({ now: FROZEN_DATE }); });
afterAll(() => { vi.useRealTimers(); });

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

interface FixtureTemplate {
	noteNameFormat: string;
	noteContentFormat: string;
	properties: { name: string; value: string; type: string }[];
}

async function runFixture(html: string, url: string, template: FixtureTemplate): Promise<string> {
	const { document } = parseHTML(html);

	// Run defuddle — same as CLI
	const defuddle = new DefuddleClass(document as unknown as Document, { url });
	const defuddleResult = defuddle.parse();
	const resolvedMetadata = resolvePageMetadata({
		url,
		document: document as unknown as Document,
		title: defuddleResult.title,
		author: defuddleResult.author,
		published: defuddleResult.published,
		contentHtml: defuddleResult.content,
		metaTags: defuddleResult.metaTags,
	});
	const markdownContent = createMarkdownContent(defuddleResult.content, url);

	// Build variables from defuddle output — same as CLI
	const variables = buildVariables({
		title: resolvedMetadata.title,
		author: resolvedMetadata.author,
		authorUrl: resolvedMetadata.authorUrl,
		content: markdownContent,
		contentHtml: defuddleResult.content,
		url,
		fullHtml: html,
		description: defuddleResult.description,
		favicon: defuddleResult.favicon,
		image: defuddleResult.image,
		published: resolvedMetadata.published,
		site: defuddleResult.site,
		language: defuddleResult.language,
		wordCount: defuddleResult.wordCount,
		schemaOrgData: defuddleResult.schemaOrgData,
		metaTags: defuddleResult.metaTags,
		extractedContent: defuddleResult.variables,
	});

	const asyncResolver = createAsyncResolver(document);
	const selectorProcessor = createSelectorProcessor(document);

	const compileFn = (text: string) =>
		compileTemplate(0, text, variables, url, asyncResolver, selectorProcessor);

	// Compile properties with type-aware formatting
	const compiledProperties = await Promise.all(
		template.properties.map(async (prop) => {
			let value = await compileFn(prop.value);
			value = formatPropertyValue(value, prop.type, prop.value);
			return { name: prop.name, value };
		})
	);

	// Build type map from template properties
	const typeMap: Record<string, string> = {};
	for (const prop of template.properties) {
		if (prop.type) {
			typeMap[prop.name] = prop.type;
		}
	}

	const frontmatter = generateFrontmatter(compiledProperties, typeMap);
	const compiledContent = await compileFn(template.noteContentFormat);

	return frontmatter ? frontmatter + compiledContent : compiledContent;
}

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(__dirname, 'fixtures', 'templates');
const EXPECTED_DIR = join(__dirname, 'fixtures', 'expected');

function getFixtures(): Array<{ name: string; jsonPath: string; htmlPath: string }> {
	const files = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
	return files.map(file => {
		const name = basename(file, extname(file));
		return {
			name,
			jsonPath: join(FIXTURES_DIR, file),
			htmlPath: join(FIXTURES_DIR, `${name}.html`),
		};
	});
}

function loadExpected(name: string): string | null {
	const expectedPath = join(EXPECTED_DIR, `${name}.md`);
	return existsSync(expectedPath) ? readFileSync(expectedPath, 'utf-8') : null;
}

function saveExpected(name: string, content: string): void {
	if (!existsSync(EXPECTED_DIR)) {
		mkdirSync(EXPECTED_DIR, { recursive: true });
	}
	writeFileSync(join(EXPECTED_DIR, `${name}.md`), content, 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Template fixtures', () => {
	const fixtures = getFixtures();

	test('should have fixtures to test', () => {
		expect(fixtures.length).toBeGreaterThan(0);
	});

	test.each(fixtures)('$name', async ({ name, jsonPath, htmlPath }) => {
		const template: FixtureTemplate = JSON.parse(readFileSync(jsonPath, 'utf-8'));
		const html = readFileSync(htmlPath, 'utf-8');

		// Extract URL from HTML comment: <!-- {"url": "..."} -->
		const frontmatterMatch = html.match(/<!--\s*(\{"url":.*?\})\s*-->/);
		const frontmatter = frontmatterMatch ? JSON.parse(frontmatterMatch[1]) : {};
		const url = frontmatter.url || 'https://example.com';

		const result = await runFixture(html, url, template);
		const expected = loadExpected(name);

		if (!expected) {
			if (process.env.UPDATE_FIXTURES) {
				saveExpected(name, result);
				console.log(`Created baseline for ${name}`);
				return;
			}
			throw new Error(
				`No expected output for fixture "${name}". ` +
				`Run with UPDATE_FIXTURES=1 to create it.`
			);
		}

		expect(result.trim()).toEqual(expected.trim());
	});
});
