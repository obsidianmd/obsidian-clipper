// Browser globals (DOMParser, window, document) are provided by the esbuild
// banner in scripts/build-cli.mjs. They must run before any bundled module code.
import { parseHTML } from 'linkedom';
import DefuddleClass from 'defuddle';
import { createMarkdownContent } from 'defuddle/full';
import { render, RenderContext, AsyncResolver } from './utils/renderer';
import { applyFilterDirect, applyFilters } from './utils/filters';
import { processSimpleVariable } from './utils/variables/simple';
import { processSchema } from './utils/variables/schema';
import {
	buildVariables,
	generateFrontmatterCLI,
	extractContentBySelector,
	openInObsidian,
} from './utils/cli-utils';
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
// Template compilation (CLI-specific, avoids browser imports)
// ---------------------------------------------------------------------------

async function compileTemplateCLI(
	text: string,
	variables: Record<string, any>,
	currentUrl: string,
	linkedomDocument: any
): Promise<string> {
	currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

	// Async resolver that runs selectors directly on the linkedom document
	const asyncResolver: AsyncResolver = async (name: string): Promise<any> => {
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

	const context: RenderContext = {
		variables,
		currentUrl,
		tabId: 0,
		applyFilterDirect,
		asyncResolver,
	};

	const result = await render(text, context);

	if (result.errors.length > 0) {
		console.error('Template compilation errors:', result.errors.map(e => `Line ${e.line}: ${e.message}`).join('; '));
	}

	if (!result.hasDeferredVariables) {
		return result.output;
	}

	// Post-process deferred variables (schema, prompts become empty)
	return processVariablesCLI(result.output, variables, currentUrl, linkedomDocument);
}

/**
 * CLI version of processVariables that handles selectors locally
 * and skips prompt variables (returns empty string for prompts).
 */
async function processVariablesCLI(
	text: string,
	variables: Record<string, any>,
	currentUrl: string,
	linkedomDocument: any
): Promise<string> {
	const regex = /{{([\s\S]*?)}}/g;
	let result = text;
	let match;

	while ((match = regex.exec(result)) !== null) {
		const fullMatch = match[0];
		const trimmedMatch = match[1].trim();

		let replacement = '';

		if (trimmedMatch.startsWith('selector:') || trimmedMatch.startsWith('selectorHtml:')) {
			// Resolve selectors directly on linkedom document
			const extractHtml = trimmedMatch.startsWith('selectorHtml:');
			const prefix = extractHtml ? 'selectorHtml:' : 'selector:';
			const rest = trimmedMatch.slice(prefix.length);

			// Split off filters
			const pipeIndex = rest.indexOf('|');
			const selectorPart = pipeIndex >= 0 ? rest.slice(0, pipeIndex) : rest;
			const filtersString = pipeIndex >= 0 ? rest.slice(pipeIndex + 1) : undefined;

			const attrMatch = selectorPart.match(/^(.+?)\?(.+)$/);
			const selector = attrMatch ? attrMatch[1] : selectorPart;
			const attribute = attrMatch ? attrMatch[2] : undefined;

			const content = extractContentBySelector(
				linkedomDocument,
				selector.replace(/\\"/g, '"'),
				attribute,
				extractHtml
			);
			const contentString = Array.isArray(content) ? JSON.stringify(content) : content;

			if (filtersString) {
				replacement = applyFilters(contentString, filtersString, currentUrl);
			} else {
				replacement = contentString;
			}
		} else if (trimmedMatch.startsWith('schema:')) {
			replacement = await processSchema(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('"') || trimmedMatch.startsWith('prompt:')) {
			// Prompts are not supported in CLI — return empty string
			replacement = '';
		} else {
			replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
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
	const variables = buildVariables(
		{ ...defuddleResult, content: markdownContent } as any,
		args.url,
		html,
		defuddleResult.content
	);

	// Compile note name
	const compiledNoteName = await compileTemplateCLI(
		template.noteNameFormat,
		variables,
		args.url,
		document
	);
	const noteName = sanitizeFileName(compiledNoteName) || 'Untitled';

	// Compile each property value
	const compiledProperties: Property[] = [];
	for (const prop of template.properties) {
		const compiledValue = await compileTemplateCLI(
			prop.value,
			variables,
			args.url,
			document
		);
		compiledProperties.push({
			name: prop.name,
			value: compiledValue,
		});
	}

	// Generate frontmatter
	const frontmatter = generateFrontmatterCLI(compiledProperties, propertyTypes);

	// Compile note content
	const compiledContent = await compileTemplateCLI(
		template.noteContentFormat,
		variables,
		args.url,
		document
	);

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
