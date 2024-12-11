import { debugLog } from './debug';

interface ContentScore {
	score: number;
	element: Element;
}

export class Tidy {
	private static POSITIVE_PATTERNS = /article|content|main|post|body|text|blog|story/i;
	private static NEGATIVE_PATTERNS = /comment|meta|footer|footnote|foot|nav|sidebar|banner|ad|popup|menu/i;
	private static BLOCK_ELEMENTS = ['div', 'section', 'article', 'main'];

	/**
	 * Main entry point - cleans up a document and returns the main content
	 */
	static parse(doc: Document) {
		debugLog('Tidy', 'Starting content extraction');

		// First try to find the main content area
		const mainContent = this.findMainContent(doc);
		if (!mainContent) {
			debugLog('Tidy', 'No main content found');
			return null;
		}

		// Clean up the content
		this.cleanup(mainContent);

		return {
			content: mainContent.outerHTML
		};
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

	private static cleanup(element: Element): void {
		// Remove unwanted elements
		const unwanted = element.querySelectorAll([
			'script',
			'style',
			'iframe:not([src*="youtube"]):not([src*="vimeo"])',
			'form',
			'[class*="comment"]',
			'[id*="comment"]',
			'[class*="share"]',
			'[class*="social"]',
			'[class*="related"]',
			'nav',
			'header:not(:first-child)',
			'footer',
			'.ad',
			'#ad',
			'[role="complementary"]',
			'aside',
		].join(','));

		unwanted.forEach(el => el.remove());

		// Clean up attributes
		this.cleanAttributes(element);
	}

	private static cleanAttributes(element: Element): void {
		// Keep only essential attributes
		const keepAttributes = ['src', 'href', 'alt', 'title', 'datetime'];
		
		const cleanElement = (el: Element) => {
			// Remove all attributes except those in keepAttributes
			Array.from(el.attributes).forEach(attr => {
				if (!keepAttributes.includes(attr.name)) {
					el.removeAttribute(attr.name);
				}
			});

			// Recursively clean child elements
			Array.from(el.children).forEach(child => cleanElement(child));
		};

		cleanElement(element);
	}
} 