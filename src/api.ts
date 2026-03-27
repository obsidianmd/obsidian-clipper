// Programmatic API for Obsidian Web Clipper.
// Environment-agnostic — no Node.js or browser dependencies.
// The caller provides a DocumentParser for their environment.

import DefuddleClass from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { compileTemplate, SelectorProcessor } from './utils/template-compiler';
import { AsyncResolver, RenderContext } from './utils/renderer';
import { applyFilters } from './utils/filters';
import { buildVariables, generateFrontmatter, extractContentBySelector, selectorContentToString, formatPropertyValue } from './utils/shared';
import { sanitizeFileName } from './utils/string-utils';
import { Template, Property } from './types/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DocumentParser {
	parseFromString(html: string, mimeType: string): any;
}

export interface ClipOptions {
	html: string;
	url: string;
	template: Template;
	documentParser: DocumentParser;
	propertyTypes?: Record<string, string>;
	/** Pre-parsed document to skip re-parsing (e.g. when already parsed for trigger matching). */
	parsedDocument?: any;
}

export interface ClipResult {
	noteName: string;
	frontmatter: string;
	content: string;
	fullContent: string;
	properties: Property[];
	variables: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Selector resolvers (work on any { querySelectorAll } document)
// ---------------------------------------------------------------------------

type DocLike = { querySelectorAll: (selector: string) => any };

export function createAsyncResolver(doc: DocLike): AsyncResolver {
	return async (name: string, _context: RenderContext): Promise<any> => {
		if (name.startsWith('selector:') || name.startsWith('selectorHtml:')) {
			const extractHtml = name.startsWith('selectorHtml:');
			const prefix = extractHtml ? 'selectorHtml:' : 'selector:';
			const selectorPart = name.slice(prefix.length);

			const attrMatch = selectorPart.match(/^(.+?)\?(.+)$/);
			const selector = attrMatch ? attrMatch[1] : selectorPart;
			const attribute = attrMatch ? attrMatch[2] : undefined;

			return extractContentBySelector(
				doc,
				selector.replace(/\\"/g, '"'),
				attribute,
				extractHtml
			);
		}
		return undefined;
	};
}

export function createSelectorProcessor(doc: DocLike): SelectorProcessor {
	return async (match: string, currentUrl: string): Promise<string> => {
		const selectorRegex = /{{(selector|selectorHtml):(.*?)(?:\?(.*?))?(?:\|(.*?))?}}/;
		const matches = match.match(selectorRegex);
		if (!matches) return match;

		const [, selectorType, rawSelector, attribute, filtersString] = matches;
		const extractHtml = selectorType === 'selectorHtml';
		const selector = rawSelector.replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();

		const content = extractContentBySelector(doc, selector, attribute, extractHtml);
		const contentString = selectorContentToString(content);

		return filtersString ? applyFilters(contentString, filtersString, currentUrl) : contentString;
	};
}

// ---------------------------------------------------------------------------
// Template trigger matching
// ---------------------------------------------------------------------------

function matchTriggerPattern(pattern: string, url: string): boolean {
	if (pattern.startsWith('/') && pattern.endsWith('/')) {
		try {
			return new RegExp(pattern.slice(1, -1)).test(url);
		} catch {
			return false;
		}
	}
	return url.startsWith(pattern);
}

function matchSchemaPattern(pattern: string, schemaOrgData: any): boolean {
	const match = pattern.match(/^schema:(@\w+)?(?:\.(.+?))?(?:=(.+))?$/);
	if (!match) return false;
	const [, schemaType, schemaKey, expectedValue] = match;
	if (!schemaType && !schemaKey) return false;

	const schemaArray = Array.isArray(schemaOrgData) ? schemaOrgData : [schemaOrgData];
	const flattened = schemaArray.flatMap((s: any) => Array.isArray(s) ? s : [s]);

	for (const schema of flattened) {
		if (!schema || typeof schema !== 'object') continue;
		if (schemaType) {
			const types = Array.isArray(schema['@type']) ? schema['@type'] : [schema['@type']];
			if (!types.includes(schemaType.slice(1))) continue;
		}
		if (schemaKey) {
			const keys = schemaKey.split('.');
			let val = schema;
			for (const k of keys) {
				val = val && typeof val === 'object' && k in val ? val[k] : undefined;
			}
			if (expectedValue) {
				if (Array.isArray(val) ? val.includes(expectedValue) : val === expectedValue) return true;
			} else if (val !== undefined) {
				return true;
			}
		} else {
			return true;
		}
	}
	return false;
}

/**
 * Find the first template whose triggers match the given URL (and optionally schema data).
 * URL prefix and regex triggers are checked first, then schema triggers.
 */
export function matchTemplate(templates: Template[], url: string, schemaOrgData?: any): Template | undefined {
	// First pass: URL prefix and regex triggers
	for (const template of templates) {
		if (!template.triggers) continue;
		for (const trigger of template.triggers) {
			if (!trigger.startsWith('schema:') && matchTriggerPattern(trigger, url)) {
				return template;
			}
		}
	}

	// Second pass: schema triggers
	if (schemaOrgData) {
		for (const template of templates) {
			if (!template.triggers) continue;
			for (const trigger of template.triggers) {
				if (trigger.startsWith('schema:') && matchSchemaPattern(trigger, schemaOrgData)) {
					return template;
				}
			}
		}
	}

	return undefined;
}

// ---------------------------------------------------------------------------
// Core clipping function
// ---------------------------------------------------------------------------

/**
 * Clip a web page using the given template.
 *
 * The caller is responsible for:
 * - Fetching the HTML
 * - Providing a DocumentParser for their environment
 * - Writing the output (file, vault API, etc.)
 */
export async function clip(options: ClipOptions): Promise<ClipResult> {
	const { html, url, template, documentParser, propertyTypes, parsedDocument } = options;

	// Use pre-parsed document if provided, otherwise parse
	const doc = parsedDocument ?? documentParser.parseFromString(html, 'text/html');

	// Extract content with defuddle
	// Cast through unknown: linkedom's Document is structurally compatible but not nominally typed as DOM Document
	const defuddle = new DefuddleClass(doc as unknown as Document, { url });
	const defuddleResult = defuddle.parse();

	// Convert to markdown
	const markdownContent = createMarkdownContent(defuddleResult.content, url);

	// Build template variables
	const variables = buildVariables({
		title: defuddleResult.title,
		author: defuddleResult.author,
		content: markdownContent,
		contentHtml: defuddleResult.content,
		url,
		fullHtml: html,
		description: defuddleResult.description,
		favicon: defuddleResult.favicon,
		image: defuddleResult.image,
		published: defuddleResult.published,
		site: defuddleResult.site,
		language: defuddleResult.language,
		wordCount: defuddleResult.wordCount,
		schemaOrgData: defuddleResult.schemaOrgData,
		metaTags: defuddleResult.metaTags,
		extractedContent: defuddleResult.variables,
	});

	// Create resolvers for selector variables
	const asyncResolver = createAsyncResolver(doc);
	const selectorProcessor = createSelectorProcessor(doc);

	const compile = (text: string) =>
		compileTemplate(0, text, variables, url, asyncResolver, selectorProcessor);

	// Compile note name
	const compiledNoteName = await compile(template.noteNameFormat);
	const noteName = sanitizeFileName(compiledNoteName) || 'Untitled';

	// Compile and format each property
	const compiledProperties: Property[] = await Promise.all(
		template.properties.map(async (prop) => {
			let value = await compile(prop.value);
			const propType = prop.type || 'text';
			value = formatPropertyValue(value, propType, prop.value);
			return { name: prop.name, value, type: prop.type };
		})
	);

	// Build property type map
	const typeMap: Record<string, string> = {};
	for (const prop of template.properties) {
		if (prop.type) {
			typeMap[prop.name] = prop.type;
		}
	}
	if (propertyTypes) {
		Object.assign(typeMap, propertyTypes);
	}

	// Generate frontmatter
	const frontmatter = generateFrontmatter(compiledProperties, typeMap);

	// Compile note content
	const content = await compile(template.noteContentFormat);

	// Assemble full content
	const fullContent = frontmatter ? frontmatter + content : content;

	return {
		noteName,
		frontmatter,
		content,
		fullContent,
		properties: compiledProperties,
		variables,
	};
}

// Re-export types that consumers may need
export type { Template, Property } from './types/types';
