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

	/**
	 * Main entry point - cleans up HTML content and returns the main content
	 */
	static parseFromString(html: string) {
		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, 'text/html');
			
			// Simulate mobile viewport
			const viewport = doc.createElement('meta');
			viewport.setAttribute('name', 'viewport');
			viewport.setAttribute('content', this.MOBILE_VIEWPORT);
			doc.head.appendChild(viewport);
			
			// Force mobile media queries
			const mobileStyle = doc.createElement('style');
			mobileStyle.textContent = `
				@media screen {
					:root { max-width: 600px !important; }
					body { max-width: 600px !important; }
				}
			`;
			doc.head.appendChild(mobileStyle);

			return this.parse(doc);
		} catch (error) {
			console.error('Error parsing HTML:', error);
			return null;
		}
	}

	/**
	 * Internal method to process an already parsed document
	 */
	static parse(doc: Document) {
		debugLog('Tidy', 'Starting content extraction');

		// Remove hidden elements first
		this.removeHiddenElements(doc);
		
		// Remove common clutter elements
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

	private static removeHiddenElements(doc: Document) {
		const hiddenElements = doc.querySelectorAll(this.HIDDEN_ELEMENTS_SELECTOR);
		hiddenElements.forEach(el => el.remove());
	}

	private static removeClutter(doc: Document) {
		const clutterSelectors = [
			'link',
			'iframe',
			'nav',
			'header:not(:first-child)',
			'footer',
			'[role="complementary"]',
			'[role="banner"]',
			'[role="navigation"]',
			'.social-share',
			'.related-articles',
			'.recommended',
			'#comments',
			'.comments',
		];

		clutterSelectors.forEach(selector => {
			doc.querySelectorAll(selector).forEach(el => el.remove());
		});
	}

	private static cleanContent(element: Element) {
		// Remove empty paragraphs and divs
		element.querySelectorAll('p, div').forEach(el => {
			if (!el.textContent?.trim() && !el.querySelector('img')) {
				el.remove();
			}
		});

		// Remove tracking pixels and tiny images
		element.querySelectorAll('img').forEach(img => {
			const width = parseInt(img.getAttribute('width') || '0');
			const height = parseInt(img.getAttribute('height') || '0');
			if (width <= 1 || height <= 1) {
				img.remove();
			}
		});

		// Remove click tracking attributes
		element.querySelectorAll('[onclick], [data-tracking]').forEach(el => {
			el.removeAttribute('onclick');
			el.removeAttribute('data-tracking');
		});
	}

	private static findMainContent(doc: Document): Element | null {
		// First look for elements with explicit content markers
		const mainContent = doc.querySelector([
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
		
		// Add viewport meta for mobile simulation
		let viewport = doc.querySelector('meta[name="viewport"]');
		if (!viewport) {
			viewport = doc.createElement('meta');
			viewport.setAttribute('name', 'viewport');
			doc.head.appendChild(viewport);
		}
		viewport.setAttribute('content', this.MOBILE_VIEWPORT);

		// Force mobile width
		const mobileStyle = doc.createElement('style');
		mobileStyle.id = 'obsidian-tidy-style';
		mobileStyle.textContent = `
			@media screen {
				:root { max-width: 600px !important; margin: 0 auto !important; }
				body { max-width: 600px !important; margin: 0 auto !important; padding: 20px !important; }
			}
		`;
		doc.head.appendChild(mobileStyle);

		// Remove hidden elements
		this.removeHiddenElements(doc);
		
		// Remove clutter
		this.removeClutter(doc);

		// Find and clean main content
		const mainContent = this.findMainContent(doc);
		if (mainContent) {
			this.cleanContent(mainContent);
			// Replace body content with main content
			doc.body.innerHTML = mainContent.outerHTML;
		}

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