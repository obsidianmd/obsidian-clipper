import { debugLog } from './debug';

// Patterns for scoring content
const POSITIVE_PATTERNS = /article|content|main|post|body|text|blog|story/i;
const NEGATIVE_PATTERNS = /comment|meta|footer|footnote|foot|nav|sidebar|banner|ad|popup|menu/i;
const BLOCK_ELEMENTS = ['div', 'section', 'article', 'main'];

// Mobile viewport settings
const MOBILE_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';
const MOBILE_WIDTH = 600;

// Hidden element selectors
const HIDDEN_ELEMENTS_SELECTOR = [
	'[hidden]',
	'[style*="display: none"]',
	'[style*="display:none"]',
	'[style*="visibility: hidden"]',
	'[style*="visibility:hidden"]',
	'.hidden',
	'.invisible'
].join(',');

// Allowed attributes
const ALLOWED_ATTRIBUTES = new Set([
	'href',
	'src',
	'srcset',
	'data-src',
	'data-srcset',
	'alt',
	'title',
	'id',
	'class',
	'width',
	'height',
	'colspan',
	'rowspan',
	'headers',
	'aria-label',
	'role',
	'lang'
]);

// Basic selectors for removing clutter
const BASIC_SELECTORS = [
	'#toc',
	'.toc',
	'#comments',
	'#siteSub',
	'.Ad',
	'.ad',
	'aside',
	'button',
	'canvas',
	'dialog',
	'fieldset',
	'footer',
	'form',
	'header',
	'h1',
	'input',
	'iframe',
	'label',
	'link',
	'nav',
	'noscript',
	'option',
	'select',
	'sidebar',
	'textarea',
	'[class^="ad-"]',
	'[class$="-ad"]',
	'[id^="ad-"]',
	'[id$="-ad"]',
	'[role="banner"]',
	'[role="dialog"]',
	'[role="complementary"]',
	'[role="navigation"]'
];

// Patterns for matching against class, id, and data-testid
const CLUTTER_PATTERNS = [
	'avatar',
	'-ad-',
	'_ad_',
	'article-end ',
	'article-title',
	'author',
	'banner',
	'breadcrumb',
	'button',
	'btn-',
	'-btn',
	'byline',
	'catlinks',
	'collections',
	'comments',
	'comment-content',
	'complementary',
	'-cta',
	'cta-',	
	'discussion',
	'eyebrow',
	'facebook',
	'feedback',
	'fixed',
	'footer',
	'global',
	'google',
	'goog-',
	'header',
	'link-box',
	'loading',
	'menu-',
	'meta-',
	'metadata',
	'more-',
	'mw-editsection',
	'mw-jump-link',
	'nav-',
	'navbar',
	'next-',
//	'newsletter', used on Substack
	'overlay',
	'popular',
	'popup',
	'post_date',
	'post-date',
	'post_title',
	'post-title',
	'prevnext',
	'preview',
	'profile',
	'promo',
	'qr_code',
	'qr-code',
	'read-next',
	'reading-list',
	'recommend',
	'register',
	'related',
	'share',
	'site-index',
	'social',
	'sponsor',
	'sticky',
	'subscribe',
	'tabs-',
	'table-of-contents',
	'toolbar',
	'top-wrapper',
	'tree-item',
	'-toc',
	'trending',
	'twitter'
];

interface ContentScore {
	score: number;
	element: Element;
}

interface StyleChange {
	selector: string;
	styles: string;
}

interface TidyResponse {
	content: string;
	title: string;
	description: string;
	domain: string;
	favicon: string;
	image: string;
	published: string;
	author: string;
	site: string;
	schemaOrgData: any;
}

// Keep this interface for internal use
interface TidyMetadata extends Omit<TidyResponse, 'content'> {
	title: string;
	description: string;
	domain: string;
	favicon: string;
	image: string;
	published: string;
	author: string;
	site: string;
	schemaOrgData: any;
}

export class Tidy {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;

	private static readonly POSITIVE_PATTERNS = POSITIVE_PATTERNS;
	private static readonly NEGATIVE_PATTERNS = NEGATIVE_PATTERNS;
	private static readonly BLOCK_ELEMENTS = BLOCK_ELEMENTS;
	private static readonly MOBILE_VIEWPORT = MOBILE_VIEWPORT;
	private static readonly MOBILE_WIDTH = MOBILE_WIDTH;
	private static readonly HIDDEN_ELEMENTS_SELECTOR = HIDDEN_ELEMENTS_SELECTOR;
	private static readonly ALLOWED_ATTRIBUTES = ALLOWED_ATTRIBUTES;

	/**
	 * Main entry point
	 */
	static parse(doc: Document): TidyResponse {
		debugLog('Tidy', 'Starting content extraction');
		const startElementCount = doc.getElementsByTagName('*').length;
		debugLog('Tidy', `Initial element count: ${startElementCount}`);

		try {
			/**
			 * First we look for elements that are hidden or styled differently on mobile and 
			 * collect the styles that are applied to them. This is because most sites only
			 * only show essential content on mobile, so it helps us to hide the clutter.
			 * 
			 * We run this before we clone the document to avoid making network requests.
			 */
			const mobileStyles = this.evaluateMediaQueries(doc);
			const clone = doc.cloneNode(true) as Document;
			const schemaOrgData = this.extractSchemaOrgData(doc);

			// Apply mobile style to clone
			this.applyMobileStyles(clone, mobileStyles);

			// Find main content
			const mainContent = this.findMainContent(clone);
			if (!mainContent) {
				debugLog('Tidy', 'No main content found');
				return {
					content: doc.body.innerHTML,
					...this.extractMetadata(doc, schemaOrgData)
				};
			}

			// Perform destructive operations on the clone
			this.removeHiddenElements(clone);
			this.removeClutter(clone);

			// todo:
			// - remove empty elements
			// - clever removals of sections like comments, related, etc

			// Clean up the main content
			this.cleanContent(mainContent);

			const finalElementCount = mainContent.getElementsByTagName('*').length;
			debugLog('Tidy', `Final element count in main content: ${finalElementCount}`);
			debugLog('Tidy', `Elements removed: ${startElementCount - finalElementCount}`);

			const metadata = this.extractMetadata(doc, schemaOrgData);

			return {
				content: mainContent ? mainContent.outerHTML : doc.body.innerHTML,
				...metadata
			};
		} catch (error) {
			debugLog('Tidy', 'Error processing document:', error);
			const schemaOrgData = this.extractSchemaOrgData(doc);
			return {
				content: doc.body.innerHTML,
				...this.extractMetadata(doc, schemaOrgData)
			};
		}
	}

	private static evaluateMediaQueries(doc: Document): StyleChange[] {
		const mobileStyles: StyleChange[] = [];

		try {
			// Get all styles, including inline styles
			const sheets = Array.from(doc.styleSheets).filter(sheet => {
				try {
					const rules = sheet.cssRules;
					return true;
				} catch (e) {
					return false;
				}
			});
			
			sheets.forEach(sheet => {
				try {
					const rules = Array.from(sheet.cssRules);
					rules.forEach(rule => {
						if (rule instanceof CSSMediaRule) {
							if (rule.conditionText.includes('max-width')) {
								const maxWidth = parseInt(rule.conditionText.match(/\d+/)?.[0] || '0');
								
								if (this.MOBILE_WIDTH <= maxWidth) {
									Array.from(rule.cssRules).forEach(cssRule => {
										if (cssRule instanceof CSSStyleRule) {
											try {
												mobileStyles.push({
													selector: cssRule.selectorText,
													styles: cssRule.style.cssText
												});
											} catch (e) {
												debugLog('Tidy', 'Error collecting styles for selector:', cssRule.selectorText, e);
											}
										}
									});
								}
							}
						}
					});
				} catch (e) {
					debugLog('Tidy', 'Error processing stylesheet:', e);
				}
			});
		} catch (e) {
			debugLog('Tidy', 'Error evaluating media queries:', e);
		}

		debugLog('Tidy', `Collected ${mobileStyles.length} style changes from media queries`);
		return mobileStyles;
	}

	private static applyMobileStyles(doc: Document, mobileStyles: StyleChange[]) {
		let appliedCount = 0;

		mobileStyles.forEach(({selector, styles}) => {
			try {
				const elements = doc.querySelectorAll(selector);
				elements.forEach(element => {
					element.setAttribute('style', 
						(element.getAttribute('style') || '') + styles
					);
					appliedCount++;
				});
			} catch (e) {
				debugLog('Tidy', 'Error applying styles for selector:', selector, e);
			}
		});

		debugLog('Tidy', `Applied ${appliedCount} style changes to elements`);
	}

	private static removeHiddenElements(doc: Document) {
		let count = 0;

		// Existing hidden elements selector
		const hiddenElements = doc.querySelectorAll(this.HIDDEN_ELEMENTS_SELECTOR);
		hiddenElements.forEach(el => {
			el.remove();
			count++;
		});

		// Also remove elements hidden by computed style
		const allElements = doc.getElementsByTagName('*');
		Array.from(allElements).forEach(element => {
			const computedStyle = window.getComputedStyle(element);
			if (
				computedStyle.display === 'none' ||
				computedStyle.visibility === 'hidden' ||
				computedStyle.opacity === '0'
			) {
				element.remove();
				count++;
			}
		});

		debugLog('Tidy', `Removed ${count} hidden elements`);
	}

	private static removeClutter(doc: Document) {
		let basicSelectorCount = 0;
		let patternMatchCount = 0;

		// First remove elements matching basic selectors
		BASIC_SELECTORS.forEach(selector => {
			let elements: Element[] = [];
			
			if (selector.startsWith('.')) {
				// Class selector
				elements = Array.from(doc.getElementsByClassName(selector.slice(1)));
			} else if (selector.startsWith('#')) {
				// ID selector
				const element = doc.getElementById(selector.slice(1));
				if (element) elements = [element];
			} else {
				// Complex selector
				elements = Array.from(doc.querySelectorAll(selector));
			}

			elements.forEach(el => {
				if (el && el.parentNode) {
					el.remove();
					basicSelectorCount++;
				}
			});
		});

		debugLog('Tidy', `Removed ${basicSelectorCount} elements matching basic selectors`);

		// Then handle pattern matching using a more efficient approach
		const allElements = Array.from(doc.getElementsByTagName('*'));
		
		// We need to iterate backwards since we're removing elements
		for (let i = allElements.length - 1; i >= 0; i--) {
			const el = allElements[i];
			if (!el || !el.parentNode) continue;

			// Check if element should be removed based on its attributes
			const shouldRemove = CLUTTER_PATTERNS.some(pattern => {
				const classMatch = el.className && typeof el.className === 'string' && 
					el.className.toLowerCase().includes(pattern);
				const idMatch = el.id && el.id.toLowerCase().includes(pattern);
				const testIdMatch = el.getAttribute('data-testid')?.toLowerCase().includes(pattern);
				
				return classMatch || idMatch || testIdMatch;
			});

			if (shouldRemove) {
				el.remove();
				patternMatchCount++;
			}
		}

		debugLog('Tidy', `Removed ${patternMatchCount} elements matching patterns`);
		debugLog('Tidy', `Total elements removed: ${basicSelectorCount + patternMatchCount}`);
	}

	private static cleanContent(element: Element) {
		// Strip unwanted attributes
		this.stripUnwantedAttributes(element);
	}

	private static stripUnwantedAttributes(element: Element) {
		let attributeCount = 0;

		const processElement = (el: Element) => {
			// Get all attributes
			const attributes = Array.from(el.attributes);
			
			// Remove attributes not in whitelist and not data-*
			attributes.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (!this.ALLOWED_ATTRIBUTES.has(attrName) && !attrName.startsWith('data-')) {
					el.removeAttribute(attr.name);
					attributeCount++;
				}
			});
		};

		// Process the main element
		processElement(element);

		// Process all child elements
		element.querySelectorAll('*').forEach(processElement);

		debugLog('Tidy', `Stripped ${attributeCount} attributes from elements`);
	}

	private static findMainContent(doc: Document): Element | null {
		// First look for elements with explicit content markers
		const mainContent = doc.querySelector([
			'body',
			'main',
			'[role="main"]',
			'[role="article"]',
			'article',
			'[itemprop="articleBody"]',
			'.post-content',
			'.article-content',
			'#article-content',
			'.content-article',
		].join(','));

		if (mainContent) {
			debugLog('Tidy', 'Found main content via selector');
			return mainContent;
		}

		// Fall back to scoring elements
		const candidates = this.scoreElements(doc);
		if (candidates.length > 0) {
			debugLog('Tidy', `Found ${candidates.length} candidates, selecting highest scoring`);
			return candidates[0].element;
		}

		return null;
	}

	private static scoreElements(doc: Document): ContentScore[] {
		const candidates: ContentScore[] = [];

		this.BLOCK_ELEMENTS.forEach(tag => {
			Array.from(doc.getElementsByTagName(tag)).forEach((element: Element) => {
				const score = this.scoreElement(element);
				if (score > 0) {
					candidates.push({ score, element });
				}
			});
		});

		return candidates.sort((a, b) => b.score - a.score);
	}

	private static scoreElement(element: Element): number {
		let score = 0;

		// Score based on element properties
		const className = element.className.toLowerCase();
		const id = element.id.toLowerCase();

		// Check positive patterns
		if (this.POSITIVE_PATTERNS.test(className) || this.POSITIVE_PATTERNS.test(id)) {
			score += 25;
		}

		// Check negative patterns
		if (this.NEGATIVE_PATTERNS.test(className) || this.NEGATIVE_PATTERNS.test(id)) {
			score -= 25;
		}

		// Score based on content
		const text = element.textContent || '';
		const words = text.split(/\s+/).length;
		score += Math.min(Math.floor(words / 100), 3);

		// Score based on link density
		const links = element.getElementsByTagName('a');
		const linkText = Array.from(links).reduce((acc, link) => acc + (link.textContent?.length || 0), 0);
		const linkDensity = text.length ? linkText / text.length : 0;
		if (linkDensity > 0.5) {
			score -= 10;
		}

		// Score based on presence of meaningful elements
		const paragraphs = element.getElementsByTagName('p').length;
		score += paragraphs;

		const images = element.getElementsByTagName('img').length;
		score += Math.min(images * 3, 9);

		return score;
	}

	static toggle(doc: Document): boolean {
		if (this.isActive) {
			this.restore(doc);
			return false;
		} else {
			this.apply(doc);
			return true;
		}
	}

	static apply(doc: Document) {
		// Store original HTML for restoration
		this.originalHTML = doc.documentElement.outerHTML;
		
		// Clean the html element but preserve lang and dir attributes
		const htmlElement = doc.documentElement;
		const lang = htmlElement.getAttribute('lang');
		const dir = htmlElement.getAttribute('dir');
		
		Array.from(htmlElement.attributes).forEach(attr => {
			htmlElement.removeAttribute(attr.name);
		});
		
		// Restore lang and dir if they existed
		if (lang) htmlElement.setAttribute('lang', lang);
		if (dir) htmlElement.setAttribute('dir', dir);
		
		// Parse the document
		const parsed = this.parse(doc);
		if (!parsed) {
			debugLog('Tidy', 'Failed to parse document');
			return;
		}

		// Fresh HTML to inject the tidy reader view
		htmlElement.innerHTML = `
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="${this.MOBILE_VIEWPORT}">
			</head>
			<body>${parsed.content}</body>
		`;

		this.isActive = true;
	}

	static restore(doc: Document) {
		if (this.originalHTML) {			
			// Create a new parser
			const parser = new DOMParser();
			// Parse the original HTML
			const newDoc = parser.parseFromString(this.originalHTML, 'text/html');
			// Replace the current documentElement with the original one
			doc.replaceChild(
				newDoc.documentElement,
				doc.documentElement
			);
			
			this.originalHTML = null;
			this.isActive = false;
		}
	}

	private static extractMetadata(doc: Document, schemaOrgData: any): TidyMetadata {
		let domain = '';
		let url = '';

		try {
			// Try to get URL from document location
			url = doc.location?.href || '';
			if (url) {
				domain = new URL(url).hostname.replace(/^www\./, '');
			}
		} catch (e) {
			// If URL parsing fails, try to get from base tag
			const baseTag = doc.querySelector('base[href]');
			if (baseTag) {
				try {
					url = baseTag.getAttribute('href') || '';
					domain = new URL(url).hostname.replace(/^www\./, '');
				} catch (e) {
					console.warn('Failed to parse base URL:', e);
				}
			}
		}

		return {
			title: this.getTitle(doc, schemaOrgData),
			description: this.getDescription(doc, schemaOrgData),
			domain,
			favicon: this.getFavicon(doc, url),
			image: this.getImage(doc, schemaOrgData),
			published: this.getPublished(doc, schemaOrgData),
			author: this.getAuthor(doc, schemaOrgData),
			site: this.getSite(doc, schemaOrgData),
			schemaOrgData
		};
	}

	private static getAuthor(doc: Document, schemaOrgData: any): string {
		return (
			this.getMetaContent(doc, "name", "sailthru.author") ||
			this.getSchemaProperty(schemaOrgData, 'author.name') ||
			this.getMetaContent(doc, "property", "author") ||
			this.getMetaContent(doc, "name", "byl") ||
			this.getMetaContent(doc, "name", "author") ||
			this.getMetaContent(doc, "name", "copyright") ||
			this.getSchemaProperty(schemaOrgData, 'copyrightHolder.name') ||
			this.getMetaContent(doc, "property", "og:site_name") ||
			this.getSchemaProperty(schemaOrgData, 'publisher.name') ||
			this.getSchemaProperty(schemaOrgData, 'sourceOrganization.name') ||
			this.getSchemaProperty(schemaOrgData, 'isPartOf.name') ||
			this.getMetaContent(doc, "name", "twitter:creator") ||
			this.getMetaContent(doc, "name", "application-name") ||
			''
		);
	}

	private static getSite(doc: Document, schemaOrgData: any): string {
		return (
			this.getSchemaProperty(schemaOrgData, 'publisher.name') ||
			this.getMetaContent(doc, "property", "og:site_name") ||
			this.getSchemaProperty(schemaOrgData, 'sourceOrganization.name') ||
			this.getMetaContent(doc, "name", "copyright") ||
			this.getSchemaProperty(schemaOrgData, 'copyrightHolder.name') ||
			this.getSchemaProperty(schemaOrgData, 'isPartOf.name') ||
			this.getMetaContent(doc, "name", "application-name") ||
			''
		);
	}

	private static getTitle(doc: Document, schemaOrgData: any): string {
		return (
			this.getMetaContent(doc, "property", "og:title") ||
			this.getMetaContent(doc, "name", "twitter:title") ||
			this.getSchemaProperty(schemaOrgData, 'headline') ||
			this.getMetaContent(doc, "name", "title") ||
			this.getMetaContent(doc, "name", "sailthru.title") ||
			doc.querySelector('title')?.textContent?.trim() ||
			''
		);
	}

	private static getDescription(doc: Document, schemaOrgData: any): string {
		return (
			this.getMetaContent(doc, "name", "description") ||
			this.getMetaContent(doc, "property", "description") ||
			this.getMetaContent(doc, "property", "og:description") ||
			this.getSchemaProperty(schemaOrgData, 'description') ||
			this.getMetaContent(doc, "name", "twitter:description") ||
			this.getMetaContent(doc, "name", "sailthru.description") ||
			''
		);
	}

	private static getImage(doc: Document, schemaOrgData: any): string {
		return (
			this.getMetaContent(doc, "property", "og:image") ||
			this.getMetaContent(doc, "name", "twitter:image") ||
			this.getSchemaProperty(schemaOrgData, 'image.url') ||
			this.getMetaContent(doc, "name", "sailthru.image.full") ||
			''
		);
	}

	private static getFavicon(doc: Document, baseUrl: string): string {
		const iconFromMeta = this.getMetaContent(doc, "property", "og:image:favicon");
		if (iconFromMeta) return iconFromMeta;

		const iconLink = doc.querySelector("link[rel='icon']")?.getAttribute("href");
		if (iconLink) return iconLink;

		const shortcutLink = doc.querySelector("link[rel='shortcut icon']")?.getAttribute("href");
		if (shortcutLink) return shortcutLink;

		// Only try to construct favicon URL if we have a valid base URL
		if (baseUrl) {
			try {
				return new URL("/favicon.ico", baseUrl).href;
			} catch (e) {
				console.warn('Failed to construct favicon URL:', e);
			}
		}

		return '';
	}

	private static getPublished(doc: Document, schemaOrgData: any): string {
		return (
			this.getSchemaProperty(schemaOrgData, 'datePublished') ||
			this.getMetaContent(doc, "property", "article:published_time") ||
			this.getTimeElement(doc) ||
			this.getMetaContent(doc, "name", "sailthru.date") ||
			''
		);
	}

	private static getMetaContent(doc: Document, attr: string, value: string): string {
		const selector = `meta[${attr}]`;
		const element = Array.from(doc.querySelectorAll(selector))
			.find(el => el.getAttribute(attr)?.toLowerCase() === value.toLowerCase());
		const content = element ? element.getAttribute("content")?.trim() ?? "" : "";
		return this.decodeHTMLEntities(content);
	}

	private static getTimeElement(doc: Document): string {
		const selector = `time`;
		const element = Array.from(doc.querySelectorAll(selector))[0];
		const content = element ? (element.getAttribute("datetime")?.trim() ?? element.textContent?.trim() ?? "") : "";
		return this.decodeHTMLEntities(content);
	}

	private static decodeHTMLEntities(text: string): string {
		const textarea = document.createElement('textarea');
		textarea.innerHTML = text;
		return textarea.value;
	}

	private static getSchemaPropertyBasic(schemaOrgData: any, property: string): string {
		if (!Array.isArray(schemaOrgData)) {
			return '';
		}

		for (const item of schemaOrgData) {
			try {
				if (item[property]) {
					return item[property];
				}
			} catch (e) {
				continue;
			}
		}
		return '';
	}

	private static getSchemaProperty(schemaOrgData: any, property: string, defaultValue: string = ''): string {
		if (!schemaOrgData) return defaultValue;
	
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
			return this.decodeHTMLEntities(result);
		} catch (error) {
			console.error(`Error in getSchemaProperty for ${property}:`, error);
			return defaultValue;
		}
	}
	

	private static extractSchemaOrgData(doc: Document): any {
		const schemaScripts = doc.querySelectorAll('script[type="application/ld+json"]');
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

				// If this is a @graph structure, add each item individually
				if (jsonData['@graph'] && Array.isArray(jsonData['@graph'])) {
					schemaData.push(...jsonData['@graph']);
				} else {
					schemaData.push(jsonData);
				}
			} catch (error) {
				console.error('Error parsing schema.org data:', error);
				console.error('Problematic JSON content:', jsonContent);
			}
		});

		return schemaData;
	}

} 