import { ExtractedContent } from '../types/types';
import { ExtractorRegistry } from './extractor-registry';
import { createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './string-utils';
import { Tidy } from './tidy';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';
import { AnyHighlightData, TextHighlightData, HighlightData } from './highlighter';
import { generalSettings } from './storage-utils';
import { 
	getElementByXPath,
	wrapElementWithMark,
	wrapTextWithMark 
} from './dom-utils';

// Define ElementHighlightData type inline since it's not exported from highlighter.ts
interface ElementHighlightData extends HighlightData {
	type: 'element';
}

function canHighlightElement(element: Element): boolean {
	// List of elements that can't be nested inside mark
	const unsupportedElements = ['img', 'video', 'audio', 'iframe', 'canvas', 'svg', 'math', 'table'];
	
	// Check if the element contains any unsupported elements
	const hasUnsupportedElements = unsupportedElements.some(tag => 
		element.getElementsByTagName(tag).length > 0
	);
	
	// Check if the element itself is an unsupported type
	const isUnsupportedType = unsupportedElements.includes(element.tagName.toLowerCase());
	
	return !hasUnsupportedElements && !isUnsupportedType;
}

function stripHtml(html: string): string {
	const div = document.createElement('div');
	div.innerHTML = html;
	return div.textContent || '';
}

export function extractTidyContent(doc: Document): ReturnType<typeof Tidy.parse> | null {
	try {
		return Tidy.parse(doc);
	} catch (error) {
		console.error('Error in extractTidyContent:', error);
		return null;
	}
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
			const tidyArticle = Tidy.parseFromString(response.content);
			if (tidyArticle) {
				response.content = tidyArticle.content;
			}

			// Ensure highlights are of the correct type
			if (response.highlights && Array.isArray(response.highlights)) {
				response.highlights = response.highlights.map((highlight: string | AnyHighlightData) => {
					if (typeof highlight === 'string') {
						// Convert string to AnyHighlightData
						return {
							type: 'text',
							id: Date.now().toString(),
							xpath: '',
							content: `<div>` + highlight + `</div>`,
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

interface ExtractorVariables {
	[key: string]: string;
}

export async function initializePageContent(
	content: string, 
	selectedHtml: string, 
	extractedContent: ExtractedContent, 
	currentUrl: string, 
	schemaOrgData: any,
	fullHtml: string, 
	highlights: AnyHighlightData[]
) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');
		currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

		const extractor = ExtractorRegistry.findExtractor(doc, currentUrl, schemaOrgData);
		let tidyArticle = null;
		let extractorVariables: ExtractorVariables = {};
		
		if (selectedHtml) {
			content = selectedHtml;
		} else if (extractor) {
			debugLog('Content', 'Using custom extractor');
			const extractedResult = extractor.extract();
			content = extractedResult.contentHtml;
			if (extractedResult.extractedContent) {
				extractedContent = { ...extractedContent, ...extractedResult.extractedContent };
			}
			if (extractedResult.variables) {
				extractorVariables = extractedResult.variables;
			}
		} else {
			const tidyArticle = extractTidyContent(doc);
			if (tidyArticle && tidyArticle.content) {
				content = tidyArticle.content;
			} else {
				content = doc.body.innerHTML || fullHtml;
			}
		}

		// Define preset variables with fallbacks, using extractor variables first
		const title =
			extractorVariables['title'] ||
			getMetaContent(doc, "property", "og:title") ||
			getMetaContent(doc, "name", "twitter:title") ||
			getSchemaProperty(schemaOrgData, 'headline') ||
			getMetaContent(doc, "name", "title") ||
			getMetaContent(doc, "name", "sailthru.title") ||
			doc.querySelector('title')?.textContent?.trim() ||
			'';

		const noteName = sanitizeFileName(title);

		const authorName =
			extractorVariables['author'] ||
			getMetaContent(doc, "name", "sailthru.author") ||
			getSchemaProperty(schemaOrgData, 'author.name') ||
			getMetaContent(doc, "property", "author") ||
			getMetaContent(doc, "name", "byl") ||
			getMetaContent(doc, "name", "author") ||
			getMetaContent(doc, "name", "copyright") ||
			getSchemaProperty(schemaOrgData, 'copyrightHolder.name') ||
			getMetaContent(doc, "property", "og:site_name") ||
			getSchemaProperty(schemaOrgData, 'publisher.name') ||
			getMetaContent(doc, "property", "og:site_name") ||
			getSchemaProperty(schemaOrgData, 'sourceOrganization.name') ||
			getSchemaProperty(schemaOrgData, 'isPartOf.name') ||
			getMetaContent(doc, "name", "twitter:creator") ||
			getMetaContent(doc, "name", "application-name") ||
			'';

		const description =
			extractorVariables['description'] ||
			getMetaContent(doc, "name", "description") ||
			getMetaContent(doc, "property", "description") ||
			getMetaContent(doc, "property", "og:description") ||
			getSchemaProperty(schemaOrgData, 'description') ||
			getMetaContent(doc, "name", "twitter:description") ||
			getMetaContent(doc, "name", "sailthru.description") ||
			'';

		const domain = new URL(currentUrl).hostname.replace(/^www\./, '');

		const image =
			extractorVariables['image'] ||
			getMetaContent(doc, "property", "og:image") ||
			getMetaContent(doc, "name", "twitter:image") ||
			getSchemaProperty(schemaOrgData, 'image.url') ||
			getMetaContent(doc, "name", "sailthru.image.full") ||
			'';

		const published =
			extractorVariables['published'] ||
			getSchemaProperty(schemaOrgData, 'datePublished') ||
			getMetaContent(doc, "property", "article:published_time") ||
			getTimeElement(doc) ||
			getMetaContent(doc, "name", "sailthru.date") ||
			'';

		const site =
			extractorVariables['site'] ||
			getSchemaProperty(schemaOrgData, 'publisher.name') ||
			getMetaContent(doc, "property", "og:site_name") ||
			getSchemaProperty(schemaOrgData, 'sourceOrganization.name') ||
			getMetaContent(doc, "name", "copyright") ||
			getSchemaProperty(schemaOrgData, 'copyrightHolder.name') ||
			getSchemaProperty(schemaOrgData, 'isPartOf.name') ||
			getMetaContent(doc, "name", "application-name") ||
			'';

		const favicon =
			extractorVariables['favicon'] ||
			getMetaContent(doc, "property", "og:image:favicon") ||
			doc.querySelector("link[rel='icon']")?.getAttribute("href") ||
			doc.querySelector("link[rel='shortcut icon']")?.getAttribute("href") ||
			new URL("/favicon.ico", currentUrl).href;

		// Process highlights after getting the base content
		if (generalSettings.highlighterEnabled && generalSettings.highlightBehavior !== 'no-highlights' && highlights && highlights.length > 0) {
			content = processHighlights(content, highlights, tidyArticle);
		}

		const markdownBody = createMarkdownContent(content, currentUrl);

		// Convert each highlight to markdown individually and create an object with text, timestamp, and notes (if not empty)
		const highlightsData = highlights.map(highlight => {
			const highlightData: {
				text: string;
				timestamp: string;
				notes?: string[];
			} = {
				text: createMarkdownContent(highlight.content, currentUrl),
				timestamp: dayjs(parseInt(highlight.id)).toISOString(), // Convert to ISO format
			};
			
			if (highlight.notes && highlight.notes.length > 0) {
				highlightData.notes = highlight.notes;
			}
			
			return highlightData;
		});

		const currentVariables: { [key: string]: string } = {
			'{{author}}': authorName.trim(),
			'{{content}}': markdownBody.trim(),
			'{{contentHtml}}': content.trim(),
			'{{date}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ').trim(),
			'{{time}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ').trim(),
			'{{description}}': description.trim(),
			'{{domain}}': domain.trim(),
			'{{favicon}}': favicon.trim(),
			'{{fullHtml}}': fullHtml.trim(),
			'{{image}}': image.trim(),
			'{{noteName}}': noteName.trim(),
			'{{published}}': published.split(',')[0].trim(),
			'{{site}}': site.trim(),
			'{{title}}': title.trim(),
			'{{url}}': currentUrl.trim(),
			'{{highlights}}': highlights.length > 0 ? JSON.stringify(highlightsData) : '',
		};

		// Add extracted content to variables
		Object.entries(extractedContent).forEach(([key, value]) => {
			currentVariables[`{{${key}}}`] = value;
		});

		// Update the forEach to handle types properly
		Object.entries(extractorVariables).forEach(([key, value]: [string, string]) => {
			if (!currentVariables[`{{${key}}}`]) {
				currentVariables[`{{${key}}}`] = value.trim();
			}
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

	const searchSchema = (data: any, props: string[], fullPath: string, isExactMatch: boolean = true): string[] => {
		if (typeof data === 'string') {
			return props.length === 0 ? [data] : [];
		}
		
		if (!data || typeof data !== 'object') {
			return [];
		}

		if (Array.isArray(data)) {

			const currentProp = props[0];
			if (/^\[\d+\]$/.test(currentProp)) {
				const index = parseInt(currentProp.slice(1, -1));
				if (data[index]) {
					return searchSchema(data[index], props.slice(1), fullPath, isExactMatch);
				}
				return [];
			}
			
			if (props.length === 0 && data.every(item => typeof item === 'string' || typeof item === 'number')) {
				return data.map(String);
			}
			
			// Collect all matches from array items
			const results = data.flatMap(item => 
				searchSchema(item, props, fullPath, isExactMatch)
			);
			return results;
		}

		const [currentProp, ...remainingProps] = props;
		
		if (!currentProp) {
			if (typeof data === 'string') return [data];
			if (typeof data === 'object' && data.name) {
				return [data.name];
			}
			return [];
		}

		// Check for exact path match first
		if (data.hasOwnProperty(currentProp)) {
			return searchSchema(data[currentProp], remainingProps, 
				fullPath ? `${fullPath}.${currentProp}` : currentProp, true);
		}

		// Only search nested objects if we're allowing non-exact matches
		if (!isExactMatch) {
			const nestedResults: string[] = [];
			for (const key in data) {
				if (typeof data[key] === 'object') {
					const results = searchSchema(data[key], props, 
						fullPath ? `${fullPath}.${key}` : key, false);
					nestedResults.push(...results);
				}
			}
			if (nestedResults.length > 0) {
				return nestedResults;
			}
		}

		return [];
	};

	try {
		// First try exact match
		let results = searchSchema(schemaOrgData, property.split('.'), '', true);
		
		// If no exact match found, try recursive search
		if (results.length === 0) {
			results = searchSchema(schemaOrgData, property.split('.'), '', false);
		}
		
		const result = results.length > 0 ? results.filter(Boolean).join(', ') : defaultValue;
		
		getSchemaProperty.memoized.set(memoKey, result);
		return result;
	} catch (error) {
		console.error(`Error in getSchemaProperty for ${property}:`, error);
		return defaultValue;
	}
}

getSchemaProperty.memoized = new Map<string, string>();

function processHighlights(content: string, highlights: AnyHighlightData[], tidyArticle: ReturnType<typeof Tidy.parse> | null): string {
	// First check if highlighter is enabled and we have highlights
	if (!generalSettings.highlighterEnabled || !highlights?.length) {
		return content;
	}

	// Then check the behavior setting
	if (generalSettings.highlightBehavior === 'no-highlights') {
		return content;
	}

	if (generalSettings.highlightBehavior === 'replace-content') {
		return highlights.map(highlight => highlight.content).join('');
	}

	if (generalSettings.highlightBehavior === 'highlight-inline') {
		// Use Tidy content if available, otherwise fall back to original content
		const processedContent = tidyArticle?.content || content;
		debugLog('Highlights', 'Using content length:', processedContent.length);

		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = processedContent;

		const textHighlights = filterAndSortHighlights(highlights);
		debugLog('Highlights', 'Processing highlights:', textHighlights.length);

		for (const highlight of textHighlights) {
			processHighlight(highlight, tempDiv);
		}

		return tempDiv.innerHTML;
	}

	// Default fallback
	return content;
}

function filterAndSortHighlights(highlights: AnyHighlightData[]): (TextHighlightData | ElementHighlightData)[] {
	return highlights
		.filter((h): h is (TextHighlightData | ElementHighlightData) => {
			if (h.type === 'text') {
				return !!(h.xpath?.trim() || h.content?.trim());
			}
			if (h.type === 'element' && h.xpath?.trim()) {
				const element = getElementByXPath(h.xpath);
				return element ? canHighlightElement(element) : false;
			}
			return false;
		})
		.sort((a, b) => {
			if (a.xpath && b.xpath) {
				const elementA = getElementByXPath(a.xpath);
				const elementB = getElementByXPath(b.xpath);
				if (elementA === elementB && a.type === 'text' && b.type === 'text') {
					return b.startOffset - a.startOffset;
				}
			}
			return 0;
		});
}

function processHighlight(highlight: TextHighlightData | ElementHighlightData, tempDiv: HTMLDivElement) {
	try {
		if (highlight.xpath) {
			processXPathHighlight(highlight, tempDiv);
		} else {
			processContentBasedHighlight(highlight, tempDiv);
		}
	} catch (error) {
		debugLog('Highlights', 'Error processing highlight:', error);
	}
}

function processXPathHighlight(highlight: TextHighlightData | ElementHighlightData, tempDiv: HTMLDivElement) {
	const element = document.evaluate(
		highlight.xpath,
		tempDiv,
		null,
		XPathResult.FIRST_ORDERED_NODE_TYPE,
		null
	).singleNodeValue as Element;

	if (!element) {
		debugLog('Highlights', 'Could not find element for xpath:', highlight.xpath);
		return;
	}

	if (highlight.type === 'element') {
		wrapElementWithMark(element);
	} else {
		wrapTextWithMark(element, highlight as TextHighlightData);
	}
}

function processContentBasedHighlight(highlight: TextHighlightData | ElementHighlightData, tempDiv: HTMLDivElement) {
	const contentDiv = document.createElement('div');
	contentDiv.innerHTML = highlight.content;

	const innerContent = contentDiv.children.length === 1 && 
		contentDiv.firstElementChild?.tagName === 'DIV' ? 
		contentDiv.firstElementChild.innerHTML : 
		contentDiv.innerHTML;

	const paragraphs = Array.from(contentDiv.querySelectorAll('p'));
	if (paragraphs.length) {
		processContentParagraphs(paragraphs, tempDiv);
	} else {
		processInlineContent(innerContent, tempDiv);
	}
}

function processContentParagraphs(sourceParagraphs: Element[], tempDiv: HTMLDivElement) {
	sourceParagraphs.forEach(sourceParagraph => {
		const sourceText = stripHtml(sourceParagraph.outerHTML).trim();
		debugLog('Highlights', 'Looking for paragraph:', sourceText);
		
		const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
		for (const targetParagraph of paragraphs) {
			const targetText = stripHtml(targetParagraph.outerHTML).trim();
			
			if (targetText === sourceText) {
				debugLog('Highlights', 'Found matching paragraph:', targetParagraph.outerHTML);
				wrapElementWithMark(targetParagraph);
				break;
			}
		}
	});
}

function processInlineContent(content: string, tempDiv: HTMLDivElement) {
	const searchText = stripHtml(content).trim();
	debugLog('Highlights', 'Searching for text:', searchText);
	
	const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
	
	let node;
	while (node = walker.nextNode() as Text) {
		const nodeText = node.textContent || '';
		const index = nodeText.indexOf(searchText);
		
		if (index !== -1) {
			debugLog('Highlights', 'Found matching text in node:', {
				text: nodeText,
				index: index
			});
			
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + searchText.length);
			
			const mark = document.createElement('mark');
			range.surroundContents(mark);
			debugLog('Highlights', 'Created mark element:', mark.outerHTML);
			break;
		}
	}
}
