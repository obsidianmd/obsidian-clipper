/**
 * DOM Outline Extractor
 *
 * Extracts a compressed semantic structure from HTML to reduce token usage
 * when sending to LLM for template generation.
 */

export interface DOMOutline {
	selectors: string[];
	structure: DOMStructureNode;
	semanticSections: string[];
}

export interface DOMStructureNode {
	tag?: string;
	id?: string;
	classes?: string[];
	children?: DOMStructureNode[];
	textContent?: string;
}

const SEMANTIC_TAGS = [
	'article', 'section', 'main', 'header', 'footer', 'nav', 'aside',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
	'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
];

const MAX_TEXT_SAMPLE_LENGTH = 50;
const MAX_CHILDREN_PER_NODE = 10;

/**
 * Extract DOM outline from HTML string
 */
export function extractDOMOutline(html: string): DOMOutline {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	const selectors = extractKeySelectors(doc);
	const structure = extractStructure(doc.body);
	const semanticSections = extractSemanticSections(doc);

	return {
		selectors,
		structure,
		semanticSections
	};
}

/**
 * Extract key CSS selectors from document
 */
function extractKeySelectors(doc: Document): string[] {
	const selectors: string[] = [];

	// Find elements with IDs
	const elementsWithId = doc.querySelectorAll('[id]');
	elementsWithId.forEach(el => {
		const id = el.id;
		// Skip auto-generated or generic IDs
		if (id && !id.match(/^(root|app|main|content|wrapper|\d+)$/i) && id.length < 50) {
			selectors.push(`#${id}`);
		}
	});

	// Find elements with meaningful classes
	const elementsWithClass = doc.querySelectorAll('[class]');
	const classSet = new Set<string>();
	elementsWithClass.forEach(el => {
		const classes = Array.from(el.classList);
		classes.forEach(cls => {
			// Skip utility classes, auto-generated classes
			if (!cls.match(/^(container|wrapper|row|col|hidden|visible|active|\d+|_|css-)/i) &&
			    cls.length < 30 &&
			    !classSet.has(cls)) {
				classSet.add(cls);
				selectors.push(`.${cls}`);
			}
		});
	});

	// Find semantic elements
	SEMANTIC_TAGS.forEach(tag => {
		const elements = doc.getElementsByTagName(tag);
		if (elements.length > 0 && elements.length < 20) {
			selectors.push(tag);
		}
	});

	// Limit total selectors to prevent token explosion
	return selectors.slice(0, 50);
}

/**
 * Extract semantic sections from document
 */
function extractSemanticSections(doc: Document): string[] {
	const sections: string[] = [];

	// Common semantic section patterns
	const sectionPatterns = [
		{ selector: 'article', name: 'article' },
		{ selector: '.abstract, #abstract', name: 'abstract' },
		{ selector: '.introduction, #introduction, #intro', name: 'introduction' },
		{ selector: '.methodology, #methodology, .methods, #methods', name: 'methodology' },
		{ selector: '.results, #results', name: 'results' },
		{ selector: '.discussion, #discussion', name: 'discussion' },
		{ selector: '.conclusion, #conclusion', name: 'conclusion' },
		{ selector: '.references, #references, .bibliography', name: 'references' },
		{ selector: '.content, #content, .main-content, #main-content', name: 'main-content' },
		{ selector: '.post, .article-body, .post-content', name: 'post-content' },
		{ selector: '.recipe, .ingredients, .instructions', name: 'recipe-section' }
	];

	sectionPatterns.forEach(({ selector, name }) => {
		try {
			const element = doc.querySelector(selector);
			if (element) {
				// Try to get a more specific selector
				let specificSelector = selector.split(',')[0].trim();
				if (element.id) {
					specificSelector = `#${element.id}`;
				} else if (element.classList.length > 0) {
					specificSelector = `.${Array.from(element.classList)[0]}`;
				}
				sections.push(specificSelector);
			}
		} catch (e) {
			// Invalid selector, skip
		}
	});

	return sections;
}

/**
 * Extract simplified structure from DOM element
 */
function extractStructure(element: Element, depth: number = 0): DOMStructureNode {
	const MAX_DEPTH = 4;

	if (depth > MAX_DEPTH) {
		return { tag: element.tagName.toLowerCase() };
	}

	const node: DOMStructureNode = {
		tag: element.tagName.toLowerCase()
	};

	// Add ID if present and meaningful
	if (element.id && element.id.length < 50) {
		node.id = element.id;
	}

	// Add classes if meaningful
	const meaningfulClasses = Array.from(element.classList).filter(cls =>
		!cls.match(/^(container|wrapper|row|col|hidden|visible|active|\d+|_|css-)/i) &&
		cls.length < 30
	).slice(0, 3);
	if (meaningfulClasses.length > 0) {
		node.classes = meaningfulClasses;
	}

	// Only process semantic tags
	if (!node.tag || !SEMANTIC_TAGS.includes(node.tag)) {
		return node;
	}

	// Add text sample for leaf nodes
	if (element.children.length === 0 && element.textContent) {
		const text = element.textContent.trim();
		if (text.length > 0) {
			node.textContent = text.substring(0, MAX_TEXT_SAMPLE_LENGTH) +
				(text.length > MAX_TEXT_SAMPLE_LENGTH ? '...' : '');
		}
	}

	// Recursively process children (limit number)
	const semanticChildren = Array.from(element.children)
		.filter(child => SEMANTIC_TAGS.includes(child.tagName.toLowerCase()))
		.slice(0, MAX_CHILDREN_PER_NODE);

	if (semanticChildren.length > 0) {
		node.children = semanticChildren.map(child =>
			extractStructure(child, depth + 1)
		);
	}

	return node;
}

/**
 * Convert DOM outline to compact JSON string for LLM
 */
export function serializeDOMOutline(outline: DOMOutline): string {
	return JSON.stringify(outline, null, 0);
}

/**
 * Extract available selectors with their element counts
 */
export function getSelectorStats(html: string): { selector: string; count: number }[] {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	const outline = extractDOMOutline(html);
	const stats = outline.selectors.map(selector => {
		try {
			const elements = doc.querySelectorAll(selector);
			return {
				selector,
				count: elements.length
			};
		} catch (e) {
			return {
				selector,
				count: 0
			};
		}
	});

	return stats.filter(s => s.count > 0);
}
