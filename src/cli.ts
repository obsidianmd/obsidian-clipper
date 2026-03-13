// Browser globals (DOMParser, window, document) are provided by the esbuild
// banner in scripts/build-cli.mjs. They must run before any bundled module code.
import { parseHTML } from 'linkedom';
import DefuddleClass from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { compileTemplate, SelectorProcessor } from './utils/template-compiler';
import { AsyncResolver } from './utils/renderer';
import { applyFilters } from './utils/filters';
import { buildVariables, generateFrontmatter, extractContentBySelector } from './utils/shared';
import { openInObsidian } from './utils/cli-utils';
import { sanitizeFileName } from './utils/string-utils';
import dayjs from 'dayjs';
import { Template, Property } from './types/types';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
	url: string;
	templatePath: string;
	outputPath?: string;
	vault?: string;
	open: boolean;
	silent: boolean;
	uri: boolean;
	propertyTypesPath?: string;
	htmlPath?: string;
}

function printUsage(): void {
	const usage = `
Usage: obsidian-clipper <url> [options]

Options:
  -t, --template <path>        Path to template JSON file or directory (required)
                               If a directory, auto-matches template by URL triggers
  -o, --output <path>          Output .md file path (default: stdout)
      --html <path>            Read HTML from file instead of fetching URL (use - for stdin)
      --vault <name>           Obsidian vault name
      --open                   Send to Obsidian instead of writing file
      --uri                    Use URI scheme instead of Obsidian CLI
      --silent                 Suppress Obsidian focus (URI mode)
      --property-types <path>  JSON mapping property names to types
  -h, --help                   Show this help message
`.trim();
	console.log(usage);
}

function parseArgs(argv: string[]): CliArgs {
	const args = argv.slice(2);
	let url = '';
	let templatePath = '';
	let outputPath: string | undefined;
	let vault: string | undefined;
	let open = false;
	let silent = false;
	let uri = false;
	let propertyTypesPath: string | undefined;
	let htmlPath: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '-h':
			case '--help':
				printUsage();
				process.exit(0);
				break;
			case '-t':
			case '--template':
				if (i + 1 >= args.length) { console.error('Error: --template requires a value'); process.exit(1); }
				templatePath = args[++i];
				break;
			case '-o':
			case '--output':
				if (i + 1 >= args.length) { console.error('Error: --output requires a value'); process.exit(1); }
				outputPath = args[++i];
				break;
			case '--vault':
				if (i + 1 >= args.length) { console.error('Error: --vault requires a value'); process.exit(1); }
				vault = args[++i];
				break;
			case '--open':
				open = true;
				break;
			case '--silent':
				silent = true;
				break;
			case '--uri':
				uri = true;
				break;
			case '--html':
				if (i + 1 >= args.length) { console.error('Error: --html requires a value'); process.exit(1); }
				htmlPath = args[++i];
				break;
			case '--property-types':
				if (i + 1 >= args.length) { console.error('Error: --property-types requires a value'); process.exit(1); }
				propertyTypesPath = args[++i];
				break;
			default:
				if (!arg.startsWith('-') && !url) {
					url = arg;
				} else {
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
				}
		}
	}

	if (!url) {
		console.error('Error: URL is required');
		printUsage();
		process.exit(1);
	}

	if (!templatePath) {
		console.error('Error: --template is required');
		printUsage();
		process.exit(1);
	}

	return { url, templatePath, outputPath, vault, open, silent, uri, propertyTypesPath, htmlPath };
}

// ---------------------------------------------------------------------------
// Template loading and trigger matching
// ---------------------------------------------------------------------------

function loadTemplatesFromDir(dirPath: string): Template[] {
	const resolved = path.resolve(dirPath);
	const files = fs.readdirSync(resolved).filter(f => f.endsWith('.json'));
	return files.map(f => {
		const raw = fs.readFileSync(path.join(resolved, f), 'utf-8');
		const template: Template = JSON.parse(raw);
		(template as any)._filePath = path.join(resolved, f);
		return template;
	});
}

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

function findMatchingTemplate(templates: Template[], url: string, schemaOrgData?: any): Template | undefined {
	// First pass: URL prefix and regex triggers (no schema data needed)
	for (const template of templates) {
		if (!template.triggers) continue;
		for (const trigger of template.triggers) {
			if (!trigger.startsWith('schema:') && matchTriggerPattern(trigger, url)) {
				return template;
			}
		}
	}

	// Second pass: schema triggers (only if schema data is available)
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
// CLI-specific resolvers for template compilation
// ---------------------------------------------------------------------------

/**
 * Create an AsyncResolver that runs CSS selectors on the linkedom document.
 * Used by the AST renderer for selector variables in for-loops / conditionals.
 */
type DocLike = { querySelectorAll: (selector: string) => any };

function createCliAsyncResolver(linkedomDocument: DocLike): AsyncResolver {
	return async (name: string): Promise<any> => {
		if (name.startsWith('selector:') || name.startsWith('selectorHtml:')) {
			const extractHtml = name.startsWith('selectorHtml:');
			const prefix = extractHtml ? 'selectorHtml:' : 'selector:';
			const selectorPart = name.slice(prefix.length);

			const attrMatch = selectorPart.match(/^(.+?)\?(.+)$/);
			const selector = attrMatch ? attrMatch[1] : selectorPart;
			const attribute = attrMatch ? attrMatch[2] : undefined;

			return extractContentBySelector(
				linkedomDocument,
				selector.replace(/\\"/g, '"'),
				attribute,
				extractHtml
			);
		}
		return undefined;
	};
}

/**
 * Create a SelectorProcessor that resolves selectors on the linkedom document.
 * Used by processVariables for deferred selector variables in post-processing.
 */
function createCliSelectorProcessor(linkedomDocument: DocLike): SelectorProcessor {
	return async (match: string, currentUrl: string): Promise<string> => {
		const selectorRegex = /{{(selector|selectorHtml):(.*?)(?:\?(.*?))?(?:\|(.*?))?}}/;
		const matches = match.match(selectorRegex);
		if (!matches) return match;

		const [, selectorType, rawSelector, attribute, filtersString] = matches;
		const extractHtml = selectorType === 'selectorHtml';
		const selector = rawSelector.replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();

		const content = extractContentBySelector(linkedomDocument, selector, attribute, extractHtml);
		const contentString = Array.isArray(content) ? JSON.stringify(content) : content;

		return filtersString ? applyFilters(contentString, filtersString, currentUrl) : contentString;
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	const args = parseArgs(process.argv);

	// Determine if template path is a file or directory
	const resolvedTemplatePath = path.resolve(args.templatePath);
	const isDir = fs.statSync(resolvedTemplatePath).isDirectory();
	let templates: Template[] | undefined;
	let template!: Template;

	if (isDir) {
		templates = loadTemplatesFromDir(resolvedTemplatePath);
		if (templates.length === 0) {
			console.error(`Error: No .json template files found in ${args.templatePath}`);
			process.exit(1);
		}
	} else {
		const templateRaw = fs.readFileSync(resolvedTemplatePath, 'utf-8');
		template = JSON.parse(templateRaw);
	}

	// Load optional property types
	let propertyTypes: Record<string, string> | undefined;
	if (args.propertyTypesPath) {
		const raw = fs.readFileSync(path.resolve(args.propertyTypesPath), 'utf-8');
		propertyTypes = JSON.parse(raw);
	}

	// Get HTML: from file/stdin (--html) or by fetching URL
	let html: string;
	if (args.htmlPath) {
		if (args.htmlPath === '-') {
			html = fs.readFileSync(0, 'utf-8'); // stdin
		} else {
			html = fs.readFileSync(path.resolve(args.htmlPath), 'utf-8');
		}
	} else {
		const response = await fetch(args.url);
		if (!response.ok) {
			console.error(`Failed to fetch ${args.url}: ${response.status} ${response.statusText}`);
			process.exit(1);
		}
		html = await response.text();
	}

	// Parse with linkedom
	const { document } = parseHTML(html);

	if (!document.documentElement) {
		console.error('Error: Could not parse HTML (empty or invalid document)');
		process.exit(1);
	}

	// Run defuddle to extract content as HTML
	const defuddle = new DefuddleClass(document as unknown as Document, { url: args.url });
	const defuddleResult = defuddle.parse();

	// If using a template directory, match triggers now (after defuddle for schema triggers)
	if (templates) {
		const matched = findMatchingTemplate(templates, args.url, defuddleResult.schemaOrgData);
		if (!matched) {
			console.error(`Error: No template matched URL ${args.url}`);
			console.error(`Searched ${templates.length} templates in ${args.templatePath}`);
			process.exit(1);
		}
		template = matched;
		console.error(`Matched template: ${(template as any)._filePath || 'unknown'}`);
	}

	// Convert HTML content to markdown using defuddle's Turndown wrapper
	const markdownContent = createMarkdownContent(defuddleResult.content, args.url);

	// Build template variables — markdown for {{content}}, HTML for {{contentHtml}}
	const variables = buildVariables({
		title: defuddleResult.title,
		author: defuddleResult.author,
		content: markdownContent,
		contentHtml: defuddleResult.content,
		url: args.url,
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

	// Create CLI-specific resolvers for selector variables
	const asyncResolver = createCliAsyncResolver(document);
	const selectorProcessor = createCliSelectorProcessor(document);

	// Helper to compile a template string with CLI resolvers
	const compile = (text: string) =>
		compileTemplate(0, text, variables, args.url, asyncResolver, selectorProcessor);

	// Compile note name
	const compiledNoteName = await compile(template.noteNameFormat);
	const noteName = sanitizeFileName(compiledNoteName) || 'Untitled';

	// Compile each property value (independent, so run in parallel)
	// Then apply type-aware formatting (same as the extension's popup.ts)
	const compiledProperties: Property[] = await Promise.all(
		template.properties.map(async (prop) => {
			let value = await compile(prop.value);
			const propType = prop.type || 'text';

			switch (propType) {
				case 'number': {
					const numericValue = value.replace(/[^\d.-]/g, '');
					value = numericValue ? parseFloat(numericValue).toString() : value;
					break;
				}
				case 'checkbox':
					value = (value.toLowerCase() === 'true' || value === '1').toString();
					break;
				case 'date':
					if (!prop.value.includes('|date:')) {
						value = dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : value;
					}
					break;
				case 'datetime':
					if (!prop.value.includes('|date:')) {
						value = dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DDTHH:mm:ssZ') : value;
					}
					break;
			}

			return { name: prop.name, value };
		})
	);

	// Build property type map: --property-types overrides, then fall back to template's own types
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
	const compiledContent = await compile(template.noteContentFormat);

	// Combine
	const fullContent = frontmatter ? frontmatter + compiledContent : compiledContent;

	// Output
	if (args.open) {
		const vault = args.vault || template.vault || '';
		const result = await openInObsidian(
			fullContent,
			noteName,
			template.path || '',
			vault,
			template.behavior || 'create',
			args.silent,
			args.uri
		);
		console.error(result);
	} else if (args.outputPath) {
		fs.writeFileSync(path.resolve(args.outputPath), fullContent, 'utf-8');
		console.error(`Written to ${args.outputPath}`);
	} else {
		process.stdout.write(fullContent);
	}
}

main().catch(err => {
	console.error(err.message || err);
	process.exit(1);
});
