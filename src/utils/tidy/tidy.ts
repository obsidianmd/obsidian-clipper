import { MetadataExtractor, TidyMetadata } from './metadata';

// At the top of the file, after imports
declare global {
	interface Window {
		Tidy: typeof Tidy;
	}
}

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
	'.ad',
	'aside',
	'button',
	'canvas',
	'dialog',
	'fieldset',
	'footer',
	'form',
	'header',
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
	'.sidebar',
	'#sidebar',
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

// Patterns for matching against class, id, data-testid, and data-qa
const CLUTTER_PATTERNS = [
	'avatar',
	'-ad-',
	'_ad_',
	'article-end ',
	'article-title',
	'author',
	'banner',
	'bottom-of-article',
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
	'expand-reduce',
	'facebook',
	'feedback',
	'fixed',
	'footer',
	'for-you',
	'global',
	'google',
	'goog-',
	'interlude',
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
	'newsletter-signup',
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
	'recirc',
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
	private static debug = true;

	static enableDebug(enable: boolean = true) {
		this.debug = enable;
	}

	private static log(...args: any[]) {
		if (this.debug) {
			console.log('Tidy:', ...args);
		}
	}

	private static readonly POSITIVE_PATTERNS = POSITIVE_PATTERNS;
	private static readonly NEGATIVE_PATTERNS = NEGATIVE_PATTERNS;
	private static readonly BLOCK_ELEMENTS = BLOCK_ELEMENTS;
	private static readonly HIDDEN_ELEMENTS_SELECTOR = HIDDEN_ELEMENTS_SELECTOR;
	private static readonly ALLOWED_ATTRIBUTES = ALLOWED_ATTRIBUTES;

	static parse(doc: Document): TidyResponse {
		try {
			// Evaluate styles and sizes on original document
			const mobileStyles = this.evaluateMediaQueries(doc);
			const smallImages = this.findSmallImages(doc);
			
			// Clone after evaluation
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

			// Remove small images identified from original document
			this.removeSmallImages(clone, smallImages);
			
			// Perform other destructive operations on the clone
			this.removeHiddenElements(clone);
			this.removeClutter(clone);

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

		this.log('Removed hidden elements:', count);
	}

	private static removeClutter(doc: Document) {
		let basicSelectorCount = 0;
		let patternMatchCount = 0;

		// Normalize and combine all basic selectors into a single selector string
		const normalizedSelectors = BASIC_SELECTORS.map(selector => {
			// Handle attribute selectors separately
			if (selector.includes('[')) {
				// Split attribute selectors into parts
				const parts = selector.split(/(\[.*?\])/);
				return parts.map(part => {
					// Don't lowercase the attribute value if it's in quotes
					if (part.startsWith('[') && part.includes('=')) {
						const [attr, value] = part.slice(1, -1).split('=');
						if (value.startsWith('"') || value.startsWith("'")) {
							return `[${attr.toLowerCase()}=${value}]`;
						}
					}
					return part.toLowerCase();
				}).join('');
			}
			return selector.toLowerCase();
		});

		const combinedSelector = normalizedSelectors.join(',');
		
		// Query and remove elements
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
		const elements = doc.querySelectorAll('[class], [id], [data-testid], [data-qa]');
		
		elements.forEach(el => {
			if (!el || !el.parentNode) return;

			const className = el.className && typeof el.className === 'string' ? 
				el.className.toLowerCase() : '';
			const id = el.id ? el.id.toLowerCase() : '';
			const testId = el.getAttribute('data-testid')?.toLowerCase() || '';
			const testQa = el.getAttribute('data-qa')?.toLowerCase() || '';
			
			// Combine all attributes into one string for single pass checking
			const attributeText = `${className} ${id} ${testId} ${testQa}`;
			
			// Check if any pattern matches
			const shouldRemove = patternRegexes.some(regex => regex.test(attributeText));
			
			if (shouldRemove) {
				elementsToRemove.add(el);
				patternMatchCount++;
			}
		});

		// Batch remove elements
		elementsToRemove.forEach(el => el.remove());

		this.log('Found clutter elements:', {
			basicSelectors: basicSelectorCount,
			patternMatches: patternMatchCount,
			total: basicSelectorCount + patternMatchCount
		});
	}

	private static cleanContent(element: Element) {
		// Remove HTML comments
		this.removeHtmlComments(element);
		
		// Handle h1 elements - remove first one and convert others to h2
		this.handleHeadings(element);
		
		// Strip unwanted attributes
		this.stripUnwantedAttributes(element);

		// Remove empty elements
		this.removeEmptyElements(element);
	}

	private static handleHeadings(element: Element) {
		const h1s = element.getElementsByTagName('h1');
		let isFirstH1 = true;

		Array.from(h1s).forEach(h1 => {
			if (isFirstH1) {
				h1.remove();
				isFirstH1 = false;
			} else {
				// Convert subsequent h1s to h2s
				const h2 = document.createElement('h2');
				h2.innerHTML = h1.innerHTML;
				// Copy allowed attributes
				Array.from(h1.attributes).forEach(attr => {
					if (this.ALLOWED_ATTRIBUTES.has(attr.name)) {
						h2.setAttribute(attr.name, attr.value);
					}
				});
				h1.parentNode?.replaceChild(h2, h1);
			}
		});
	}

	private static removeHtmlComments(element: Element) {
		const comments: Comment[] = [];
		const walker = document.createTreeWalker(
			element,
			NodeFilter.SHOW_COMMENT,
			null
		);

		let node;
		while (node = walker.nextNode()) {
			comments.push(node as Comment);
		}

		comments.forEach(comment => {
			comment.remove();
		});

		this.log('Removed HTML comments:', comments.length);
	}

	private static stripUnwantedAttributes(element: Element) {
		let attributeCount = 0;

		const processElement = (el: Element) => {
			const attributes = Array.from(el.attributes);
			
			attributes.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (!this.ALLOWED_ATTRIBUTES.has(attrName) && !attrName.startsWith('data-')) {
					el.removeAttribute(attr.name);
					attributeCount++;
				}
			});
		};

		processElement(element);
		element.querySelectorAll('*').forEach(processElement);

		this.log('Stripped attributes:', attributeCount);
	}

	private static removeEmptyElements(element: Element) {
		let removedCount = 0;
		let iterations = 0;
		let keepRemoving = true;

		// Elements that are allowed to be empty
		const allowEmpty = new Set([
			'area',
			'audio',
			'base',
			'br',
			'col',
			'embed',
			'figure',
			'hr',
			'iframe',
			'img',
			'input',
			'link',
			'meta',
			'object',
			'param',
			'picture',
			'source',
			'svg',
			'td',
			'th',
			'track',
			'video',
			'wbr'
		]);

		while (keepRemoving) {
			iterations++;
			keepRemoving = false;
			// Get all elements without children, working from deepest first
			const emptyElements = Array.from(element.getElementsByTagName('*')).filter(el => {
				if (allowEmpty.has(el.tagName.toLowerCase())) {
					return false;
				}
				
				// Check if element has only whitespace
				const hasOnlyWhitespace = el.textContent?.trim().length === 0;
				
				// Check if element has no meaningful children
				// Note: comments were already removed
				const hasNoChildren = !el.hasChildNodes() || 
					(Array.from(el.childNodes).every(node => 
						node.nodeType === Node.TEXT_NODE && node.textContent?.trim().length === 0
					));

				return hasOnlyWhitespace && hasNoChildren;
			});

			if (emptyElements.length > 0) {
				emptyElements.forEach(el => {
					el.remove();
					removedCount++;
				});
				keepRemoving = true;
			}
		}

		this.log('Removed empty elements:', {
			count: removedCount,
			iterations
		});
	}

	private static findSmallImages(doc: Document): Set<string> {
		let removedCount = 0;
		const MIN_DIMENSION = 24;
		const smallImages = new Set<string>();

		const images = doc.getElementsByTagName('img');
		Array.from(images).forEach(img => {
			try {
				const computedStyle = window.getComputedStyle(img);
				
				// Get all possible dimensions
				const naturalWidth = img.naturalWidth || 0;
				const naturalHeight = img.naturalHeight || 0;
				const attrWidth = parseInt(img.getAttribute('width') || '0');
				const attrHeight = parseInt(img.getAttribute('height') || '0');
				const styleWidth = parseInt(computedStyle.width) || 0;
				const styleHeight = parseInt(computedStyle.height) || 0;
				const rect = img.getBoundingClientRect();
				const displayWidth = rect.width;
				const displayHeight = rect.height;

				// Check if image is scaled down by CSS transform
				const transform = computedStyle.transform;
				const scale = transform ? parseFloat(transform.match(/scale\(([\d.]+)\)/)?.[1] || '1') : 1;
				const scaledWidth = displayWidth * scale;
				const scaledHeight = displayHeight * scale;

				// Use the smallest non-zero dimensions we can find
				const effectiveWidth = Math.min(
					...[naturalWidth, attrWidth, styleWidth, scaledWidth]
						.filter(dim => dim > 0)
				);
				const effectiveHeight = Math.min(
					...[naturalHeight, attrHeight, styleHeight, scaledHeight]
						.filter(dim => dim > 0)
				);

				if (effectiveWidth > 0 && effectiveHeight > 0 && 
					(effectiveWidth < MIN_DIMENSION || effectiveHeight < MIN_DIMENSION)) {
					// Store unique identifier for the image
					const identifier = this.getImageIdentifier(img);
					if (identifier) {
						smallImages.add(identifier);
						removedCount++;
					}
				}
			} catch (e) {
				console.error('Error processing image:', e);
			}
		});

		this.log('Found small images:', removedCount);
		return smallImages;
	}

	private static removeSmallImages(doc: Document, smallImages: Set<string>) {
		let removedCount = 0;
		const images = doc.getElementsByTagName('img');
		
		Array.from(images).forEach(img => {
			const identifier = this.getImageIdentifier(img);
			if (identifier && smallImages.has(identifier)) {
				img.remove();
				removedCount++;
			}
		});

		this.log('Removed small images:', removedCount);
	}

	private static getImageIdentifier(img: HTMLImageElement): string | null {
		// Try to create a unique identifier using various attributes
		const src = img.src || img.getAttribute('data-src') || '';
		const srcset = img.srcset || img.getAttribute('data-srcset') || '';
		const alt = img.alt || '';
		const className = img.className || '';
		const id = img.id || '';
		
		if (src) return `src:${src}`;
		if (srcset) return `srcset:${srcset}`;
		if (id) return `id:${id}`;
		if (className && alt) return `class:${className};alt:${alt}`;
		
		return null;
	}

	private static findMainContent(doc: Document): Element | null {
		// Priority list of content markers
		const contentSelectors = [
			'article',
			'[role="article"]',
			'[itemprop="articleBody"]',
			'.post-content',
			'.article-content',
			'#article-content',
			'.content-article',
			'main',
			'[role="main"]',
			'body'
		];

		// Find all potential content containers
		const candidates: { element: Element; score: number }[] = [];
		
		contentSelectors.forEach((selector, index) => {
			const elements = doc.querySelectorAll(selector);
			elements.forEach(element => {
				// Base score from selector priority (earlier = higher)
				let score = (contentSelectors.length - index) * 10;
				
				// Add score based on content analysis
				score += this.scoreElement(element);
				
				candidates.push({ element, score });
			});
		});

		if (candidates.length === 0) {
			// Fall back to scoring block elements
			return this.findContentByScoring(doc);
		}

		// Sort by score descending
		candidates.sort((a, b) => b.score - a.score);
		
		if (this.debug) {
			this.log('Content candidates:', candidates.map(c => ({
				element: c.element.tagName,
				selector: this.getElementSelector(c.element),
				score: c.score
			})));
		}

		return candidates[0].element;
	}

	private static findContentByScoring(doc: Document): Element | null {
		const candidates = this.scoreElements(doc);
		return candidates.length > 0 ? candidates[0].element : null;
	}

	private static getElementSelector(element: Element): string {
		const parts: string[] = [];
		let current: Element | null = element;
		
		while (current && current !== document.documentElement) {
			let selector = current.tagName.toLowerCase();
			if (current.id) {
				selector += '#' + current.id;
			} else if (current.className) {
				selector += '.' + current.className.trim().split(/\s+/).join('.');
			}
			parts.unshift(selector);
			current = current.parentElement;
		}
		
		return parts.join(' > ');
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

window.Tidy = Tidy; 