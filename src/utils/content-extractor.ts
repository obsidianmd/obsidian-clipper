import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from './markdown-converter';
import { sanitizeFileName, getDomain } from './string-utils';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';
import { 
	AnyHighlightData, 
	TextHighlightData, 
	ElementHighlightData,
	FragmentHighlightData,
	HighlightData
} from './highlighter';
import { generalSettings } from './storage-utils';
import { 
	getElementByXPath,
	wrapElementWithMark,
	wrapTextWithMark 
} from './dom-utils';

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

interface ContentResponse {
	content: string;
	selectedHtml: string;
	extractedContent: ExtractedContent;
	schemaOrgData: any;
	fullHtml: string;
	highlights: AnyHighlightData[];
	title: string;
	author: string;
	description: string;
	domain: string;
	favicon: string;
	image: string;
	parseTime: number;
	published: string;
	site: string;
	wordCount: number;
	metaTags: { name?: string | null; property?: string | null; content: string | null }[];
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

export async function initializePageContent(
	content: string,
	selectedHtml: string,
	extractedContent: ExtractedContent,
	currentUrl: string,
	schemaOrgData: any,
	fullHtml: string,
	highlights: AnyHighlightData[],
	title: string,
	author: string,
	description: string,
	favicon: string,
	image: string,
	published: string,
	site: string,
	wordCount: number,
	metaTags: { name?: string | null; property?: string | null; content: string | null }[]
) {
	try {
		currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

		if (selectedHtml) {
			content = selectedHtml;
		}

		const noteName = sanitizeFileName(title);

		// Process highlights after getting the base content
		if (generalSettings.highlighterEnabled && generalSettings.highlightBehavior !== 'no-highlights' && highlights && highlights.length > 0) {
			content = processHighlights(content, highlights);
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
			'{{author}}': author.trim(),
			'{{content}}': markdownBody.trim(),
			'{{contentHtml}}': content.trim(),
			'{{date}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ').trim(),
			'{{time}}': dayjs().format('YYYY-MM-DDTHH:mm:ssZ').trim(),
			'{{description}}': description.trim(),
			'{{domain}}': getDomain(currentUrl),
			'{{favicon}}': favicon,
			'{{fullHtml}}': fullHtml.trim(),
			'{{highlights}}': highlights.length > 0 ? JSON.stringify(highlightsData) : '',
			'{{image}}': image,
			'{{noteName}}': noteName.trim(),
			'{{published}}': published.split(',')[0].trim(),
			'{{site}}': site.trim(),
			'{{title}}': title.trim(),
			'{{url}}': currentUrl.trim(),
			'{{words}}': wordCount.toString(),
		};

		// Add extracted content to variables
		Object.entries(extractedContent).forEach(([key, value]) => {
			currentVariables[`{{${key}}}`] = value;
		});

		// Add all meta tags to variables
		metaTags.forEach(meta => {
			const name = meta.name;
			const property = meta.property;
			const content = meta.content;

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

function processHighlights(content: string, highlights: AnyHighlightData[]): string {
	// First check if highlighter is enabled and we have highlights
	if (!generalSettings.highlighterEnabled || !highlights?.length) {
		return content;
	}

	// Then check the behavior setting
	if (generalSettings.highlightBehavior === 'no-highlights') {
		return content;
	}

	if (generalSettings.highlightBehavior === 'replace-content') {
		// For replace-content, just join the content strings
		return highlights.map(highlight => highlight.content).join('\n\n'); // Add newline separation
	}

	if (generalSettings.highlightBehavior === 'highlight-inline') {
		debugLog('Highlights', 'Using content length:', content.length);

		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = content;

		// Filter and sort highlights suitable for inline marking
		const processableHighlights = filterAndSortHighlights(highlights);
		debugLog('Highlights', 'Processing highlights:', processableHighlights.length);

		for (const highlight of processableHighlights) {
			processHighlight(highlight, tempDiv);
		}

		return tempDiv.innerHTML;
	}

	// Default fallback
	return content;
}

function filterAndSortHighlights(highlights: AnyHighlightData[]): (TextHighlightData | ElementHighlightData | FragmentHighlightData)[] {
	return highlights
		.filter((h): h is (TextHighlightData | ElementHighlightData | FragmentHighlightData) => {
			if (h.type === 'text') {
				// Keep text highlights with content or xpath
				return !!(h.xpath?.trim() || h.content?.trim());
			}
			if (h.type === 'fragment') {
				// Keep fragment highlights (they always have content/textStart)
				return true;
			}
			if (h.type === 'element') {
				// Keep element highlights if the element exists and can be highlighted
				if (!h.xpath?.trim()) return false;
				const element = getElementByXPath(h.xpath);
				return element ? canHighlightElement(element) : false;
			}
			// Ignore complex highlights for inline processing for now
			return false;
		})
		// Sort primarily to handle nested text/fragment highlights correctly
		// Process inner highlights before outer ones by sorting descending by start offset/position
		.sort((a, b) => {
			const elementA = a.xpath ? getElementByXPath(a.xpath) : null;
			const elementB = b.xpath ? getElementByXPath(b.xpath) : null;

			// If elements differ, sort by DOM order (or lack of element last)
			if (elementA !== elementB) {
				if (!elementA) return 1;
				if (!elementB) return -1;
				// Compare position returns bitmask: 2 = preceding, 4 = following
				const comparison = elementA.compareDocumentPosition(elementB);
				if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
				if (comparison & Node.DOCUMENT_POSITION_PRECEDING) return 1;
				return 0;
			}

			// If elements are the same, sort text/fragments by start offset (descending)
			if ((a.type === 'text' || a.type === 'fragment') && (b.type === 'text' || b.type === 'fragment')) {
				// Need a way to get start position for fragments - approximate using content search?
				// For now, just sort text highlights by offset descending.
				if (a.type === 'text' && b.type === 'text') {
					return b.startOffset - a.startOffset;
				}
			}
			// Keep relative order for elements or mixed types within the same parent
			return 0;
		}) as (TextHighlightData | ElementHighlightData | FragmentHighlightData)[]; // Cast needed after filter/sort
}

function processHighlight(highlight: TextHighlightData | ElementHighlightData | FragmentHighlightData, tempDiv: HTMLDivElement) {
	try {
		if (highlight.xpath && (highlight.type === 'element' || highlight.type === 'text')) {
			// Use XPath for elements and legacy text highlights
			processXPathHighlight(highlight as (ElementHighlightData | TextHighlightData), tempDiv);
		} else if (highlight.type === 'fragment' || (highlight.type === 'text' && !highlight.xpath)) {
			// Use content-based search for fragments and text highlights without XPath
			processContentBasedHighlight(highlight as (FragmentHighlightData | TextHighlightData) , tempDiv);
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
	} else { // Must be TextHighlightData here
		wrapTextWithMark(element, highlight as TextHighlightData);
	}
}

function processContentBasedHighlight(highlight: FragmentHighlightData | TextHighlightData, tempDiv: HTMLDivElement) {
	// Use highlight.content (for text) or decode textStart (for fragment) as the search term
	const searchText = highlight.type === 'fragment' ? decodeURIComponent(highlight.textStart) : highlight.content;
	
	// Simple text search and wrap - less precise than fragment logic but works for inline marking
	const simplifiedSearchText = stripHtml(searchText).trim();
	if (!simplifiedSearchText) return; // Don't search for empty strings

	debugLog('Highlights', 'Searching for content:', simplifiedSearchText);
	
	const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT);
	let node;
	const rangesToWrap: Range[] = [];

	// Find all occurrences
	while (node = walker.nextNode() as Text) {
		const nodeText = node.textContent || '';
		let index = nodeText.indexOf(simplifiedSearchText);
		while (index !== -1) {
			const range = document.createRange();
			range.setStart(node, index);
			range.setEnd(node, index + simplifiedSearchText.length);
			rangesToWrap.push(range);
			index = nodeText.indexOf(simplifiedSearchText, index + 1); // Find next occurrence
		}
	}

	// Wrap ranges in reverse order to avoid index issues
	for (let i = rangesToWrap.length - 1; i >= 0; i--) {
		try {
			const mark = document.createElement('mark');
			rangesToWrap[i].surroundContents(mark);
			debugLog('Highlights', 'Created mark element:', mark.outerHTML);
		} catch (error) {
			// Ignore errors during wrapping (e.g., trying to wrap across invalid boundaries)
			debugLog('Highlights', 'Could not wrap range:', rangesToWrap[i].toString(), error);
		}
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
