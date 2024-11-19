import { ExtractedContent } from '../types/types';
import { createMarkdownContent } from './markdown-converter';
import { sanitizeFileName } from './string-utils';
import { Readability } from '@mozilla/readability';
import browser from './browser-polyfill';
import { debugLog } from './debug';
import dayjs from 'dayjs';
import { AnyHighlightData, TextHighlightData, HighlightData } from './highlighter';
import { generalSettings } from './storage-utils';
import { getElementByXPath } from './dom-utils';

// Define ElementHighlightData type inline since it's not exported from highlighter.ts
interface ElementHighlightData extends HighlightData {
	type: 'element';
}

// Add this helper function at the top level
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

// Add this helper function at the top level
function normalizeHtml(html: string): string {
	return html
		.replace(/\s+/g, ' ') // Normalize whitespace
		.replace(/>\s+</g, '><') // Remove whitespace between tags
		.replace(/\s*\/>/g, '/>') // Normalize self-closing tags
		.trim();
}

// Add this helper function at the top level
function stripHtml(html: string): string {
	const div = document.createElement('div');
	div.innerHTML = html;
	return div.textContent || '';
}

// Add this helper function at the top level
function normalizeText(text: string): string {
	return text
		.replace(/\s+/g, ' ') // Normalize whitespace
		.toLowerCase() // Case insensitive
		.trim();
}

export function extractReadabilityContent(doc: Document): ReturnType<Readability['parse']> | null {
	try {
		const reader = new Readability(doc, {keepClasses:true})
		return reader.parse();
	} catch (error) {
		console.error('Error in extractReadabilityContent:', error);
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

export async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent, currentUrl: string, schemaOrgData: any, fullHtml: string, highlights: AnyHighlightData[]) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');
		currentUrl = currentUrl.replace(/#:~:text=[^&]+(&|$)/, '');

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

		const readabilityArticle = extractReadabilityContent(doc);
		if (!readabilityArticle) {
			console.warn('Failed to parse content with Readability, falling back to full content');
		}

		if (generalSettings.highlighterEnabled && highlights && highlights.length > 0) {
			if (generalSettings.highlightBehavior === 'highlight-inline') {
				debugLog('Highlights', 'Processing highlights in inline mode:', highlights.length, 'highlights');
				// Get the readable content first
				let processedContent = readabilityArticle?.content || content;
				debugLog('Highlights', 'Initial content length:', processedContent.length);
				
				// Create a temporary container
				const tempDiv = document.createElement('div');
				tempDiv.innerHTML = processedContent;

				// Filter for text highlights and sort by position
				debugLog('Highlights', 'Raw highlights:', highlights.map(h => ({
					type: h.type,
					xpath: h.xpath,
					hasStartOffset: 'startOffset' in h,
					hasEndOffset: 'endOffset' in h
				})));

				const textHighlights = highlights
					.filter((h): h is (TextHighlightData | ElementHighlightData) => {
						if (h.type === 'text') {
							return (
								// Either has a valid xpath
								(typeof h.xpath === 'string' && h.xpath.trim() !== '') ||
								// Or has content we can search for
								(typeof h.content === 'string' && h.content.trim() !== '')
							);
						}
						
						// For element highlights, check if they can be safely highlighted
						if (h.type === 'element' && h.xpath && h.xpath.trim() !== '') {
							const element = getElementByXPath(h.xpath);
							return element ? canHighlightElement(element) : false;
						}
						
						return false;
					})
					.sort((a, b) => {
						// Only compare by xpath if both highlights have valid xpaths
						if (a.xpath && b.xpath && a.xpath.trim() !== '' && b.xpath.trim() !== '') {
							const elementA = getElementByXPath(a.xpath);
							const elementB = getElementByXPath(b.xpath);
							if (elementA === elementB) {
								// Only compare startOffsets if both are text highlights
								if (a.type === 'text' && b.type === 'text') {
									return b.startOffset - a.startOffset;
								}
							}
						}
						// Otherwise maintain original order
						return 0;
					});

				debugLog('Highlights', 'Found text highlights:', textHighlights.length);

				// Process each text highlight
				for (const highlight of textHighlights) {
					try {
						debugLog('Highlights', 'Processing highlight:', {
							type: highlight.type,
							xpath: highlight.xpath,
							content: highlight.content
						});

						if (highlight.xpath) {
							const element = document.evaluate(
								highlight.xpath,
								tempDiv,
								null,
								XPathResult.FIRST_ORDERED_NODE_TYPE,
								null
							).singleNodeValue as Element;

							if (element) {
								if ('type' in highlight && highlight.type === 'element') {
									// For element highlights, wrap the entire element
									debugLog('Highlights', 'Processing element highlight');
									const mark = document.createElement('mark');
									element.parentNode?.insertBefore(mark, element);
									mark.appendChild(element);
									debugLog('Highlights', 'Created mark element for element:', mark.outerHTML);
								} else {
									// Existing text highlight logic...
									const range = document.createRange();
									const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
									
									let currentOffset = 0;
									let startNode = null;
									let endNode = null;
									let startOffset = 0;
									let endOffset = 0;
									
									// Find the start and end nodes
									let node;
									while (node = walker.nextNode() as Text) {
										const length = node.length;
										
										if (!startNode && currentOffset + length > highlight.startOffset) {
											startNode = node;
											startOffset = highlight.startOffset - currentOffset;
											debugLog('Highlights', 'Found start node:', {
												text: node.textContent,
												offset: startOffset
											});
										}
										
										if (!endNode && currentOffset + length >= highlight.endOffset) {
											endNode = node;
											endOffset = highlight.endOffset - currentOffset;
											debugLog('Highlights', 'Found end node:', {
												text: node.textContent,
												offset: endOffset
											});
											break;
										}
										
										currentOffset += length;
									}
									
									if (startNode && endNode) {
										debugLog('Highlights', 'Creating mark element for text:', {
											start: startNode.textContent?.slice(startOffset),
											end: endNode.textContent?.slice(0, endOffset)
										});
										
										range.setStart(startNode, startOffset);
										range.setEnd(endNode, endOffset);
										
										const mark = document.createElement('mark');
										range.surroundContents(mark);
										debugLog('Highlights', 'Created mark element:', mark.outerHTML);
									} else {
										debugLog('Highlights', 'Could not find start or end node');
									}
								}
							} else {
								debugLog('Highlights', 'Could not find element for xpath:', highlight.xpath);
							}
						} else {
							// Content-based search logic
							debugLog('Highlights', 'Searching for content:', highlight.content);
							
							// Parse the HTML content
							const contentDiv = document.createElement('div');
							contentDiv.innerHTML = highlight.content;
							
							// Strip outer div if it's the only child
							const innerContent = contentDiv.children.length === 1 && 
								contentDiv.firstElementChild?.tagName === 'DIV' ? 
								contentDiv.firstElementChild.innerHTML : 
								contentDiv.innerHTML;
							
							// Create a temporary parser for the inner content
							const innerDiv = document.createElement('div');
							innerDiv.innerHTML = innerContent;
							
							// If it's a block element (p, div, blockquote), handle it differently
							const blockElement = innerDiv.querySelector('p, div, blockquote');
							if (blockElement) {
								debugLog('Highlights', 'Found block element:', blockElement.tagName);
								
								// Get all paragraphs from both the source and target
								const sourceDiv = document.createElement('div');
								sourceDiv.innerHTML = innerContent;
								const sourceParagraphs = Array.from(sourceDiv.querySelectorAll('p'));
								
								debugLog('Highlights', 'Found source paragraphs:', sourceParagraphs.length);
								
								// For each source paragraph, find and mark the corresponding paragraph in tempDiv
								sourceParagraphs.forEach(sourceParagraph => {
									const sourceText = stripHtml(sourceParagraph.outerHTML).trim();
									debugLog('Highlights', 'Looking for paragraph:', sourceText);
									
									// Find matching paragraph in tempDiv
									const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
									for (const targetParagraph of paragraphs) {
										const targetText = stripHtml(targetParagraph.outerHTML).trim();
										
										if (targetText === sourceText) {
											debugLog('Highlights', 'Found matching paragraph:', targetParagraph.outerHTML);
											const mark = document.createElement('mark');
											mark.innerHTML = targetParagraph.innerHTML;
											targetParagraph.innerHTML = '';
											targetParagraph.appendChild(mark);
											debugLog('Highlights', 'Created mark element for paragraph:', targetParagraph.outerHTML);
											break;
										}
									}
								});
							} else {
								// For inline text, use the text-based search
								const searchText = stripHtml(innerContent).trim();
								
								debugLog('Highlights', 'Searching for text:', searchText);
								
								// Create a text walker for the entire tempDiv
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
						}
					} catch (error) {
							debugLog('Highlights', 'Error processing highlight:', error);
					}
				}
				
				
				
				content = tempDiv.innerHTML;
				debugLog('Highlights', 'Final content length:', content.length);
				debugLog('Highlights', 'Number of mark elements:', content.match(/<mark>/g)?.length || 0);
			} else if (generalSettings.highlightBehavior === 'replace-content') {
				const highlightsContent = highlights.map(highlight => highlight.content).join('');
				content = highlightsContent;
			}
		} else if (selectedHtml) {
			content = selectedHtml;
		} else if (readabilityArticle && readabilityArticle.content) {
			content = readabilityArticle.content;
		} else {
			content = doc.body.innerHTML || fullHtml;
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
			'{{fullHtml}}': fullHtml.trim(),
			'{{image}}': image.trim(),
			'{{noteName}}': noteName.trim(),
			'{{published}}': published.trim(),
			'{{site}}': site.trim(),
			'{{title}}': title.trim(),
			'{{url}}': currentUrl.trim(),
			'{{highlights}}': highlights.length > 0 ? JSON.stringify(highlightsData) : '',
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
