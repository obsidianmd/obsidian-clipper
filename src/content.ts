import browser from './utils/browser-polyfill';
import * as highlighter from './utils/highlighter';
import { loadSettings, generalSettings } from './utils/storage-utils';
import Defuddle from 'defuddle';
import { getDomain } from './utils/string-utils';

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
	const iframeId = 'obsidian-clipper-iframe';
	const containerId = 'obsidian-clipper-container';
	const IMAGE_ENSURE_TIMEOUT_MS = 6000;
	const SCROLL_STEP_DELAY_MS = 500;
	const SCROLL_TOTAL_TIMEOUT_MS = 5500;
	const SCROLL_REST_DELAY_MS = 750;

	function removeContainer(container: HTMLElement) {
		container.classList.add('is-closing');
		container.addEventListener('animationend', () => {
			container.remove();
		}, { once: true });
	}

	// Common lazy-loading attributes
	const lazySrcAttrs = ['data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-image', 'data-img', 'data-actualsrc'];
	const lazySrcsetAttrs = ['data-srcset', 'data-lazy-srcset', 'data-original-set'];

	function resolveLazyImageSources(img: HTMLImageElement) {
		// Resolve lazy src attributes
		for (const attr of lazySrcAttrs) {
			const value = img.getAttribute(attr);
			if (value && !img.src) {
				img.src = value;
			}
		}

		// Resolve lazy srcset attributes
		for (const attr of lazySrcsetAttrs) {
			const value = img.getAttribute(attr);
			if (value && !img.srcset) {
				img.srcset = value;
			}
		}

		// Handle picture element sources
		const parent = img.parentElement;
		if (parent?.tagName.toLowerCase() === 'picture') {
			parent.querySelectorAll('source').forEach(source => {
				for (const attr of lazySrcsetAttrs) {
					const value = source.getAttribute(attr);
					if (value && !source.srcset) {
						source.srcset = value;
					}
				}
			});
		}

		// Force eager loading
		try {
			img.loading = 'eager';
		} catch {
			img.setAttribute('loading', 'eager');
		}

		// Trigger load by reassigning src if needed
		if (img.src) {
			img.src = img.src;
		}
	}

	function sleep(durationMs: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, durationMs));
	}

	function getScroller(): Element | Document {
		return document.scrollingElement || document.documentElement || document.body;
	}

	async function scrollPageToBottomForImages(): Promise<void> {
		const scroller = getScroller() as Element & { scrollTop?: number };
		const startingTop = window.scrollY || scroller.scrollTop || 0;
		const startingLeft = window.scrollX || 0;
		const startTime = Date.now();
		let lastScrollTop = -1;

		try {
			while (Date.now() - startTime < SCROLL_TOTAL_TIMEOUT_MS) {
				const currentScrollTop = window.scrollY || scroller.scrollTop || 0;
				const scrollHeight = document.documentElement.scrollHeight;
				const maxScrollTop = Math.max(0, scrollHeight - window.innerHeight);

				if (maxScrollTop <= 0 || Math.abs(currentScrollTop - maxScrollTop) < 2) {
					break;
				}

				const nextScrollTop = Math.min(maxScrollTop, currentScrollTop + Math.max(200, window.innerHeight * 0.8));
				window.scrollTo({ top: nextScrollTop, left: 0, behavior: 'auto' });
				await sleep(SCROLL_STEP_DELAY_MS);

				const newScrollTop = window.scrollY || scroller.scrollTop || 0;
				if (Math.abs(newScrollTop - lastScrollTop) < 2) {
					break; // Stuck, bail out
				}
				lastScrollTop = newScrollTop;
			}
			await sleep(SCROLL_REST_DELAY_MS);
		} finally {
			window.scrollTo({ top: startingTop, left: startingLeft, behavior: 'auto' });
		}
	}

	function waitForImage(img: HTMLImageElement, timeoutMs = 4000): Promise<void> {
		resolveLazyImageSources(img);
		if (img.complete && img.naturalWidth > 0) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			const cleanup = () => {
				img.removeEventListener('load', onLoad);
				img.removeEventListener('error', onError);
				resolve();
			};
			const onLoad = () => cleanup();
			const onError = () => cleanup();
			img.addEventListener('load', onLoad, { once: true });
			img.addEventListener('error', onError, { once: true });
			setTimeout(() => cleanup(), timeoutMs);
		});
	}

	async function ensureAllImagesLoaded(): Promise<void> {
		const images = Array.from(document.images) as HTMLImageElement[];
		if (!images.length) return;

		// Trigger lazy-loading libraries
		['scroll', 'resize', 'orientationchange'].forEach(eventName => {
			window.dispatchEvent(new Event(eventName));
			document.dispatchEvent(new Event(eventName));
		});

		// Scroll to bottom to trigger lazy-loaded images
		await scrollPageToBottomForImages().catch(error => {
			console.warn('[Content] Failed to scroll page for images:', error);
		});

		// Collect all images (including newly loaded ones)
		const allImages = Array.from(new Set([...images, ...Array.from(document.images) as HTMLImageElement[]]));

		// Force load all images
		await Promise.all(allImages.map(img => waitForImage(img)));
	}

	async function toggleIframe() {
		const existingContainer = document.getElementById(containerId);
		if (existingContainer) {
			removeContainer(existingContainer);
			return;
		}

		const container = document.createElement('div');
		container.id = containerId;
		container.classList.add('is-open');

		const { clipperIframeWidth, clipperIframeHeight } = await browser.storage.local.get(['clipperIframeWidth', 'clipperIframeHeight']);
		if (clipperIframeWidth) {
			container.style.width = `${clipperIframeWidth}px`;
		}
		if (clipperIframeHeight) {
			container.style.height = `${clipperIframeHeight}px`;
		}

		const iframe = document.createElement('iframe');
		iframe.id = iframeId;
		iframe.src = browser.runtime.getURL('side-panel.html?context=iframe');
		container.appendChild(iframe);

		// Add resize handle (left side only)
		const handle = document.createElement('div');
		handle.className = `obsidian-clipper-resize-handle obsidian-clipper-resize-handle-w`;
		container.appendChild(handle);
		addResizeListener(container, handle, 'w');

		const southHandle = document.createElement('div');
		southHandle.className = `obsidian-clipper-resize-handle obsidian-clipper-resize-handle-s`;
		container.appendChild(southHandle);
		addResizeListener(container, southHandle, 's');

		const southWestHandle = document.createElement('div');
		southWestHandle.className = 'obsidian-clipper-resize-handle obsidian-clipper-resize-handle-sw';
		container.appendChild(southWestHandle);
		addResizeListener(container, southWestHandle, 'sw');

		document.body.appendChild(container);
	}

	function addResizeListener(container: HTMLElement, handle: HTMLElement, direction: string) {
		let isResizing = false;
		let startX: number, startY: number, startWidth: number, startHeight: number, startLeft: number, startTop: number;
	
		handle.onmousedown = (e) => {
			e.stopPropagation();
			isResizing = true;
			startX = e.clientX;
			startY = e.clientY;
			startWidth = container.offsetWidth;
			startHeight = container.offsetHeight;
			startLeft = container.offsetLeft;
			startTop = container.offsetTop;

			document.body.style.cursor = window.getComputedStyle(handle).cursor;
	
			const iframe = container.querySelector('#obsidian-clipper-iframe');
			if (iframe) iframe.classList.add('is-resizing');
	
			document.onmousemove = (moveEvent) => {
				if (!isResizing) return;
	
				const dx = moveEvent.clientX - startX;
				const dy = moveEvent.clientY - startY;

				const minWidth = parseInt(container.style.minWidth) || 200;
				const minHeight = parseInt(container.style.minHeight) || 200;
	
				if (direction.includes('e')) {
					let newWidth = startWidth + dx;
					if (newWidth < minWidth) newWidth = minWidth;
					container.style.width = `${newWidth}px`;
				}
				if (direction.includes('w')) {
					let newWidth = startWidth - dx;
					if (newWidth < minWidth) {
						newWidth = minWidth;
					}
					container.style.width = `${newWidth}px`;
				}
				if (direction.includes('s')) {
					let newHeight = startHeight + dy;
					if (newHeight < minHeight) newHeight = minHeight;
					container.style.height = `${newHeight}px`;
				}
				if (direction.includes('n')) {
					let newHeight = startHeight - dy;
					let newTop = startTop + dy;
					if (newHeight < minHeight) {
						newHeight = minHeight;
						newTop = startTop + startHeight - minHeight;
					}
					container.style.height = `${newHeight}px`;
					container.style.top = `${newTop}px`;
				}
			};
	
			document.onmouseup = () => {
				isResizing = false;
				const iframe = container.querySelector('#obsidian-clipper-iframe');
				if (iframe) iframe.classList.remove('is-resizing');
				document.body.style.cursor = '';
				
				const newWidth = container.offsetWidth;
				const newHeight = container.offsetHeight;
				browser.storage.local.set({ clipperIframeWidth: newWidth, clipperIframeHeight: newHeight });

				document.onmousemove = null;
				document.onmouseup = null;
			};
		};
	}

	// Firefox
	browser.runtime.sendMessage({ action: "contentScriptLoaded" });

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
		parseTime: number;
		published: string;
		author: string;
		site: string;
		wordCount: number;
		metaTags: { name?: string | null; property?: string | null; content: string | null }[];
	}

	browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
		if (request.action === "ping") {
			sendResponse({});
			return true;
		}

		if (request.action === "toggle-iframe") {
			toggleIframe().then(() => {
				sendResponse({ success: true });
			});
			return true;
		}

		if (request.action === "close-iframe") {
			const existingContainer = document.getElementById(containerId);
			if (existingContainer) {
				removeContainer(existingContainer);
			}
			return;
		}

		if (request.action === "copy-text-to-clipboard") {
			const textArea = document.createElement("textarea");
			textArea.value = request.text;
			document.body.appendChild(textArea);
			textArea.select();
			try {
				document.execCommand('copy');
				sendResponse({success: true});
			} catch (err) {
				sendResponse({success: false});
			}
			document.body.removeChild(textArea);
			return true;
		}

		if (request.action === "getPageContent") {
			(async () => {
				try {
					const ensurePromise = ensureAllImagesLoaded().catch(error => {
						console.warn('[Content] ensureAllImagesLoaded failed:', error);
					});
					await Promise.race([
						ensurePromise,
						new Promise<void>((resolve) => setTimeout(resolve, IMAGE_ENSURE_TIMEOUT_MS))
					]);
				} catch (error) {
					console.warn('[Content] Unexpected error while waiting for images:', error);
				}

				try {
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

					// Process with Defuddle first while we have access to the document
					const defuddled = new Defuddle(document, { url: document.URL }).parse();

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
						author: defuddled.author,
						content: defuddled.content,
						description: defuddled.description,
						domain: getDomain(document.URL),
						extractedContent: extractedContent,
						favicon: defuddled.favicon,
						fullHtml: cleanedHtml,
						highlights: highlighter.getHighlights(),
						image: defuddled.image,
						parseTime: defuddled.parseTime,
						published: defuddled.published,
						schemaOrgData: defuddled.schemaOrgData,
						selectedHtml: selectedHtml,
						site: defuddled.site,
						title: defuddled.title,
						wordCount: defuddled.wordCount,
						metaTags: defuddled.metaTags || []
					};
					sendResponse(response);
				} catch (error) {
					console.error('[Content] Failed to build page content response:', error);
					sendResponse({ error: error instanceof Error ? error.message : 'Unknown error' });
				}
			})();
			return true;
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
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) {
				highlighter.handleTextSelection(selection);
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
			// Forward the request to the background script to inject reader mode if needed
			browser.runtime.sendMessage({ action: "toggleReaderMode", tabId: sender.tab?.id })
				.then(sendResponse)
				.catch(error => {
					console.error("Error toggling reader mode:", error);
					sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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

	// Listen for custom events from the reader script
	document.addEventListener('obsidian-reader-init', async () => {
		// Find the highlighter button
		const button = document.querySelector('[data-action="toggle-highlighter"]');
		if (button) {
			// Handle highlighter button clicks
			button.addEventListener('click', async (e) => {
				try {
					// First try to get the tab ID from the background script
					const response = await browser.runtime.sendMessage({ action: "ensureContentScriptLoaded" });
					
					let tabId: number | undefined;
					if (response && typeof response === 'object') {
						tabId = (response as { tabId: number }).tabId;
					}

					// If we didn't get a tab ID, try to get it from the background script
					if (!tabId) {
						try {
							const response = await browser.runtime.sendMessage({ action: "getActiveTab" }) as { tabId?: number; error?: string };
							if (response && !response.error && response.tabId) {
								tabId = response.tabId;
							}
						} catch (error) {
							console.error('[Content] Failed to get tab ID from background script:', error);
						}
					}

					if (tabId) {
						await browser.runtime.sendMessage({ action: "toggleHighlighterMode", tabId });
					} else {
						console.error('[Content]','Could not determine tab ID');
					}
				} catch (error) {
					console.error('[Content]','Error in toggle flow:', error);
				}
			});
		}
	});
})();
