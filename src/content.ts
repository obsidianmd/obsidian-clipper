import browser from './utils/browser-polyfill';
import * as highlighter from './utils/highlighter';

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

			const schemaOrgData = extractSchemaOrgData();

			// Create a new DOMParser
			const parser = new DOMParser();
			// Parse the document's HTML
			const doc = parser.parseFromString(document.documentElement.outerHTML, 'text/html');
			
			// Remove all script and style elements
			doc.querySelectorAll('script, style').forEach(el => el.remove());

			// Remove style attributes from all elements
			doc.querySelectorAll('*').forEach(el => el.removeAttribute('style'));

			// Get the modified HTML without scripts, styles, and style attributes
			const cleanedHtml = doc.documentElement.outerHTML;

			const fullHtmlWithoutIndentation = cleanedHtml
				.replace(/\t/g, '') // Remove tabs
				.replace(/^[ \t]+/gm, ''); // Remove leading spaces and tabs from each line

			const response: ContentResponse = {
				content: document.documentElement.outerHTML,
				selectedHtml: selectedHtml,
				extractedContent: extractedContent,
				schemaOrgData: schemaOrgData,
				fullHtml: fullHtmlWithoutIndentation,
				highlights: highlighter.getHighlights()
			};

			sendResponse(response);
		} else if (request.action === "extractContent") {
			const content = extractContentBySelector(request.selector, request.attribute, request.extractHtml);
			sendResponse({ content: content, schemaOrgData: extractSchemaOrgData() });
		} else if (request.action === "paintHighlights") {
			highlighter.loadHighlights();
			highlighter.applyHighlights();
			sendResponse({ success: true });
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

	function extractSchemaOrgData(): any {
		const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
		const schemaData: any[] = [];

		schemaScripts.forEach(script => {
			let jsonContent = script.textContent || '';
			
			try {
				// Consolidated regex to clean up the JSON content
				jsonContent = jsonContent
					.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '') // Remove multi-line and single-line comments
					.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1') // Remove CDATA wrapper
					.replace(/^\s*(\*\/|\/\*)\s*|\s*(\*\/|\/\*)\s*$/g, '') // Remove any remaining comment markers at start or end
					.trim();
				
				const jsonData = JSON.parse(jsonContent);
				schemaData.push(jsonData);
			} catch (error) {
				console.error('Error parsing schema.org data:', error);
				console.error('Problematic JSON content:', jsonContent);
			}
		});

		return schemaData;
	}

	function updateHasHighlights() {
		const hasHighlights = highlighter.getHighlights().length > 0;
		browser.runtime.sendMessage({ action: "updateHasHighlights", hasHighlights });
	}

	// Initialize highlighter
	highlighter.loadHighlights();
	highlighter.applyHighlights();

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