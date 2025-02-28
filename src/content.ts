import browser from './utils/browser-polyfill';
import * as highlighter from './utils/highlighter';
import { loadSettings, generalSettings } from './utils/storage-utils';
import { Tidy } from './utils/tidy';
import { Reader } from './utils/reader';

declare global {
	interface Window {
		obsidianHighlighterInitialized?: boolean;
	}
}

// Use a self-executing function to create a closure
// This allows the script to be re-executed without redeclaring variables
(function() {
	// Check if the script has already been initialized
	if (window.hasOwnProperty('obsidianHighlighterInitialized')) {
		return;  // Exit if already initialized
	}

	// Mark as initialized
	window.obsidianHighlighterInitialized = true;

	let isHighlighterMode = false;

	// Firefox
	browser.runtime.sendMessage({ action: "contentScriptLoaded" });
	browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
		if (request.action === "ping") {
			sendResponse({});
			return true;
		}
	});

	interface ContentResponse {
		content: string;
		selectedHtml: string;
		extractedContent: { [key: string]: string };
		schemaOrgData: any;
		fullHtml: string;
		highlights: string[];
		title: string;
		description: string;
		domain: string;
		favicon: string;
		image: string;
		published: string;
		author: string;
		site: string;
	}

	browser.runtime.onMessage.addListener(function(request: any, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void) {
		if (request.action === "getPageContent") {
			let selectedHtml = '';
			const selection = window.getSelection();
			
			if (selection && selection.rangeCount > 0) {
				const range = selection.getRangeAt(0);
				const clonedSelection = range.cloneContents();
				const div = document.createElement('div');
				div.appendChild(clonedSelection);
				selectedHtml = div.innerHTML;
			}

			const extractedContent: { [key: string]: string } = {};

			// Process with Tidy first while we have access to the document
			const tidyResult = Tidy.parse(document);

			// Create a new DOMParser
			const parser = new DOMParser();
			// Parse the document's HTML
			const doc = parser.parseFromString(document.documentElement.outerHTML, 'text/html');

			// Remove all script and style elements
			doc.querySelectorAll('script, style').forEach(el => el.remove());

			// Remove style attributes from all elements
			doc.querySelectorAll('*').forEach(el => el.removeAttribute('style'));

			// Convert all relative URLs to absolute
			doc.querySelectorAll('[src], [href]').forEach(element => {
				['src', 'href', 'srcset'].forEach(attr => {
					const value = element.getAttribute(attr);
					if (!value) return;
					
					if (attr === 'srcset') {
						const newSrcset = value.split(',').map(src => {
							const [url, size] = src.trim().split(' ');
							try {
								const absoluteUrl = new URL(url, document.baseURI).href;
								return `${absoluteUrl}${size ? ' ' + size : ''}`;
							} catch (e) {
								return src;
							}
						}).join(', ');
						element.setAttribute(attr, newSrcset);
					} else if (!value.startsWith('http') && !value.startsWith('data:') && !value.startsWith('#') && !value.startsWith('//')) {
						try {
							const absoluteUrl = new URL(value, document.baseURI).href;
							element.setAttribute(attr, absoluteUrl);
						} catch (e) {
							console.warn(`Failed to process ${attr} URL:`, value);
						}
					}
				});
			});

			// Get the modified HTML without scripts, styles, and style attributes
			const cleanedHtml = doc.documentElement.outerHTML;

			const response: ContentResponse = {
				author: tidyResult.author,
				content: tidyResult.content,
				description: tidyResult.description,
				domain: tidyResult.domain,
				extractedContent: extractedContent,
				favicon: tidyResult.favicon,
				fullHtml: cleanedHtml,
				highlights: highlighter.getHighlights(),
				image: tidyResult.image,
				published: tidyResult.published,
				schemaOrgData: tidyResult.schemaOrgData,
				selectedHtml: selectedHtml,
				site: tidyResult.site,
				title: tidyResult.title
			};

			sendResponse(response);
		} else if (request.action === "extractContent") {
			const content = extractContentBySelector(request.selector, request.attribute, request.extractHtml);
			sendResponse({ content: content });
		} else if (request.action === "paintHighlights") {
			highlighter.loadHighlights().then(() => {
				if (generalSettings.alwaysShowHighlights) {
					highlighter.applyHighlights();
				}
				sendResponse({ success: true });
			});
			return true;
		} else if (request.action === "setHighlighterMode") {
			isHighlighterMode = request.isActive;
			highlighter.toggleHighlighterMenu(isHighlighterMode);
			updateHasHighlights();
			sendResponse({ success: true });
			return true;
		} else if (request.action === "getHighlighterMode") {
			browser.runtime.sendMessage({ action: "getHighlighterMode" }).then(sendResponse);
			return true;
		} else if (request.action === "toggleHighlighter") {
			highlighter.toggleHighlighterMenu(request.isActive);
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "highlightSelection") {
			highlighter.toggleHighlighterMenu(request.isActive);
			if (request.highlightData && request.highlightData.type === 'text') {
				const selection = window.getSelection();
				if (selection && !selection.isCollapsed) {
					highlighter.handleTextSelection(selection);
				}
			}
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "highlightElement") {
			highlighter.toggleHighlighterMenu(request.isActive);
			if (request.targetElementInfo) {
				const { mediaType, srcUrl, pageUrl } = request.targetElementInfo;
				
				let elementToHighlight: Element | null = null;

				// Function to compare URLs, handling both absolute and relative paths
				const urlMatches = (elementSrc: string, targetSrc: string) => {
					const elementUrl = new URL(elementSrc, pageUrl);
					const targetUrl = new URL(targetSrc, pageUrl);
					return elementUrl.href === targetUrl.href;
				};

				// Try to find the element using the src attribute
				elementToHighlight = document.querySelector(`${mediaType}[src="${srcUrl}"]`);

				// If not found, try with relative URL
				if (!elementToHighlight) {
					const relativeSrc = new URL(srcUrl).pathname;
					elementToHighlight = document.querySelector(`${mediaType}[src="${relativeSrc}"]`);
				}

				// If still not found, iterate through all elements of the media type
				if (!elementToHighlight) {
					const elements = Array.from(document.getElementsByTagName(mediaType));
					for (const el of elements) {
						if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
							if (urlMatches(el.src, srcUrl)) {
								elementToHighlight = el;
								break;
							}
						}
					}
				}

				if (elementToHighlight) {
					const xpath = highlighter.getElementXPath(elementToHighlight);
					highlighter.highlightElement(elementToHighlight);
				} else {
					console.warn('Could not find element to highlight. Info:', request.targetElementInfo);
				}
			}
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "clearHighlights") {
			highlighter.clearHighlights();
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "getHighlighterState") {
			browser.runtime.sendMessage({ action: "getHighlighterMode" })
				.then(response => {
					sendResponse(response);
				})
				.catch(error => {
					console.error("Error getting highlighter mode:", error);
					sendResponse({ isActive: false });
				});
			return true;
		} else if (request.action === "toggleReaderMode") {
			try {
				const isActive = Reader.toggle(document);
				document.body.classList.toggle('obsidian-reader-active', isActive);
				sendResponse({ success: true, isActive });
			} catch (error: unknown) {
				console.error('Error toggling reader mode:', error);
				sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
			}
			return true;
		}
		return true;
	});

	function extractContentBySelector(selector: string, attribute?: string, extractHtml: boolean = false): string | string[] {
		try {
			const elements = document.querySelectorAll(selector);
			
			if (elements.length > 1) {
				return Array.from(elements).map(el => {
					if (attribute) {
						return el.getAttribute(attribute) || '';
					}
					return extractHtml ? el.outerHTML : el.textContent?.trim() || '';
				});
			} else if (elements.length === 1) {
				if (attribute) {
					return elements[0].getAttribute(attribute) || '';
				}
				return extractHtml ? elements[0].outerHTML : elements[0].textContent?.trim() || '';
			} else {
				console.log(`No elements found for selector: ${selector}`);
				return '';
			}
		} catch (error) {
			console.error('Error in extractContentBySelector:', error, { selector, attribute, extractHtml });
			return '';
		}
	}

	function updateHasHighlights() {
		const hasHighlights = highlighter.getHighlights().length > 0;
		browser.runtime.sendMessage({ action: "updateHasHighlights", hasHighlights });
	}

	async function initializeHighlighter() {
		await loadSettings();
		await highlighter.loadHighlights();
		
		if (generalSettings.alwaysShowHighlights) {
			highlighter.applyHighlights();
		}
		
		updateHasHighlights();
	}

	// Initialize highlighter
	initializeHighlighter();

	// Call updateHasHighlights when the page loads
	window.addEventListener('load', updateHasHighlights);

	// Deactivate highlighter mode on unload
	function handlePageUnload() {
		if (isHighlighterMode) {
			highlighter.toggleHighlighterMenu(false);
			browser.runtime.sendMessage({ action: "highlighterModeChanged", isActive: false });
			browser.storage.local.set({ isHighlighterMode: false });
		}
	}

	window.addEventListener('beforeunload', handlePageUnload);

})();
