import { debugLog } from './debug';

interface ContentScore {
	score: number;
	element: Element;
}

export class Tidy {
	private static POSITIVE_PATTERNS = /article|content|main|post|body|text|blog|story/i;
	private static NEGATIVE_PATTERNS = /comment|meta|footer|footnote|foot|nav|sidebar|banner|ad|popup|menu/i;
	private static BLOCK_ELEMENTS = ['div', 'section', 'article', 'main'];
	
	// Add viewport meta tag to simulate mobile view
	private static MOBILE_VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';
	
	private static HIDDEN_ELEMENTS_SELECTOR = [
		'[aria-hidden="true"]',
		'[hidden]',
		'[style*="display: none"]',
		'[style*="display:none"]',
		'[style*="visibility: hidden"]',
		'[style*="visibility:hidden"]',
		'.hidden',
		'.invisible'
	].join(',');

	private static originalHTML: string | null = null;
	private static isActive: boolean = false;
	private static MOBILE_WIDTH = 600; // Default mobile viewport width

	private static ALLOWED_ATTRIBUTES = new Set([
		// Essential attributes
		'href',
		'src',
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

	/**
	 * Main entry point - cleans up HTML content and returns the main content
	 */
	static parse(doc: Document) {
		debugLog('Tidy', 'Starting content extraction');

		// Simulate mobile viewport
		this.simulateMobileViewport(doc);

		// Force media query evaluation
		this.evaluateMediaQueries(doc);

		// Remove hidden elements first
		this.removeHiddenElements(doc);
		
		// Remove common clutter
		this.removeClutter(doc);

		// Find main content
		const mainContent = this.findMainContent(doc);
		if (!mainContent) {
			debugLog('Tidy', 'No main content found');
			return null;
		}

		// Clean up the main content
		this.cleanContent(mainContent);

		return {
			content: mainContent.outerHTML
		};
	}

	private static simulateMobileViewport(doc: Document) {
		try {
			// Ensure head element exists
			if (!doc.head) {
				const head = doc.createElement('head');
				doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
			}

			// Add viewport meta
			let viewport = doc.querySelector('meta[name="viewport"]');
			if (!viewport) {
				viewport = doc.createElement('meta');
				viewport.setAttribute('name', 'viewport');
				viewport.setAttribute('content', this.MOBILE_VIEWPORT);
				doc.head.appendChild(viewport);
			} else {
				viewport.setAttribute('content', this.MOBILE_VIEWPORT);
			}

			// Create or update style element
			let style = doc.getElementById('obsidian-mobile-viewport');
			if (!style) {
				style = doc.createElement('style');
				style.id = 'obsidian-mobile-viewport';
				doc.head.appendChild(style);
			}
			
			style.textContent = `
				:root {
					--obsidian-viewport-width: ${this.MOBILE_WIDTH}px;
				}
				html {
					width: ${this.MOBILE_WIDTH}px !important;
				}
			`;
		} catch (error) {
			debugLog('Tidy', 'Error setting up mobile viewport:', error);
			// Continue execution even if viewport setup fails
		}
	}

	private static evaluateMediaQueries(doc: Document) {
		try {
			// Get all stylesheets, including inline styles
			const sheets = Array.from(doc.styleSheets).filter(sheet => {
				try {
					// Try to access cssRules to check if the sheet is accessible
					const rules = sheet.cssRules;
					return true;
				} catch (e) {
					// Skip inaccessible sheets (e.g., cross-origin)
					return false;
				}
			});
			
			sheets.forEach(sheet => {
				try {
					const rules = Array.from(sheet.cssRules);
					rules.forEach(rule => {
						if (rule instanceof CSSMediaRule) {
							// Check if this is a max-width media query
							if (rule.conditionText.includes('max-width')) {
								const maxWidth = parseInt(rule.conditionText.match(/\d+/)?.[0] || '0');
								
								// If our mobile width is less than the max-width, apply these rules
								if (this.MOBILE_WIDTH <= maxWidth) {
									Array.from(rule.cssRules).forEach(cssRule => {
										if (cssRule instanceof CSSStyleRule) {
											try {
												const elements = doc.querySelectorAll(cssRule.selectorText);
												elements.forEach(element => {
													// Apply the styles directly to the element
													element.setAttribute('style', 
														(element.getAttribute('style') || '') + 
														cssRule.style.cssText
													);
												});
											} catch (e) {
												// Skip problematic selectors
												debugLog('Tidy', 'Error applying styles for selector:', cssRule.selectorText, e);
											}
										}
									});
								}
							}
						}
					});
				} catch (e) {
					// Skip errors for individual stylesheets
					debugLog('Tidy', 'Error processing stylesheet:', e);
				}
			});
		} catch (e) {
			debugLog('Tidy', 'Error evaluating media queries:', e);
		}
	}

	private static removeHiddenElements(doc: Document) {
		// Existing hidden elements selector
		const hiddenElements = doc.querySelectorAll(this.HIDDEN_ELEMENTS_SELECTOR);
		hiddenElements.forEach(el => el.remove());

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
			}
		});
	}

	private static removeClutter(doc: Document) {
		// const clutterSelectors = [
		// 	'link',
		// 	'iframe',
		// 	'nav',
		// 	'header:not(:first-child)',
		// 	'footer',
		// 	'[role="complementary"]',
		// 	'[role="banner"]',
		// 	'[role="navigation"]',
		// 	'.social-share',
		// 	'.related-articles',
		// 	'.recommended',
		// 	'#comments',
		// 	'.comments',
		// ];

		// clutterSelectors.forEach(selector => {
		// 	doc.querySelectorAll(selector).forEach(el => el.remove());
		// });
	}

	private static cleanContent(element: Element) {
		// Remove empty paragraphs and divs
		element.querySelectorAll('p, div').forEach(el => {
			if (!el.textContent?.trim() && !el.querySelector('img, figure, picture, iframe, video, audio, canvas, svg, math, iframe')) {
				el.remove();
			}
		});

		// Strip unwanted attributes
		this.stripUnwantedAttributes(element);
	}

	private static stripUnwantedAttributes(element: Element) {
		const processElement = (el: Element) => {
			// Get all attributes
			const attributes = Array.from(el.attributes);
			
			// Remove attributes not in whitelist and not data-*
			attributes.forEach(attr => {
				const attrName = attr.name.toLowerCase();
				if (!this.ALLOWED_ATTRIBUTES.has(attrName) && !attrName.startsWith('data-')) {
					el.removeAttribute(attr.name);
				}
			});

			// Special handling for style attribute - only keep essential styles
			const style = el.getAttribute('style');
			if (style) {
				const essentialStyles = this.filterEssentialStyles(style);
				if (essentialStyles) {
					el.setAttribute('style', essentialStyles);
				} else {
					el.removeAttribute('style');
				}
			}
		};

		// Process the main element
		processElement(element);

		// Process all child elements
		element.querySelectorAll('*').forEach(processElement);
	}

	private static filterEssentialStyles(style: string): string | null {
		// List of essential style properties to keep
		const essentialProperties = new Set([
			'display',
			'position',
			'width',
			'height',
			'margin',
			'padding',
			'text-align',
			'vertical-align',
			'float',
			'clear',
			'border',
			'background',
			'color',
			'font-size',
			'font-weight',
			'line-height',
			'white-space'
		]);

		const styles = style.split(';')
			.map(s => s.trim())
			.filter(s => s.length > 0)
			.map(s => {
				const [property, ...values] = s.split(':');
				return {
					property: property.trim().toLowerCase(),
					value: values.join(':').trim()
				};
			})
			.filter(({property}) => essentialProperties.has(property))
			.map(({property, value}) => `${property}: ${value}`);

		return styles.length > 0 ? styles.join('; ') : null;
	}

	private static findMainContent(doc: Document): Element | null {
		// First look for elements with explicit content markers
		const mainContent = doc.querySelector([
			'body',
			'main[role="main"]',
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

		// Create clean HTML structure
		doc.documentElement.innerHTML = `
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="${this.MOBILE_VIEWPORT}">
				<style>
					body {
						max-width: 800px;
						margin: 0 auto;
						padding: 20px;
						font-family: system-ui, -apple-system, sans-serif;
						line-height: 1.6;
					}
					img {
						max-width: 100%;
						height: auto;
					}
				</style>
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