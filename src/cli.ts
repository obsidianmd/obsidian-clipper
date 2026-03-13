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
	propertyTypesPath?: string;
}

function printUsage(): void {
	const usage = `
Usage: obsidian-clipper <url> [options]

Options:
  -t, --template <path>        Path to template JSON file (required)
  -o, --output <path>          Output .md file path (default: stdout)
      --vault <name>           Obsidian vault name (for URI mode)
      --open                   Open in Obsidian via URI instead of writing file
      --silent                 Add silent=true to Obsidian URI
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
	let propertyTypesPath: string | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case '-h':
			case '--help':
				printUsage();
				process.exit(0);
			case '-t':
			case '--template':
				templatePath = args[++i];
				break;
			case '-o':
			case '--output':
				outputPath = args[++i];
				break;
			case '--vault':
				vault = args[++i];
				break;
			case '--open':
				open = true;
				break;
			case '--silent':
				silent = true;
				break;
			case '--property-types':
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

	return { url, templatePath, outputPath, vault, open, silent, propertyTypesPath };
}

// ---------------------------------------------------------------------------
// CLI-specific resolvers for template compilation
// ---------------------------------------------------------------------------

/**
 * Create an AsyncResolver that runs CSS selectors on the linkedom document.
 * Used by the AST renderer for selector variables in for-loops / conditionals.
 */
function createCliAsyncResolver(linkedomDocument: any): AsyncResolver {
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
function createCliSelectorProcessor(linkedomDocument: any): SelectorProcessor {
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

	// Load template
	const templateRaw = fs.readFileSync(path.resolve(args.templatePath), 'utf-8');
	const template: Template = JSON.parse(templateRaw);

	// Load optional property types
	let propertyTypes: Record<string, string> | undefined;
	if (args.propertyTypesPath) {
		const raw = fs.readFileSync(path.resolve(args.propertyTypesPath), 'utf-8');
		propertyTypes = JSON.parse(raw);
	}

	// Fetch URL
	const response = await fetch(args.url);
	if (!response.ok) {
		console.error(`Failed to fetch ${args.url}: ${response.status} ${response.statusText}`);
		process.exit(1);
	}
	const html = await response.text();

	// Parse with linkedom
	const { document } = parseHTML(html);

	// Run defuddle to extract content as HTML
	const defuddle = new DefuddleClass(document as unknown as Document, { url: args.url });
	const defuddleResult = defuddle.parse();

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
	const compiledProperties: Property[] = await Promise.all(
		template.properties.map(async (prop) => ({
			name: prop.name,
			value: await compile(prop.value),
		}))
	);

	// Generate frontmatter
	const frontmatter = generateFrontmatter(compiledProperties, propertyTypes || {});

	// Compile note content
	const compiledContent = await compile(template.noteContentFormat);

	// Combine
	const fullContent = frontmatter ? frontmatter + '\n' + compiledContent : compiledContent;

	// Output
	if (args.open) {
		const vault = args.vault || template.vault || '';
		await openInObsidian(
			fullContent,
			noteName,
			template.path || '',
			vault,
			template.behavior || 'create',
			args.silent
		);
		console.error(`Opened in Obsidian${vault ? ` (vault: ${vault})` : ''}`);
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
