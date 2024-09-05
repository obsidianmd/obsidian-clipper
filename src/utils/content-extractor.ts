import { ExtractedContent } from '../types/types';
import { extractReadabilityContent, createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './obsidian-note-creator';
import dayjs from 'dayjs';

type FilterFunction = (value: string) => string;

const filters: { [key: string]: FilterFunction } = {
	kebab: (str: string) => str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.toLowerCase(),
	list: (str: string) => {
		try {
			const arrayValue = JSON.parse(str);
			if (Array.isArray(arrayValue)) {
				return arrayValue.map(item => `- ${item}`).join('\n');
			}
		} catch (error) {
			console.error('Error parsing JSON for list filter:', error);
		}
		return str;
	},
};

function applyFilters(value: string, filterNames: string[]): string {
	return filterNames.reduce((result, filterName) => {
		const filter = filters[filterName];
		return filter ? filter(result) : result;
	}, value);
}

async function processVariable(match: string, variables: { [key: string]: string }): Promise<string> {
	const [, variableName, filtersString] = match.match(/{{(.*?)((?:\|[a-z]+)*)?}}/) || [];
	const value = variables[`{{${variableName}}}`] || '';
	const filterNames = (filtersString || '').split('|').filter(Boolean);
	return applyFilters(value, filterNames);
}

async function processSelector(tabId: number, match: string): Promise<string> {
	const [, selector, filtersString] = match.match(/{{selector:(.*?)((?:\|[a-z]+)*)?}}/) || [];
	const { content } = await extractContentBySelector(tabId, selector);
	const filterNames = (filtersString || '').split('|').filter(Boolean);
	return applyFilters(content, filterNames);
}

async function processSchema(match: string, variables: { [key: string]: string }): Promise<string> {
	const [, schemaKey, filtersString] = match.match(/{{schema:(.*?)((?:\|[a-z]+)*)?}}/) || [];
	let schemaValue = '';
	
	// Check if we're dealing with a nested array access
	const nestedArrayMatch = schemaKey.match(/(.*?)\.\[\*\]\.(.*)/);
	if (nestedArrayMatch) {
		const [, arrayKey, propertyKey] = nestedArrayMatch;
		const arrayValue = JSON.parse(variables[`{{schema:${arrayKey}}}`] || '[]');
		if (Array.isArray(arrayValue)) {
			schemaValue = JSON.stringify(arrayValue.map(item => item[propertyKey]));
		}
	} else {
		// Try to find the exact match first
		if (variables[`{{schema:${schemaKey}}}`]) {
			schemaValue = variables[`{{schema:${schemaKey}}}`];
		} else {
			// If not found, try to find a partial match
			const partialMatches = Object.keys(variables).filter(key => key.startsWith(`{{schema:${schemaKey}`));
			if (partialMatches.length > 0) {
				schemaValue = variables[partialMatches[0]];
			}
		}
	}

	const filterNames = (filtersString || '').split('|').filter(Boolean);
	return applyFilters(schemaValue, filterNames);
}

export async function replaceVariables(tabId: number, text: string, variables: { [key: string]: string }): Promise<string> {
	const regex = /{{(?:schema:)?(?:selector:)?(.*?)((?:\|[a-z]+)*)?}}/g;
	const matches = text.match(regex);

	if (matches) {
		for (const match of matches) {
			let replacement: string;
			if (match.startsWith('{{selector:')) {
				replacement = await processSelector(tabId, match);
			} else if (match.startsWith('{{schema:')) {
				replacement = await processSchema(match, variables);
			} else {
				replacement = await processVariable(match, variables);
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
} | null> {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, { action: "getPageContent" }, function(response) {
			if (response && response.content) {
				resolve({
					content: response.content,
					selectedHtml: response.selectedHtml,
					extractedContent: response.extractedContent,
					schemaOrgData: response.schemaOrgData
				});
			} else {
				resolve(null);
			}
		});
	});
}

export function getMetaContent(doc: Document, attr: string, value: string): string {
	const selector = `meta[${attr}]`;
	const element = Array.from(doc.querySelectorAll(selector))
		.find(el => el.getAttribute(attr)?.toLowerCase() === value.toLowerCase());
	return element ? element.getAttribute("content")?.trim() ?? "" : "";
}

export async function extractContentBySelector(tabId: number, selector: string): Promise<{ content: string; schemaOrgData: any }> {
	return new Promise((resolve) => {
		chrome.tabs.sendMessage(tabId, { action: "extractContent", selector: selector }, function(response) {
			resolve({
				content: response ? response.content : '',
				schemaOrgData: response ? response.schemaOrgData : null
			});
		});
	});
}

export async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent, currentUrl: string, schemaOrgData: any) {
	const readabilityArticle = extractReadabilityContent(content);
	if (!readabilityArticle) {
		console.error('Failed to parse content with Readability');
		return null;
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');

	// Define preset variables with fallbacks
	const title =
		getMetaContent(doc, "property", "og:title")
		|| getMetaContent(doc, "name", "twitter:title")
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
	const published = publishedDate ? `${convertDate(new Date(publishedDate))}` : "";

	const site =
		getMetaContent(doc, "property", "og:site_name")
		|| getMetaContent(doc, "name", "application-name")
		|| getMetaContent(doc, "name", "copyright")
		|| '';

	const markdownBody = createMarkdownContent(content, currentUrl, selectedHtml);

	const currentVariables: { [key: string]: string } = {
		'{{author}}': author,
		'{{content}}': markdownBody,
		'{{description}}': description,
		'{{domain}}': domain,
		'{{image}}': image,
		'{{published}}': published,
		'{{site}}': site,
		'{{title}}': title,
		'{{noteName}}': noteName,
		'{{today}}': convertDate(new Date()),
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
}

function convertDate(date: Date): string {
	return dayjs(date).format('YYYY-MM-DD');
}

function addSchemaOrgDataToVariables(schemaData: any, variables: { [key: string]: string }, prefix: string = '') {
	if (Array.isArray(schemaData)) {
		// Add the entire array as a JSON string
		const variableKey = `{{schema:${prefix.slice(0, -1)}}}`;
		variables[variableKey] = JSON.stringify(schemaData);

		// If there's only one item, add it without an index
		if (schemaData.length === 1) {
			addSchemaOrgDataToVariables(schemaData[0], variables, prefix);
		} else {
			// If there's more than one item, add them with indices
			schemaData.forEach((item, index) => {
				addSchemaOrgDataToVariables(item, variables, `${prefix}[${index}].`);
			});
		}
	} else if (typeof schemaData === 'object' && schemaData !== null) {
		Object.entries(schemaData).forEach(([key, value]) => {
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
				const variableKey = `{{schema:${prefix}${key}}}`;
				variables[variableKey] = String(value);
			} else if (Array.isArray(value)) {
				addSchemaOrgDataToVariables(value, variables, `${prefix}${key}.`);
			} else if (typeof value === 'object' && value !== null) {
				addSchemaOrgDataToVariables(value, variables, `${prefix}${key}.`);
			}
		});
	}
}