import browser from './utils/browser-polyfill';
import * as highlighter from './utils/highlighter';
import { loadSettings, generalSettings } from './utils/storage-utils';
import Defuddle from 'defuddle';
import { getDomain } from './utils/string-utils';
import { extractContentBySelector as extractContentBySelectorShared } from './utils/shared';
import { createMarkdownContent } from 'defuddle/full';
import { flattenShadowDom } from './utils/flatten-shadow-dom';
import { saveFile } from './utils/file-utils';
import { debugLog } from './utils/debug';

declare global {
	interface Window {
		obsidianClipperGeneration?: number;
	}
}

// IIFE to scope variables and allow safe re-execution
(function() {
	// Bump the generation counter on every injection. Older listeners close
	// over their own generation value and bail out when they see a newer one,
	// so a zombie content script (runtime invalidated after extension update)
	// will silently yield to the freshly-injected instance.
	window.obsidianClipperGeneration = (window.obsidianClipperGeneration ?? 0) + 1;
	const myGeneration = window.obsidianClipperGeneration;

	debugLog('Clipper', 'Initializing content script, generation', myGeneration);

	// In Reader mode, extract from the article's original HTML (before
	// wireTranscript restructures it) with a neutral URL so site-specific
	// extractors don't re-fetch content (e.g. YouTube)
	function parseForClip(doc: Document) {
		const readerArticle = doc.querySelector('.obsidian-reader-active .obsidian-reader-content article');
		if (readerArticle) {
			const readerDoc = doc.implementation.createHTMLDocument();
			const originalHtml = readerArticle.getAttribute('data-original-html');
			readerDoc.body.innerHTML = originalHtml || readerArticle.innerHTML;
			return new Defuddle(readerDoc, { url: '' }).parse();
		}
		return new Defuddle(doc, { url: doc.URL }).parse();
	}

	let isHighlighterMode = false;
	const iframeId = 'obsidian-clipper-iframe';
	const containerId = 'obsidian-clipper-container';

	let sidebarWidthRaf: number | null = null;

	function updateSidebarWidth(container: HTMLElement | null) {
		if (sidebarWidthRaf) cancelAnimationFrame(sidebarWidthRaf);
		sidebarWidthRaf = requestAnimationFrame(() => {
			if (container && document.contains(container)) {
				document.documentElement.style.setProperty('--clipper-sidebar-width', `${container.offsetWidth + 24}px`);
			} else {
				document.documentElement.style.removeProperty('--clipper-sidebar-width');
			}
		});
	}

	function removeContainer(container: HTMLElement) {
		container.classList.add('is-closing');
		updateSidebarWidth(null);
		container.addEventListener('animationend', () => {
			container.remove();
			highlighter.repositionHighlights();
		}, { once: true });
	}

	async function toggleIframe() {
		const existingContainer = document.getElementById(containerId);
		if (existingContainer) {
			removeContainer(existingContainer);
			return;
		}

		await ensureHighlighterCSS();

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
		updateSidebarWidth(container);
		container.addEventListener('animationend', () => {
			highlighter.repositionHighlights();
		}, { once: true });
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

				updateSidebarWidth(container);
			};
	
			document.onmouseup = () => {
				isResizing = false;
				const iframe = container.querySelector('#obsidian-clipper-iframe');
				if (iframe) iframe.classList.remove('is-resizing');
				document.body.style.cursor = '';
				
				const newWidth = container.offsetWidth;
				const newHeight = container.offsetHeight;
				browser.storage.local.set({ clipperIframeWidth: newWidth, clipperIframeHeight: newHeight });

				highlighter.repositionHighlights();

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
		language: string;
		metaTags: { name?: string | null; property?: string | null; content: string | null }[];
	}

	browser.runtime.onMessage.addListener((request: any, sender, sendResponse) => {
		// If a newer generation of this content script has been injected,
		// yield to it rather than responding from a potentially stale context.
		if (window.obsidianClipperGeneration !== myGeneration) {
			return;
		}

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

		if (request.action === "copyMarkdownToClipboard") {
			flattenShadowDom(document).then(() => {
				try {
					const defuddled = parseForClip(document);

					// Convert HTML content to markdown
					const markdown = createMarkdownContent(defuddled.content, document.URL);

					// Copy to clipboard
					const textArea = document.createElement("textarea");
					textArea.value = markdown;
					document.body.appendChild(textArea);
					textArea.select();
					document.execCommand('copy');
					document.body.removeChild(textArea);

					sendResponse({ success: true });
				} catch (err) {
					console.error('Failed to copy markdown to clipboard:', err);
					sendResponse({ success: false, error: (err as Error).message });
				}
			});
			return true;
		}

		if (request.action === "saveMarkdownToFile") {
			flattenShadowDom(document).then(async () => {
				try {
					const defuddled = parseForClip(document);
					const markdown = createMarkdownContent(defuddled.content, document.URL);
					const title = defuddled.title || document.title || 'Untitled';
					const fileName = title.replace(/[/\\?%*:|"<>]/g, '-');
					await saveFile({
						content: markdown,
						fileName,
						mimeType: 'text/markdown',
					});
					sendResponse({ success: true });
				} catch (err) {
					console.error('Failed to save markdown file:', err);
					sendResponse({ success: false, error: (err as Error).message });
				}
			});
			return true;
		}

		if (request.action === "getPageContent") {
			// Snapshot the page into an isolated document so Defuddle and its
			// async extractors never operate on the live DOM. Passing the live
			// document caused Defuddle's flattenShadowRoots (and site-specific
			// extractors) to interact with shadow-host elements, triggering
			// MutationObservers that reset dynamic component styles.
			Promise.resolve().then(async () => {
				let selectedHtml = '';
				const selection = window.getSelection();

				if (selection && selection.rangeCount > 0) {
					const range = selection.getRangeAt(0);
					const clonedSelection = range.cloneContents();
					const div = document.createElement('div');
					div.appendChild(clonedSelection);
					selectedHtml = div.innerHTML;
				}

				const rawHtml = document.documentElement.outerHTML;
				const snapshot = new DOMParser().parseFromString(rawHtml, 'text/html');
				Object.defineProperty(snapshot, 'URL', { value: document.URL, configurable: true });
				// Copy open shadow-root content into the snapshot (read-only on
				// the live side — no live DOM mutation).
				if (document.body && snapshot.body) {
					const liveEls = Array.from(document.body.querySelectorAll('*'));
					const snapEls = Array.from(snapshot.body.querySelectorAll('*'));
					const len = Math.min(liveEls.length, snapEls.length);
					for (let i = 0; i < len; i++) {
						const sr = liveEls[i].shadowRoot;
						if (sr?.innerHTML) snapEls[i].insertAdjacentHTML('beforeend', sr.innerHTML);
					}
				}

				// Use parseAsync to ensure async variables like {{transcript}} are available.
				// If it hangs (e.g. another extension has corrupted fetch), fall back to sync parse.
				const defuddle = new Defuddle(snapshot, { url: document.URL });
				const parseTimeout = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error('parseAsync timeout')), 8000)
				);
				const defuddled = await Promise.race([defuddle.parseAsync(), parseTimeout])
					.catch(() => defuddle.parse());
				const extractedContent: { [key: string]: string } = {
					...defuddled.variables,
				};

				// Create a new DOMParser
				const parser = new DOMParser();
				// Parse the document's HTML
				const doc = parser.parseFromString(rawHtml, 'text/html');

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
					language: defuddled.language || '',
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
			}).catch((error: unknown) => {
				console.error('[Obsidian Clipper] getPageContent error:', error);
				sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
			});
			return true;
		} else if (request.action === "extractContent") {
			const content = extractContentBySelector(request.selector, request.attribute, request.extractHtml);
			sendResponse({ content: content });
		} else if (request.action === "paintHighlights") {
			ensureHighlighterCSS().then(() => highlighter.loadHighlights()).then(() => {
				if (generalSettings.alwaysShowHighlights) {
					highlighter.applyHighlights();
				}
				sendResponse({ success: true });
			});
			return true;
		} else if (request.action === "setHighlighterMode") {
			isHighlighterMode = request.isActive;
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(isHighlighterMode);
			updateHasHighlights();
			sendResponse({ success: true });
			return true;
		} else if (request.action === "getHighlighterMode") {
			browser.runtime.sendMessage({ action: "getHighlighterMode" }).then(sendResponse);
			return true;
		} else if (request.action === "toggleHighlighter") {
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(request.isActive);
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "highlightSelection") {
			ensureHighlighterCSS();
			highlighter.toggleHighlighterMenu(request.isActive);
			const selection = window.getSelection();
			if (selection && !selection.isCollapsed) {
				highlighter.handleTextSelection(selection);
			}
			updateHasHighlights();
			sendResponse({ success: true });
		} else if (request.action === "highlightElement") {
			ensureHighlighterCSS();
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
		} else if (request.action === "getReaderModeState") {
			sendResponse({ isActive: document.documentElement.classList.contains('obsidian-reader-active') });
			return true;
		}
		return true;
	});

	function extractContentBySelector(selector: string, attribute?: string, extractHtml: boolean = false): string | string[] {
		return extractContentBySelectorShared(document, selector, attribute, extractHtml);
	}

	function updateHasHighlights() {
		const hasHighlights = highlighter.getHighlights().length > 0;
		browser.runtime.sendMessage({ action: "updateHasHighlights", hasHighlights });
	}

	let highlighterCSSPromise: Promise<void> | null = null;
	function ensureHighlighterCSS(): Promise<void> {
		if (!highlighterCSSPromise) {
			highlighterCSSPromise = new Promise<void>((resolve) => {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = browser.runtime.getURL('highlighter.css');
				link.onload = () => resolve();
				link.onerror = () => resolve();
				(document.head || document.documentElement).appendChild(link);
			});
		}
		return highlighterCSSPromise;
	}

	async function initializeHighlighter() {
		await loadSettings();

		if (generalSettings.alwaysShowHighlights) {
			const result = await browser.storage.local.get('highlights');
			const allHighlights = (result.highlights || {}) as Record<string, unknown>;
			if (allHighlights[window.location.href]) {
				await ensureHighlighterCSS();
			}
		}

		await highlighter.loadHighlights();
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
