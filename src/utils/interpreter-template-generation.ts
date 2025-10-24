/**
 * Intelligent Interpreter: Template Generation
 *
 * Generates ephemeral Web Clipper templates optimized for specific pages
 * using LLM analysis of page structure.
 */

import { Template, ModelConfig } from '../types/types';
import { sendToLLM } from './interpreter';
import { extractDOMOutline, serializeDOMOutline } from './dom-outline-extractor';
import { debugLog } from './debug';

export interface ContentResponse {
	content: string;
	fullHtml: string;
	schemaOrgData: any;
	title: string;
	url?: string;
	author: string;
	description: string;
	published: string;
	wordCount: number;
}

export interface PageContext {
	title: string;
	url: string;
	schemaOrgData: any;
	domOutline: string;
	wordCount: number;
	author?: string;
	description?: string;
	published?: string;
}

/**
 * Generate system prompt with complete Web Clipper syntax reference
 */
function buildSystemPrompt(): string {
	return `You are an expert at analyzing web pages and generating Obsidian Web Clipper templates.

Your task: Analyze the provided page structure and generate an optimal extraction template in JSON format.

## AVAILABLE VARIABLE TYPES

### 1. Simple Variables
{{title}}           - Page title
{{url}}             - Current URL
{{author}}          - Page author (from meta tags)
{{description}}     - Meta description
{{published}}       - Publication date
{{image}}           - Featured image URL
{{favicon}}         - Site favicon
{{site}}            - Site name
{{domain}}          - Domain name
{{date:FORMAT}}     - Current date (e.g., {{date:YYYY-MM-DD}})
{{time}}            - Current time

### 2. Selector Variables (DOM Extraction)
{{selector:CSS_SELECTOR}}           - Extract content from CSS selector
{{selectorHtml:CSS_SELECTOR}}       - Same as selector
Examples:
- {{selector:#main}}
- {{selectorHtml:.article-content}}
- {{selector:article > section.abstract}}

### 3. Schema.org Variables (JSON-LD Structured Data)
{{schema:@Type.property}}           - Extract from JSON-LD data
Examples:
- {{schema:@Article.headline}}
- {{schema:@Article.author}}
- {{schema:@Recipe.recipeIngredient}}
- {{schema:@Product.price}}
- {{schema:@ScholarlyArticle.abstract}}

### 4. Filters (apply to any variable with |)
|remove_html        - Strip HTML tags
|upper              - UPPERCASE
|lower              - lowercase
|capitalize         - Capitalize first letter
|title              - Title Case
|trim               - Remove whitespace
|date:FORMAT        - Format date (YYYY-MM-DD, etc.)
|replace:"old":"new" - Replace text
|safe_name          - Make filename-safe
|strip_md           - Remove markdown formatting
|blockquote         - Convert to markdown blockquote
|callout:TYPE       - Convert to Obsidian callout
|list               - Convert to markdown list
|table              - Convert to markdown table

Examples:
- {{title|upper}}
- {{selector:.content|remove_html}}
- {{published|date:YYYY-MM-DD}}
- {{schema:@Article.headline|safe_name}}

### 5. Logic Constructs
{% if variable %}...{% endif %}
{% for item in array %}...{% endfor %}

## TEMPLATE STRUCTURE

You must return a JSON object with these fields:

{
  "noteContentFormat": "string",  // Main template body with markdown and variables
  "properties": [                  // Array of frontmatter metadata
    {
      "name": "string",           // Property name (use kebab-case)
      "value": "string"           // Property value (can contain variables)
    }
  ],
  "noteNameFormat": "string",     // Note filename pattern
  "path": "string",               // Vault folder path
  "behavior": "create"            // Usually "create"
}

## BEST PRACTICES

1. **Use schema.org data when available** - Most reliable source
   - If schemaOrgData has @type, use {{schema:@Type.property}} variables
   - Common types: Article, ScholarlyArticle, Recipe, Product, NewsArticle

2. **Use selectors from domOutline** - Don't guess selectors
   - Only use selectors that appear in the provided domOutline.selectors array
   - Prefer IDs over classes: #abstract better than .abstract
   - Use semantic sections from domOutline.semanticSections

3. **Apply filters for clean output**
   - Always use |remove_html on selector variables for plain text
   - Use |date:YYYY-MM-DD for dates
   - Use |safe_name for filenames

4. **Structure noteContentFormat with markdown**
   - Use # for title (h1)
   - Use ## for sections (h2)
   - Use lists, blockquotes, tables as appropriate

5. **Create semantic property names**
   - Use kebab-case: "publication-date", "source-url", "authors"
   - Common properties: type, source-url, authors, date-clipped

6. **Infer appropriate folder path**
   - "Research/Articles" for academic content
   - "Recipes" for recipes
   - "Products" for product pages
   - "Articles" for general articles
   - "Clippings" as default

7. **noteNameFormat should be concise**
   - Usually {{title}} or {{schema:@Type.headline}}
   - Use |safe_name if needed

8. **behavior is almost always "create"**
   - Use "create" unless you have a specific reason

## EXAMPLES

### Example 1: Academic Article
Input: schemaOrgData has @type: "ScholarlyArticle", domOutline has [".abstract", "#introduction"]

Output:
{
  "noteContentFormat": "# {{schema:@ScholarlyArticle.headline}}\\n\\n## Metadata\\n- **Authors**: {{schema:@ScholarlyArticle.author}}\\n- **Source**: {{url}}\\n\\n## Abstract\\n{{selectorHtml:.abstract|remove_html}}\\n\\n## Content\\n{{selectorHtml:#introduction|remove_html}}",
  "properties": [
    {"name": "type", "value": "academic-article"},
    {"name": "authors", "value": "{{schema:@ScholarlyArticle.author}}"},
    {"name": "source-url", "value": "{{url}}"}
  ],
  "noteNameFormat": "{{schema:@ScholarlyArticle.headline|safe_name}}",
  "path": "Research/Articles",
  "behavior": "create"
}

### Example 2: Recipe
Input: schemaOrgData has @type: "Recipe"

Output:
{
  "noteContentFormat": "# {{schema:@Recipe.name}}\\n\\n**Author**: {{schema:@Recipe.author}}\\n**Source**: {{url}}\\n\\n## Ingredients\\n{{schema:@Recipe.recipeIngredient}}\\n\\n## Instructions\\n{{schema:@Recipe.recipeInstructions}}",
  "properties": [
    {"name": "type", "value": "recipe"},
    {"name": "author", "value": "{{schema:@Recipe.author}}"}
  ],
  "noteNameFormat": "{{schema:@Recipe.name|safe_name}}",
  "path": "Recipes",
  "behavior": "create"
}

### Example 3: Blog Post (no schema.org)
Input: domOutline has ["article", ".post-content", "h1"]

Output:
{
  "noteContentFormat": "# {{title}}\\n\\n**Source**: {{url}}\\n**Author**: {{author}}\\n**Published**: {{published|date:YYYY-MM-DD}}\\n\\n## Content\\n{{selectorHtml:.post-content|remove_html}}",
  "properties": [
    {"name": "type", "value": "article"},
    {"name": "source-url", "value": "{{url}}"},
    {"name": "date-clipped", "value": "{{date:YYYY-MM-DD}}"}
  ],
  "noteNameFormat": "{{title|safe_name}}",
  "path": "Articles",
  "behavior": "create"
}

## IMPORTANT CONSTRAINTS

- Return ONLY valid JSON, no explanatory text before or after
- Use only selectors from the provided domOutline
- Use schema.org variables when schemaOrgData is available
- All strings must be properly escaped
- Use \\n for newlines in noteContentFormat
- Do not use complex logic constructs unless necessary
- Keep noteContentFormat concise (< 500 characters ideally)

Now analyze the page and generate the optimal template.`;
}

/**
 * Prepare page context for LLM (compress to save tokens)
 */
function preparePageContext(pageData: ContentResponse): PageContext {
	debugLog('TemplateGen', 'Preparing page context...');

	const domOutline = extractDOMOutline(pageData.fullHtml);

	return {
		title: pageData.title || 'Untitled',
		url: pageData.url || '',
		schemaOrgData: pageData.schemaOrgData || null,
		domOutline: serializeDOMOutline(domOutline),
		wordCount: pageData.wordCount || 0,
		author: pageData.author || '',
		description: pageData.description || '',
		published: pageData.published || ''
	};
}

/**
 * Parse LLM response into Template object
 */
function parseGeneratedTemplate(response: any): Template {
	debugLog('TemplateGen', 'Parsing LLM response:', response);

	// The response from sendToLLM is { promptResponses: [...] }
	// We need to extract the actual template JSON from the first prompt response
	let templateData: any;

	if (response.promptResponses && response.promptResponses.length > 0) {
		const firstResponse = response.promptResponses[0];
		const userResponse = firstResponse.user_response;

		// Try to parse the user_response as JSON
		try {
			templateData = typeof userResponse === 'string' ? JSON.parse(userResponse) : userResponse;
		} catch (e) {
			debugLog('TemplateGen', 'Failed to parse user_response as JSON, trying direct:', e);
			templateData = userResponse;
		}
	} else {
		throw new Error('No response from LLM');
	}

	debugLog('TemplateGen', 'Parsed template data:', templateData);

	// Create Template object with required fields
	const template: Template = {
		id: '__ephemeral__', // Mark as ephemeral
		name: 'AI Generated Template',
		noteContentFormat: templateData.noteContentFormat || '',
		properties: templateData.properties || [],
		noteNameFormat: templateData.noteNameFormat || '{{title}}',
		path: templateData.path || 'Clippings',
		behavior: templateData.behavior || 'create'
	};

	return template;
}

/**
 * Validate generated template structure
 */
function validateTemplate(template: Template): void {
	debugLog('TemplateGen', 'Validating template...');

	const errors: string[] = [];

	// Check required fields
	if (!template.noteContentFormat || template.noteContentFormat.trim().length === 0) {
		errors.push('noteContentFormat is required and cannot be empty');
	}

	if (!template.noteNameFormat || template.noteNameFormat.trim().length === 0) {
		errors.push('noteNameFormat is required and cannot be empty');
	}

	if (!template.path || template.path.trim().length === 0) {
		errors.push('path is required and cannot be empty');
	}

	// Validate behavior
	const validBehaviors = ['create', 'append-specific', 'append-daily', 'prepend-specific', 'prepend-daily', 'overwrite'];
	if (!validBehaviors.includes(template.behavior)) {
		errors.push(`behavior must be one of: ${validBehaviors.join(', ')}`);
	}

	// Validate properties is an array
	if (!Array.isArray(template.properties)) {
		errors.push('properties must be an array');
	} else {
		// Validate each property
		template.properties.forEach((prop, index) => {
			if (!prop.name || typeof prop.name !== 'string') {
				errors.push(`Property ${index}: name is required and must be a string`);
			}
			if (prop.value === undefined || prop.value === null) {
				errors.push(`Property ${index}: value is required`);
			}
		});
	}

	if (errors.length > 0) {
		throw new Error(`Template validation failed:\n${errors.join('\n')}`);
	}

	debugLog('TemplateGen', 'Template validation passed');
}

/**
 * Main function: Generate ephemeral template optimized for specific page
 */
export async function generateTemplateForPage(
	pageData: ContentResponse,
	model: ModelConfig
): Promise<Template> {
	debugLog('TemplateGen', 'Starting template generation for page:', pageData.title);

	try {
		// 1. Prepare compressed context
		const context = preparePageContext(pageData);
		debugLog('TemplateGen', 'Page context prepared');

		// 2. Build system prompt
		const systemPrompt = buildSystemPrompt();

		// 3. Create a single "prompt" for the template generation
		const promptVariables = [{
			key: 'template_generation',
			prompt: `Generate an optimal Web Clipper template for this page:\n\n${JSON.stringify(context, null, 2)}`
		}];

		// 4. Send to LLM using existing interpreter function
		debugLog('TemplateGen', 'Sending to LLM...');
		const response = await sendToLLM(
			systemPrompt,
			'', // Empty content since we're including context in prompt
			promptVariables,
			model
		);

		// 5. Parse response into Template object
		const template = parseGeneratedTemplate(response);

		// 6. Validate template structure
		validateTemplate(template);

		debugLog('TemplateGen', 'Template generated successfully:', template);
		return template;

	} catch (error) {
		debugLog('TemplateGen', 'Error generating template:', error);
		throw new Error(`Failed to generate template: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Count estimated tokens in page context (rough estimate)
 */
export function estimateTokenCount(pageData: ContentResponse): number {
	const context = preparePageContext(pageData);
	const contextString = JSON.stringify(context);
	// Rough estimate: 1 token ≈ 4 characters
	return Math.ceil(contextString.length / 4);
}
