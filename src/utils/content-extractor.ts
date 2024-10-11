import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './string-utils';
import { Readability } from '@mozilla/readability';
import { applyFilters } from './filters';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';

import { AnyHighlightData } from './highlighter';
import { processForLoop } from './tags/for_loop';
import { processSelector } from './tags/selector';
import { processSchema } from './tags/schema';
import { processPrompt } from './tags/prompt';

export function extractReadabilityContent(doc: Document): ReturnType<Readability['parse']> | null {
	try {
		const reader = new Readability(doc, {keepClasses:true})
		return reader.parse();
	} catch (error) {
		console.error('Error in extractReadabilityContent:', error);
		return null;
	}
}

// Main function to compile the template
export async function compileTemplate(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	// Process for loops
	const processedText = await processLogicStructures(text, variables, currentUrl);
	
	// Process other variables and filters
	return await processVariables(tabId, processedText, variables, currentUrl);
}

// Function to process logic structures like for loops
async function processLogicStructures(text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	let processedText = text;
	const forLoopRegex = /{%\s*for\s+(\w+)\s+in\s+([\w:@]+)\s*%}/g;
	let match;
	
	while ((match = forLoopRegex.exec(processedText)) !== null) {
		const [fullMatch, iteratorName, arrayName] = match;
		const startPos = match.index;
		let nestLevel = 1;
		let endPos = startPos + fullMatch.length;

		while (nestLevel > 0 && endPos < processedText.length) {
			const nextFor = processedText.indexOf('{% for', endPos);
			const nextEndFor = processedText.indexOf('{% endfor %}', endPos);

			if (nextFor !== -1 && nextFor < nextEndFor) {
				nestLevel++;
				endPos = nextFor + 1;
			} else if (nextEndFor !== -1) {
				nestLevel--;
				endPos = nextEndFor + '{% endfor %}'.length;
			} else {
				break; // Unmatched for loop, break to avoid infinite loop
			}
		}

		if (nestLevel === 0) {
			const loopContent = processedText.substring(startPos, endPos);
			const processedLoop = await processForLoop(loopContent, variables, currentUrl);
			processedText = processedText.substring(0, startPos) + processedLoop + processedText.substring(endPos);
			forLoopRegex.lastIndex = startPos + processedLoop.length;
		} else {
			console.error("Unmatched for loop:", fullMatch);
			forLoopRegex.lastIndex = startPos + fullMatch.length;
		}
	}

	return processedText;
}

// Function to process variables and apply filters
async function processVariables(tabId: number, text: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const regex = /{{([\s\S]*?)}}/g;
	let result = text;
	let match;

	while ((match = regex.exec(result)) !== null) {
		const fullMatch = match[0];
		const trimmedMatch = match[1].trim();
		
		let replacement: string;

		if (trimmedMatch.startsWith('selector:') || trimmedMatch.startsWith('selectorHtml:')) {
			replacement = await processSelector(tabId, fullMatch, currentUrl);
		} else if (trimmedMatch.startsWith('schema:')) {
			replacement = await processSchema(fullMatch, variables, currentUrl);
		} else if (trimmedMatch.startsWith('prompt:')) {
			replacement = await processPrompt(fullMatch, variables, currentUrl);
		} else {
			replacement = await processSimpleVariable(trimmedMatch, variables, currentUrl);
		}

		result = result.substring(0, match.index) + replacement + result.substring(match.index + fullMatch.length);
		regex.lastIndex = match.index + replacement.length;
	}

	return result;
}

// Function to process a simple variable (without special prefixes)
async function processSimpleVariable(variableString: string, variables: { [key: string]: any }, currentUrl: string): Promise<string> {
	const [variableName, ...filterParts] = variableString.split('|').map(part => part.trim());
	let value = variables[`{{${variableName}}}`] || '';
	const filtersString = filterParts.join('|');
	return applyFilters(value, filtersString, currentUrl);
}

interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: ExtractedContent;
	schemaOrgData: any;
	fullHtml: string;
	highlights: AnyHighlightData[];
}

export async function extractPageContent(tabId: number): Promise<ContentResponse | null> {
	try {
		const response = await browser.tabs.sendMessage(tabId, { action: "getPageContent" }) as ContentResponse;
		if (response && response.content) {
			// Ensure highlights are of the correct type
			if (response.highlights && Array.isArray(response.highlights)) {
				response.highlights = response.highlights.map((highlight: string | AnyHighlightData) => {
					if (typeof highlight === 'string') {
						// Convert string to AnyHighlightData
						return {
							type: 'text',
							id: Date.now().toString(),
							xpath: '',
							content: highlight,
							startOffset: 0,
							endOffset: highlight.length
						};
					}
					return highlight as AnyHighlightData;
				});
			} else {
				response.highlights = [];
			}
			return response;
		}
		// Content script was unable to load
		throw new Error('Web Clipper was not able to start. Try restarting your browser.');
	} catch (error) {
		console.error('Error extracting page content:', error);
		throw error;
	}
}

export function getTimeElement(doc: Document): string {
	const selector = `time`;
	const element = Array.from(doc.querySelectorAll(selector))[0];
	return element ? (element.getAttribute("datetime")?.trim() ?? element.textContent?.trim() ?? "") : "";
}

export function getMetaContent(doc: Document, attr: string, value: string): string {
	const selector = `meta[${attr}]`;
	const element = Array.from(doc.querySelectorAll(selector))
		.find(el => el.getAttribute(attr)?.toLowerCase() === value.toLowerCase());
	return element ? element.getAttribute("content")?.trim() ?? "" : "";
}

export async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent, currentUrl: string, schemaOrgData: any, fullHtml: string, highlights: AnyHighlightData[]) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');

		const readabilityArticle = extractReadabilityContent(doc);
		if (!readabilityArticle) {
			console.warn('Failed to parse content with Readability, falling back to full content');
		}

		// Define preset variables with fallbacks
		const title =
			getMetaContent(doc, "property", "og:title")
			|| getMetaContent(doc, "name", "twitter:title")
			|| getSchemaProperty(schemaOrgData, 'headline')
			|| getMetaContent(doc, "name", "title")
			|| getMetaContent(doc, "name", "sailthru.title")
			|| doc.querySelector('title')?.textContent?.trim()
			|| '';

		const noteName = sanitizeFileName(title);

		const authorName =
			getMetaContent(doc, "name", "sailthru.author")
			|| getSchemaProperty(schemaOrgData, 'author.name')
			|| getMetaContent(doc, "property", "author")
			|| getMetaContent(doc, "name", "byl")
			|| getMetaContent(doc, "name", "author")
			|| getMetaContent(doc, "name", "copyright")
			|| getSchemaProperty(schemaOrgData, 'copyrightHolder.name')
			|| getMetaContent(doc, "property", "og:site_name")
			|| getSchemaProperty(schemaOrgData, 'publisher.name')
			|| getMetaContent(doc, "property", "og:site_name")
			|| getSchemaProperty(schemaOrgData, 'sourceOrganization.name')
			|| getSchemaProperty(schemaOrgData, 'isPartOf.name')
			|| getMetaContent(doc, "name", "twitter:creator")
			|| getMetaContent(doc, "name", "application-name")
			|| '';

		const description =
			getMetaContent(doc, "name", "description")
			|| getMetaContent(doc, "property", "description")
			|| getMetaContent(doc, "property", "og:description")
			|| getSchemaProperty(schemaOrgData, 'description')
			|| getMetaContent(doc, "name", "twitter:description")
			|| getMetaContent(doc, "name", "sailthru.description")
			|| '';

		const domain = new URL(currentUrl).hostname.replace(/^www\./, '');

		const image =
			getMetaContent(doc, "property", "og:image")
			|| getMetaContent(doc, "name", "twitter:image")
			|| getSchemaProperty(schemaOrgData, 'image.url')
			|| getMetaContent(doc, "name", "sailthru.image.full")
			|| '';

		const published = 
			getSchemaProperty(schemaOrgData, 'datePublished')
			|| getMetaContent(doc, "property", "article:published_time")
			|| getTimeElement(doc)
			|| getMetaContent(doc, "name", "sailthru.date")
			|| '';

		const site =
			getSchemaProperty(schemaOrgData, 'publisher.name')
			|| getMetaContent(doc, "property", "og:site_name")
			|| getSchemaProperty(schemaOrgData, 'sourceOrganization.name')
			|| getMetaContent(doc, "name", "copyright")
			|| getSchemaProperty(schemaOrgData, 'copyrightHolder.name')
			|| getSchemaProperty(schemaOrgData, 'isPartOf.name')
			|| getMetaContent(doc, "name", "application-name")
			|| '';

		if (highlights && highlights.length > 0) {
			const highlightsContent = highlights.map(highlight => highlight.content).join('\n\n\n');
			content = highlightsContent;
		} else if (selectedHtml) {
			content = selectedHtml;
		} else if (readabilityArticle && readabilityArticle.content) {
			content = readabilityArticle.content;
		} else {
			content = doc.body.innerHTML || fullHtml;
		}

		const markdownBody = createMarkdownContent(content, currentUrl);

		// Convert each highlight to markdown individually and keep as an array
		const markdownHighlights = highlights.map(highlight => createMarkdownContent(highlight.content, currentUrl));

		const currentVariables: { [key: string]: string } = {
			'{{author}}': authorName.trim(),
			'{{content}}': markdownBody.trim(),
			'{{contentHtml}}': content.trim(),
			'{{date}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ').trim(),
			'{{time}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ').trim(),
			'{{description}}': description.trim(),
			'{{domain}}': domain.trim(),
			'{{fullHtml}}': fullHtml.trim(),
			'{{image}}': image.trim(),
			'{{noteName}}': noteName.trim(),
			'{{published}}': published.trim(),
			'{{site}}': site.trim(),
			'{{title}}': title.trim(),
			'{{url}}': currentUrl.trim(),
			'{{highlights}}': highlights.length > 0 ? JSON.stringify(markdownHighlights) : '',
		};

		// Add extracted content to variables
		Object.entries(extractedContent).forEach(([key, value]) => {
			currentVariables[`{{${key}}}`] = value;
		});

		// Add all meta tags to variables
		doc.querySelectorAll('meta').forEach(meta => {
			const name = meta.getAttribute('name');
			const property = meta.getAttribute('property');
			const content = meta.getAttribute('content');

			if (name && content) {
				currentVariables[`{{meta:name:${name}}}`] = content;
			}
			if (property && content) {
				currentVariables[`{{meta:property:${property}}}`] = content;
			}
		});

		// Add schema.org data to variables
		if (schemaOrgData) {
			addSchemaOrgDataToVariables(schemaOrgData, currentVariables);
		}

		debugLog('Variables', 'Available variables:', currentVariables);

		return {
			noteName,
			currentVariables
		};
	} catch (error: unknown) {
		console.error('Error in initializePageContent:', error);
		if (error instanceof Error) {
			throw new Error(`Unable to initialize page content: ${error.message}`);
		} else {
			throw new Error('Unable to initialize page content: Unknown error');
		}
	}
}

function addSchemaOrgDataToVariables(schemaData: any, variables: { [key: string]: string }, prefix: string = '') {
	if (Array.isArray(schemaData)) {
		schemaData.forEach((item, index) => {
			if (item['@type']) {
				if (Array.isArray(item['@type'])) {
					item['@type'].forEach((type: string) => {
						addSchemaOrgDataToVariables(item, variables, `@${type}:`);
					});
				} else {
					addSchemaOrgDataToVariables(item, variables, `@${item['@type']}:`);
				}
			} else {
				addSchemaOrgDataToVariables(item, variables, `[${index}]:`);
			}
		});
	} else if (typeof schemaData === 'object' && schemaData !== null) {
		// Store the entire object as JSON
		const objectKey = `{{schema:${prefix.replace(/\.$/, '')}}}`;
		variables[objectKey] = JSON.stringify(schemaData);

		// Process individual properties
		Object.entries(schemaData).forEach(([key, value]) => {
			if (key === '@type') return;
			
			const variableKey = `{{schema:${prefix}${key}}}`;
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
				variables[variableKey] = String(value);
			} else if (Array.isArray(value)) {
				variables[variableKey] = JSON.stringify(value);
				value.forEach((item, index) => {
					addSchemaOrgDataToVariables(item, variables, `${prefix}${key}[${index}].`);
				});
			} else if (typeof value === 'object' && value !== null) {
				addSchemaOrgDataToVariables(value, variables, `${prefix}${key}.`);
			}
		});
	}
}

function getSchemaProperty(schemaOrgData: any, property: string, defaultValue: string = ''): string {
	if (!schemaOrgData) return defaultValue;

	const memoKey = JSON.stringify(schemaOrgData) + property;
	if (getSchemaProperty.memoized.has(memoKey)) {
		return getSchemaProperty.memoized.get(memoKey) as string;
	}

	const searchSchema = (data: any, props: string[], fullPath: string): string => {
		if (typeof data === 'string') return data;
		if (!data || typeof data !== 'object') return '';

		if (Array.isArray(data)) {
			// If the full path is 'author.name', concatenate the names
			if (fullPath === 'author.name') {
				return data.map((item: any) => searchSchema(item, ['name'], 'name')).filter(Boolean).join(', ');
			}
			return data.map((item: any) => searchSchema(item, props, fullPath)).filter(Boolean).join(', ');
		}

		const [currentProp, ...remainingProps] = props;
		if (!currentProp) {
			if (typeof data === 'string') return data;
			if (typeof data === 'object' && data.name) return data.name;
			return '';
		}

		const value = data[currentProp];
		if (value !== undefined) {
			return searchSchema(value, remainingProps, fullPath ? `${fullPath}.${currentProp}` : currentProp);
		}

		for (const key in data) {
			if (typeof data[key] === 'object') {
				const result = searchSchema(data[key], props, fullPath ? `${fullPath}.${key}` : key);
				if (result) return result;
			}
		}

		return '';
	};

	try {
		const result = searchSchema(schemaOrgData, property.split('.'), '') || defaultValue;
		getSchemaProperty.memoized.set(memoKey, result);
		return result;
	} catch (error) {
		console.error(`Error in getSchemaProperty for ${property}:`, error);
		return defaultValue;
	}
}

getSchemaProperty.memoized = new Map<string, string>();
