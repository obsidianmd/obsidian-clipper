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
	'byline',
	'catlinks',
	'collections',
	'comments',
	'complementary',
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
	'menu-',
	'meta-',
	'metadata',
	'more-',
	'mw-editsection',
	'mw-jump-link',
	'nav-',
	'navbar',
	'next-',
	'newsletter',
	'overlay',
	'popular',
	'popup',
	'prevnext',
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
	'sticky',
	'subscribe',
	'tabs-',
	'table-of-contents',
	'toolbar',
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
	static parse(doc: Document) {
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
			
			// Clone the document
			const clone = doc.cloneNode(true) as Document;

			// Apply mobile style to clone
			this.applyMobileStyles(clone, mobileStyles);

			// Find main content
			const mainContent = this.findMainContent(clone);
			if (!mainContent) {
				debugLog('Tidy', 'No main content found');
				return {
					content: doc.body.innerHTML
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

			return {
				content: mainContent.outerHTML
			};
		} catch (error) {
			debugLog('Tidy', 'Error processing document:', error);
			return {
				content: doc.body.innerHTML
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
		
		// Parse the document
		const parsed = this.parse(doc);
		if (!parsed) {
			debugLog('Tidy', 'Failed to parse document');
			return;
		}

		// Fresh HTML to inject the tidy reader view
		doc.documentElement.innerHTML = `
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
			// Remove our custom style
			doc.getElementById('obsidian-tidy-style')?.remove();
			
			// Restore the original HTML
			doc.documentElement.innerHTML = this.originalHTML;
			
			this.originalHTML = null;
			this.isActive = false;
		}
	}

} 