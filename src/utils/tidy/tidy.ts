import { MetadataExtractor, TidyMetadata } from './metadata';

// Patterns for scoring content
const POSITIVE_PATTERNS = /article|content|main|post|body|text|blog|story/i;
const NEGATIVE_PATTERNS = /comment|meta|footer|footnote|foot|nav|sidebar|banner|ad|popup|menu/i;
const BLOCK_ELEMENTS = ['div', 'section', 'article', 'main'];

// Mobile viewport settings
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
	'script',
	'select',
	'sidebar',
	'style',
	'textarea',
	'[data-link-name*="skip"]',
	'[src*="author"]',
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
	'logo-',
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
	'post-date',
	'post-title',
	'post_date',
	'post_title',
	'preview',
	'prevnext',
	'profile',
	'promo',
	'qr-code',
	'qr_code',
	'read-next',
	'reading-list',
	'recommend',
	'register',
	'related',
	'screen-reader-text',
	'share',
	'site-index',
	'skip-',
	'social',
	'sponsor',
	'sticky',
	'subscribe',
	'-toc',
	'table-of-contents',
	'tabs-',
	'toolbar',
	'top-wrapper',
	'tree-item',
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

interface TidyResponse extends TidyMetadata {
	content: string;
}

export class Tidy {
	private static readonly POSITIVE_PATTERNS = POSITIVE_PATTERNS;
	private static readonly NEGATIVE_PATTERNS = NEGATIVE_PATTERNS;
	private static readonly BLOCK_ELEMENTS = BLOCK_ELEMENTS;
	private static readonly HIDDEN_ELEMENTS_SELECTOR = HIDDEN_ELEMENTS_SELECTOR;
	private static readonly ALLOWED_ATTRIBUTES = ALLOWED_ATTRIBUTES;

	static parse(doc: Document): TidyResponse {
		try {
			const mobileStyles = this.evaluateMediaQueries(doc);
			const clone = doc.cloneNode(true) as Document;
			const schemaOrgData = MetadataExtractor.extractSchemaOrgData(doc);

			// Apply mobile style to clone
			this.applyMobileStyles(clone, mobileStyles);

			// Find main content
			const mainContent = this.findMainContent(clone);
			if (!mainContent) {
				return {
					content: doc.body.innerHTML,
					...MetadataExtractor.extract(doc, schemaOrgData)
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

			const metadata = MetadataExtractor.extract(doc, schemaOrgData);

			return {
				content: mainContent ? mainContent.outerHTML : doc.body.innerHTML,
				...metadata
			};
		} catch (error) {
			console.error('Tidy', 'Error processing document:', error);
			const schemaOrgData = MetadataExtractor.extractSchemaOrgData(doc);
			return {
				content: doc.body.innerHTML,
				...MetadataExtractor.extract(doc, schemaOrgData)
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
								
								if (MOBILE_WIDTH <= maxWidth) {
									Array.from(rule.cssRules).forEach(cssRule => {
										if (cssRule instanceof CSSStyleRule) {
											try {
												mobileStyles.push({
													selector: cssRule.selectorText,
													styles: cssRule.style.cssText
												});
											} catch (e) {
												console.error('Tidy', 'Error collecting styles for selector:', cssRule.selectorText, e);
											}
										}
									});
								}
							}
						}
					});
				} catch (e) {
					console.error('Tidy', 'Error processing stylesheet:', e);
				}
			});
		} catch (e) {
			console.error('Tidy', 'Error evaluating media queries:', e);
		}

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
				console.error('Tidy', 'Error applying styles for selector:', selector, e);
			}
		});

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
	}

	private static removeClutter(doc: Document) {
		let basicSelectorCount = 0;
		let patternMatchCount = 0;

		// Combine all basic selectors into a single selector string for one query
		const combinedSelector = BASIC_SELECTORS.join(',');
		const basicElements = doc.querySelectorAll(combinedSelector);
		basicElements.forEach(el => {
			if (el?.parentNode) {
				el.remove();
				basicSelectorCount++;
			}
		});

		// Create RegExp objects once instead of creating them in each iteration
		const patternRegexes = CLUTTER_PATTERNS.map(pattern => new RegExp(pattern, 'i'));

		// Use a DocumentFragment for batch removals
		const elementsToRemove = new Set<Element>();
		
		// Get all elements with class, id, or data-testid attributes for more targeted iteration
		const elements = doc.querySelectorAll('[class], [id], [data-testid]');
		
		elements.forEach(el => {
			if (!el || !el.parentNode) return;

			const className = el.className && typeof el.className === 'string' ? 
				el.className.toLowerCase() : '';
			const id = el.id ? el.id.toLowerCase() : '';
			const testId = el.getAttribute('data-testid')?.toLowerCase() || '';
			
			// Combine all attributes into one string for single pass checking
			const attributeText = `${className} ${id} ${testId}`;
			
			// Check if any pattern matches
			const shouldRemove = patternRegexes.some(regex => regex.test(attributeText));
			
			if (shouldRemove) {
				elementsToRemove.add(el);
				patternMatchCount++;
			}
		});

		// Batch remove elements
		elementsToRemove.forEach(el => el.remove());
	}

	private static cleanContent(element: Element) {
		// Remove HTML comments
		this.removeHtmlComments(element);
		
		// Strip unwanted attributes
		this.stripUnwantedAttributes(element);
	}

	private static removeHtmlComments(element: Element) {
		const walker = document.createTreeWalker(
			element,
			NodeFilter.SHOW_COMMENT,
			null
		);

		const comments: Comment[] = [];
		let node;
		while (node = walker.nextNode()) {
			comments.push(node as Comment);
		}

		comments.forEach(comment => {
			comment.remove();
		});
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
			return mainContent;
		}

		// Fall back to scoring elements
		const candidates = this.scoreElements(doc);
		if (candidates.length > 0) {
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

} 