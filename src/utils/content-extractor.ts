import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './string-utils';
import { Readability } from '@mozilla/readability';
import { applyFilters } from './filters';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';
import { generalSettings } from '../utils/storage-utils';

export function extractReadabilityContent(doc: Document): ReturnType<Readability['parse']> | null {
	try {
		const reader = new Readability(doc, {keepClasses:true})
		return reader.parse();
	} catch (error) {
		console.error('Error in extractReadabilityContent:', error);
		return null;
	}
}

async function processSelector(tabId: number, match: string, currentUrl: string): Promise<string> {
	const selectorRegex = /{{(selector|selectorHtml):(.*?)(?:\?(.*?))?(?:\|(.*?))?}}/;
	const matches = match.match(selectorRegex);
	if (!matches) {
		console.error('Invalid selector format:', match);
		return match;
	}

	const [, selectorType, rawSelector, attribute, filtersString] = matches;
	const extractHtml = selectorType === 'selectorHtml';

	// Unescape any escaped quotes in the selector
	const selector = rawSelector.replace(/\\"/g, '"');

	try {
		const response = await browser.tabs.sendMessage(tabId, { 
			action: "extractContent", 
			selector: selector,
			attribute: attribute,
			extractHtml: extractHtml
		}) as { content: string };

		let content = response ? response.content : '';
	
		// Convert content to string if it's an array
		const contentString = Array.isArray(content) ? JSON.stringify(content) : content;
	
		debugLog('ContentExtractor', 'Applying filters:', { selector, filterString: filtersString });
		const filteredContent = applyFilters(contentString, filtersString, currentUrl);
	
		return filteredContent;
	} catch (error) {
		console.error('Error extracting content by selector:', error, { selector, attribute, extractHtml });
		return '';
	}
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

// This function doesn't really do anything, it just returns the whole prompt variable
// so that it's still visible in the input fields in the popup
async function processPrompt(match: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	if (generalSettings.interpreterEnabled) {
		const promptRegex = /{{prompt:\\?"(.*?)\\?"(\|.*?)?}}/;
		const matches = match.match(promptRegex);
		if (!matches) {
			console.error('Invalid prompt format:', match);
			return match;
		}
	
		const [, promptText, filters = ''] = matches;
	
		return match;
	} else {
		return '';
	}
}

function getNestedProperty(obj: any, path: string): any {
	return path.split('.').reduce((prev, curr) => prev && prev[curr], obj);
}

export async function replaceVariables(tabId: number, text: string, variables: { [key: string]: string }, currentUrl: string): Promise<string> {
	const regex = /{{(?:schema:)?(?:selector:)?(?:selectorHtml:)?(?:prompt:)?\s*([\s\S]*?)\s*}}/g;
	const matches = text.match(regex);

	if (matches) {
		for (const match of matches) {
			let replacement: string;
			const trimmedMatch = match.trim().slice(2, -2).trim();
			const normalizedMatch = trimmedMatch.replace(/\s+/g, ' ');
			
			if (normalizedMatch.startsWith('selector:') || normalizedMatch.startsWith('selectorHtml:')) {
				const [selectorType, ...selectorParts] = normalizedMatch.split(':');
				const selector = selectorParts.join(':').trim();
				const reconstructedMatch = `{{${selectorType}:${selector}}}`;
				replacement = await processSelector(tabId, reconstructedMatch, currentUrl);
			} else if (normalizedMatch.startsWith('schema:')) {
				replacement = await processSchema(match, variables, currentUrl);
			} else if (normalizedMatch.startsWith('prompt:')) {
				replacement = await processPrompt(match, variables, currentUrl);
			} else {
				const [variableName, ...filterParts] = normalizedMatch.split('|').map(part => part.trim());
				let value = variables[`{{${variableName.trim()}}}`] || '';				
				const filtersString = filterParts.join('|');
				replacement = applyFilters(value, filtersString, currentUrl);
			}
			text = text.replace(match, replacement);
		}
	}
	return text;
}

interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: ExtractedContent;
	schemaOrgData: any;
	fullHtml: string;
	highlights?: string[];
}

export async function extractPageContent(tabId: number): Promise<ContentResponse | null> {
	try {
		const response = await browser.tabs.sendMessage(tabId, { action: "getPageContent" }) as ContentResponse;
		if (response && response.content) {
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

export async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent, currentUrl: string, schemaOrgData: any, fullHtml: string, highlights: string[]) {
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
			const highlightsContent = highlights.join('\n\n\n');
			content = highlightsContent;
		} else if (selectedHtml) {
			content = selectedHtml;
		} else if (readabilityArticle && readabilityArticle.content) {
			content = readabilityArticle.content;
		} else {
			content = doc.body.innerHTML || fullHtml;
		}

		const markdownBody = createMarkdownContent(content, currentUrl);

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
			'{{url}}': currentUrl.trim()
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