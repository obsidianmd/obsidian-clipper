import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './string-utils';
import { Readability } from '@mozilla/readability';
import { applyFilters } from './filters';
import browser from './browser-polyfill';
import { convertDate } from './date-utils';
import { debugLog } from './debug';
import dayjs from 'dayjs';

export function extractReadabilityContent(doc: Document): ReturnType<Readability['parse']> | null {
	try {
		const reader = new Readability(doc, {keepClasses:true})
		return reader.parse();
	} catch (error) {
		console.error('Error in extractReadabilityContent:', error);
		return null;
	}
}

async function processVariable(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const [, fullVariableName] = match.match(/{{(.*?)}}/) || [];
	const [variableName, ...filterParts] = fullVariableName.split('|');
	const filtersString = filterParts.join('|');
	const value = variables[`{{${variableName}}}`] || '';
	const result = applyFilters(value, filtersString, currentUrl);
	return result;
}

async function processSelector(tabId: number, match: string, currentUrl: string): Promise<string> {
	const selectorRegex = /{{selector:(.*?)(?:\|(.*?))?}}/;
	const matches = match.match(selectorRegex);
	if (!matches) {
		console.error('Invalid selector format:', match);
		return match;
	}

	const [, selector, filtersString] = matches;
	const { content } = await extractContentBySelector(tabId, selector);
	
	// Convert content to string if it's an array
	const contentString = Array.isArray(content) ? JSON.stringify(content) : content;
	
	debugLog('ContentExtractor', 'Applying filters:', { selector, filterString: filtersString });
	const filteredContent = applyFilters(contentString, filtersString, currentUrl);
	
	return filteredContent;
}

async function processSchema(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const [, fullSchemaKey] = match.match(/{{schema:(.*?)}}/) || [];
	const [schemaKey, ...filterParts] = fullSchemaKey.split('|');
	const filtersString = filterParts.join('|');

	let schemaValue = '';

	// Check if we're dealing with a nested array access
	const nestedArrayMatch = schemaKey.match(/(.*?)\[(\*|\d+)\](.*)/);
	if (nestedArrayMatch) {
		const [, arrayKey, indexOrStar, propertyKey] = nestedArrayMatch;

		// Handle shorthand notation for nested arrays
		let fullArrayKey = arrayKey;
		if (!arrayKey.includes('@')) {
			const matchingKey = Object.keys(variables).find(key => key.includes('@') && key.endsWith(`:${arrayKey}}}`));
			if (matchingKey) {
				fullArrayKey = matchingKey.replace('{{schema:', '').replace('}}', '');
			}
		}

		const arrayValue = JSON.parse(variables[`{{schema:${fullArrayKey}}}`] || '[]');
		if (Array.isArray(arrayValue)) {
			if (indexOrStar === '*') {
				schemaValue = JSON.stringify(arrayValue.map(item => getNestedProperty(item, propertyKey.slice(1))).filter(Boolean));
			} else {
				const index = parseInt(indexOrStar, 10);
				schemaValue = arrayValue[index] ? getNestedProperty(arrayValue[index], propertyKey.slice(1)) : '';
			}
		}
	} else {
		// Shorthand handling for non-array schemas
		if (!schemaKey.includes('@')) {
			const matchingKey = Object.keys(variables).find(key => key.includes('@') && key.endsWith(`:${schemaKey}}}`));
			if (matchingKey) {
				schemaValue = variables[matchingKey];
			}
		}
		// If no matching shorthand found or it's a full key, use the original logic
		if (!schemaValue) {
			schemaValue = variables[`{{schema:${schemaKey}}}`] || '';
		}
	}

	return applyFilters(schemaValue, filtersString, currentUrl);
}

async function processPrompt(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const promptRegex = /{{prompt:"(.*?)"(?:\|(.*?))?}}/;
	const matches = match.match(promptRegex);
	if (!matches) {
		console.error('Invalid prompt format:', match);
		return match;
	}

	const [, promptText, context = ''] = matches;
	
	// Return the original match without processing
	return match;
}

function getNestedProperty(obj: any, path: string): any {
	return path.split('.').reduce((prev, curr) => prev && prev[curr], obj);
}

export async function replaceVariables(tabId: number, text: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const regex = /{{(?:schema:)?(?:selector:)?(?:prompt:)?(.*?)}}/g;
	const matches = text.match(regex);

	if (matches) {
		for (const match of matches) {
			let replacement: string;
			if (match.startsWith('{{selector:')) {
				replacement = await processSelector(tabId, match, currentUrl);
			} else if (match.startsWith('{{schema:')) {
				replacement = await processSchema(match, variables, currentUrl);
			} else if (match.startsWith('{{prompt:')) {
				replacement = await processPrompt(match, variables, currentUrl);
			} else {
				const [variableName, ...filterParts] = match.slice(2, -2).split('|');
				let value = variables[`{{${variableName}}}`] || '';
				
				// Handle 'now' for date and time
				if (value === 'now' && !filterParts.some(part => part.startsWith('date:'))) {
					filterParts.unshift('date:"YYYY-MM-DD"');
				}
				
				// Handle published date
				if (variableName === 'published' && !filterParts.some(part => part.startsWith('date:'))) {
					if (dayjs(value).isValid()) {
						// If it's a valid date with time, use a format that includes time
						filterParts.unshift('date:"YYYY-MM-DD HH:mm:ss"');
					} else {
						// If it's just a date or invalid, use only the date format
						filterParts.unshift('date:"YYYY-MM-DD"');
					}
				}
				
				const filtersString = filterParts.join('|');
				replacement = applyFilters(value, filtersString, currentUrl);
			}
			text = text.replace(match, replacement);
		}
	}
	return text;
}

export async function extractPageContent(tabId: number): Promise<{
	content: string;
	selectedHtml: string;
	extractedContent: ExtractedContent;
	schemaOrgData: any;
	fullHtml: string;
} | null> {
	try {
		const response = await browser.tabs.sendMessage(tabId, { action: "getPageContent" });
		if (response && response.content) {
			return {
				content: response.content,
				selectedHtml: response.selectedHtml,
				extractedContent: response.extractedContent,
				schemaOrgData: response.schemaOrgData,
				fullHtml: response.fullHtml
			};
		}
		return null;
	} catch (error) {
		console.error('Error extracting page content:', error);
		return null;
	}
}

export function getMetaContent(doc: Document, attr: string, value: string): string {
	const selector = `meta[${attr}]`;
	const element = Array.from(doc.querySelectorAll(selector))
		.find(el => el.getAttribute(attr)?.toLowerCase() === value.toLowerCase());
	return element ? element.getAttribute("content")?.trim() ?? "" : "";
}

export async function extractContentBySelector(tabId: number, selector: string): Promise<{ content: string; schemaOrgData: any }> {
	const attributeMatch = selector.match(/:([a-zA-Z-]+)$/);
	let baseSelector = selector;
	let attribute: string | undefined;

	if (attributeMatch) {
		attribute = attributeMatch[1];
		baseSelector = selector.slice(0, -attribute.length - 1);
	}

	try {
		const response = await browser.tabs.sendMessage(tabId, { action: "extractContent", selector: baseSelector, attribute: attribute });
		let content = response ? response.content : '';
		
		// Ensure content is always a string
		if (Array.isArray(content)) {
			content = JSON.stringify(content);
		}
		
		return {
			content: content,
			schemaOrgData: response ? response.schemaOrgData : null
		};
	} catch (error) {
		console.error('Error extracting content by selector:', error);
		return { content: '', schemaOrgData: null };
	}
}

export async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent, currentUrl: string, schemaOrgData: any, fullHtml: string) {
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
			|| getMetaContent(doc, "name", "title")
			|| doc.querySelector('title')?.textContent?.trim()
			|| '';

		const noteName = sanitizeFileName(title);

		const author =
			getMetaContent(doc, "name", "author")
			|| getMetaContent(doc, "property", "author")
			|| getMetaContent(doc, "name", "twitter:creator")
			|| getMetaContent(doc, "property", "og:site_name")
			|| getMetaContent(doc, "name", "application-name")
			|| getMetaContent(doc, "name", "copyright")
			|| '';

		const description =
			getMetaContent(doc, "name", "description")
			|| getMetaContent(doc, "property", "description")
			|| getMetaContent(doc, "property", "og:description")
			|| getMetaContent(doc, "name", "twitter:description")
			|| '';

		const domain = new URL(currentUrl).hostname.replace(/^www\./, '');

		const image =
			getMetaContent(doc, "property", "og:image")
			|| getMetaContent(doc, "name", "twitter:image")
			|| '';

		const timeElement = doc.querySelector("time");
		const publishedDate = 
			getMetaContent(doc, "property", "article:published_time")
			|| timeElement?.getAttribute("datetime");
		
		const published = publishedDate ? dayjs(publishedDate).isValid() ? publishedDate : dayjs(publishedDate).format('YYYY-MM-DD') : "";

		const site =
			getMetaContent(doc, "property", "og:site_name")
			|| getMetaContent(doc, "name", "application-name")
			|| getMetaContent(doc, "name", "copyright")
			|| '';

		if (selectedHtml) {
			content = selectedHtml;
		} else if (readabilityArticle && readabilityArticle.content) {
			content = readabilityArticle.content;
		} else {
			content = doc.body.innerHTML || fullHtml;
		}

		const markdownBody = createMarkdownContent(content, currentUrl);

		const currentVariables: { [key: string]: string } = {
			'{{author}}': author,
			'{{content}}': markdownBody,
			'{{contentHtml}}': content,
			'{{date}}': 'now',
			'{{time}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ'),
			'{{description}}': description,
			'{{domain}}': domain,
			'{{fullHtml}}': fullHtml,
			'{{image}}': image,
			'{{noteName}}': noteName,
			'{{published}}': published,
			'{{site}}': site,
			'{{title}}': title,
			'{{url}}': currentUrl
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

		console.log('Available variables:', currentVariables);

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
		Object.entries(schemaData).forEach(([key, value]) => {
			if (key === '@type') return; // Skip @type as it's used in the prefix
			
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