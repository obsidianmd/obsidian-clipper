import { Defuddle } from 'defuddle';
import { debugLog } from './debug';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import { ExtractorRegistry } from './extractor-registry';

// Mobile viewport settings
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
	theme: string;
}

export class Reader {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;
	private static settingsBar: HTMLElement | null = null;
	private static settings: ReaderSettings = {
		fontSize: 16,
		lineHeight: 1.6,
		maxWidth: 38,
		theme: 'default'
	};

	private static async loadSettings(): Promise<void> {
		const savedSettings = await getLocalStorage('reader_settings');
		if (savedSettings) {
			this.settings = {
				...this.settings,
				...savedSettings
			};
		}
	}

	private static async saveSettings(): Promise<void> {
		await setLocalStorage('reader_settings', this.settings);
	}

	private static injectSettingsBar(doc: Document) {
		// Create settings bar
		const settingsBar = doc.createElement('div');
		settingsBar.className = 'obsidian-reader-settings';
		settingsBar.innerHTML = `
			<div class="obsidian-reader-settings-controls">
				<button class="obsidian-reader-settings-button" data-action="decrease-font">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M19 13H5"/>
					</svg>
				</button>
				<button class="obsidian-reader-settings-button" data-action="increase-font">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M12 5v14M5 12h14"/>
					</svg>
				</button>

				<button class="obsidian-reader-settings-button" data-action="decrease-width">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 3H3M21 21H3M16 12H8M3 12V3M3 21v-9M21 12V3M21 21v-9"/>
					</svg>
				</button>
				<button class="obsidian-reader-settings-button" data-action="increase-width">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 3H3M21 21H3M21 12H3M3 12V3M3 21v-9M21 12V3M21 21v-9"/>
					</svg>
				</button>

				<button class="obsidian-reader-settings-button" data-action="decrease-line-height">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 6h18M3 12h18M3 18h18"/>
					</svg>
				</button>
				<button class="obsidian-reader-settings-button" data-action="increase-line-height">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 5h18M3 10h18M3 15h18M3 20h18"/>
					</svg>
				</button>

				<select class="obsidian-reader-settings-select" data-action="change-theme">
					<option value="default">Default</option>
					<option value="flexoki">Flexoki</option>
				</select>
			</div>
		`;

		const style = doc.createElement('style');
		style.textContent = `
			.obsidian-reader-settings {
				position: fixed;
				top: 20px;
				right: 20px;
				background: var(--obsidian-reader-background-primary);
				padding: 4px;
				z-index: 999999999;
				font-family: var(--obsidian-reader-font-family);
			}
			.obsidian-reader-settings-controls {
				display: grid;
				align-items: center;
				gap: 4px;
			}
			.obsidian-reader-settings-button {
				display: flex;
				align-items: center;
				justify-content: center;
				width: 24px;
				height: 24px;
				border: none;
				background: transparent;
				border-radius: 12px;
				color: var(--obsidian-reader-text-muted);
				cursor: pointer;
				padding: 0;
			}
			.obsidian-reader-settings-button:hover {
				background: var(--obsidian-reader-background-primary-alt);
				color: var(--obsidian-reader-text-primary);
			}
			.obsidian-reader-settings-select {
				background: transparent;
				border: none;
				color: var(--obsidian-reader-text-muted);
				font-family: var(--obsidian-reader-font-family);
				font-size: 12px;
				padding: 4px;
				border-radius: 12px;
				cursor: pointer;
				margin-left: 4px;
			}
			.obsidian-reader-settings-select:hover {
				background: var(--obsidian-reader-background-primary-alt);
				color: var(--obsidian-reader-text-primary);
			}
			.obsidian-reader-settings-select:focus {
				outline: none;
				background: var(--obsidian-reader-background-primary-alt);
				color: var(--obsidian-reader-text-primary);
			}
			.obsidian-reader-outline {
				position: fixed;
				left: 0;
				top: 0;
				width: 240px;
				padding: 16px;
				overflow-y: auto;
				font-family: var(--obsidian-reader-font-family);
				font-size: 14px;
				z-index: 999999998;
			}
			.obsidian-reader-outline-item {
				color: var(--obsidian-reader-text-primary);
				cursor: pointer;
				padding: 4px 0;
				text-overflow: ellipsis;
				overflow: hidden;
				white-space: nowrap;
			}
			.obsidian-reader-outline-item:hover {
				color: var(--obsidian-reader-text-primary);
			}
			.obsidian-reader-outline-h3 {
				padding-left: 16px;
			}
			.obsidian-reader-outline-h4 {
				padding-left: 32px;
			}
			.obsidian-reader-outline-h5,
			.obsidian-reader-outline-h6 {
				padding-left: 48px;
			}
			.obsidian-reader-outline-item.active {
				color: var(--obsidian-reader-text-primary);
				font-weight: 600;
			}
			.obsidian-reader-outline-item.faint {
				color: var(--obsidian-reader-text-faint);
			}
			.obsidian-reader-outline-item.faint:hover {
				color: var(--obsidian-reader-text-muted);
			}
		`;

		doc.head.appendChild(style);
		doc.body.appendChild(settingsBar);
		this.settingsBar = settingsBar;

		// Initialize values from settings
		this.updateFontSize(doc, parseInt(getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-reader-font-size')));
		this.updateWidth(doc, parseInt(getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-reader-line-width')));
		this.updateLineHeight(doc, parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--obsidian-reader-line-height')));

		settingsBar.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const button = target.closest('.obsidian-reader-settings-button') as HTMLButtonElement;
			if (!button) return;

			const action = button.dataset.action;
			const html = doc.documentElement;
			const style = getComputedStyle(html);

			switch (action) {
				case 'decrease-font':
					this.updateFontSize(doc, parseInt(style.getPropertyValue('--obsidian-reader-font-size')) - 1);
					break;
				case 'increase-font':
					this.updateFontSize(doc, parseInt(style.getPropertyValue('--obsidian-reader-font-size')) + 1);
					break;
				case 'decrease-width':
					this.updateWidth(doc, parseInt(style.getPropertyValue('--obsidian-reader-line-width')) - 1);
					break;
				case 'increase-width':
					this.updateWidth(doc, parseInt(style.getPropertyValue('--obsidian-reader-line-width')) + 1);
					break;
				case 'decrease-line-height':
					this.updateLineHeight(doc, parseFloat(style.getPropertyValue('--obsidian-reader-line-height')) - 0.1);
					break;
				case 'increase-line-height':
					this.updateLineHeight(doc, parseFloat(style.getPropertyValue('--obsidian-reader-line-height')) + 0.1);
					break;
			}
		});

		// Add theme select event listener
		const themeSelect = settingsBar.querySelector('[data-action="change-theme"]') as HTMLSelectElement;
		if (themeSelect) {
			themeSelect.value = this.settings.theme;
			themeSelect.addEventListener('change', () => {
				this.updateTheme(doc, themeSelect.value as 'default' | 'flexoki');
			});
		}
	}

	private static updateFontSize(doc: Document, size: number) {
		size = Math.max(12, Math.min(24, size));
		doc.documentElement.style.setProperty('--obsidian-reader-font-size', `${size}px`);
		this.settings.fontSize = size;
		this.saveSettings();
	}

	private static updateWidth(doc: Document, width: number) {
		width = Math.max(30, Math.min(60, width));
		doc.documentElement.style.setProperty('--obsidian-reader-line-width', `${width}em`);
		this.settings.maxWidth = width;
		this.saveSettings();
	}

	private static updateLineHeight(doc: Document, height: number) {
		height = Math.max(1.2, Math.min(2, Math.round(height * 10) / 10));
		doc.documentElement.style.setProperty('--obsidian-reader-line-height', height.toString());
		this.settings.lineHeight = height;
		this.saveSettings();
	}

	private static updateTheme(doc: Document, theme: 'default' | 'flexoki'): void {
		doc.documentElement.setAttribute('data-reader-theme', theme);
		this.settings.theme = theme;
		this.saveSettings();
	}

	private static extractContent(doc: Document): { 
		content: string; 
		title?: string; 
		author?: string; 
		published?: string; 
		domain?: string;
		extractorType?: string;
	} {
		const defuddled = new Defuddle(doc).parse();
		const schemaOrgData = defuddled.schemaOrgData;

		// Try to use a specific extractor first
		const extractor = ExtractorRegistry.findExtractor(doc, doc.URL, schemaOrgData);
		if (extractor && extractor.canExtract()) {
			debugLog('Reader', 'Using custom extractor');
			const result = extractor.extract();
			return {
				content: result.contentHtml,
				title: result.variables?.title,
				author: result.variables?.author,
				published: result.variables?.published,
				domain: result.variables?.domain,
				extractorType: extractor.constructor.name.replace('Extractor', '').toLowerCase()
			};
		}

		// Fall back to Defuddle if no specific extractor or extraction failed
		debugLog('Reader', 'Falling back to Defuddle');
		return {
			content: defuddled.content,
			title: defuddled.title,
			author: defuddled.author,
			published: defuddled.published,
			domain: defuddled.domain
		};
	}

	private static generateOutline(doc: Document) {
		const article = doc.querySelector('article');
		if (!article) return null;

		// Create outline container
		const outline = doc.createElement('div');
		outline.className = 'obsidian-reader-outline';

		// Find all headings h2-h6
		const headings = article.querySelectorAll('h2, h3, h4, h5, h6');
		
		if (headings.length === 0) {
			outline.style.display = 'none';
			return null;
		}

		// Add unique IDs to headings if they don't have them
		headings.forEach((heading, index) => {
			if (!heading.id) {
				heading.id = `heading-${index}`;
			}
		});

		// Create outline items and store references
		const outlineItems = new Map();

		headings.forEach((heading) => {
			const item = doc.createElement('div');
			item.className = `obsidian-reader-outline-item obsidian-reader-outline-${heading.tagName.toLowerCase()}`;
			item.textContent = heading.textContent;
			
			item.addEventListener('click', () => {
				const rect = heading.getBoundingClientRect();
				const scrollTop = window.pageYOffset || doc.documentElement.scrollTop;
				const targetY = scrollTop + rect.top - window.innerHeight * 0.05;
				window.scrollTo({
					top: targetY,
					behavior: 'smooth'
				});
			});

			outline.appendChild(item);
			outlineItems.set(heading, item);
		});

		// Set up intersection observer for headings
		const observerCallback = (entries: IntersectionObserverEntry[]) => {
			entries.forEach(entry => {
				const heading = entry.target;
				const item = outlineItems.get(heading);
				
				if (entry.isIntersecting) {
					// Remove active state from all items
					outlineItems.forEach((outlineItem) => {
						outlineItem.classList.remove('active');
					});
					item?.classList.add('active');
					
					// Update faint state for all items
					outlineItems.forEach((outlineItem, itemHeading) => {
						const headingRect = itemHeading.getBoundingClientRect();
						const currentHeadingRect = heading.getBoundingClientRect();
						
						if (headingRect.top < currentHeadingRect.top) {
							outlineItem.classList.add('faint');
						} else {
							outlineItem.classList.remove('faint');
						}
					});
				}
			});
		};

		const observer = new IntersectionObserver(observerCallback, {
			rootMargin: '-5% 0px -85% 0px', // Triggers when heading is in top 20% of viewport
			threshold: 0
		});

		headings.forEach(heading => {
			observer.observe(heading);
		});

		doc.body.appendChild(outline);
		return observer;
	}

	private static observer: IntersectionObserver | null = null;

	static async apply(doc: Document) {
		// Load saved settings first
		await this.loadSettings();

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
		
		// Extract content using extractors or Defuddle
		const { content, title, author, published, domain, extractorType } = this.extractContent(doc);
		if (!content) {
			debugLog('Reader', 'Failed to extract content');
			return;
		}

		// Format the published date if it exists
		let formattedDate = '';
		if (published) {
			try {
				const date = new Date(published);
				if (!isNaN(date.getTime())) {
					formattedDate = new Intl.DateTimeFormat(undefined, {
						year: 'numeric',
						month: 'long',
						day: 'numeric',
						timeZone: 'UTC'
					}).format(date);
				} else {
					formattedDate = published;
				}
			} catch (e) {
				formattedDate = published;
				debugLog('Reader', 'Error formatting date:', e);
			}
		}

		// Clean up head - remove unwanted elements but keep meta tags and non-stylesheet links
		const head = doc.head;

		// Remove scripts except JSON-LD schema
		const scripts = head.querySelectorAll('script:not([type="application/ld+json"])');
		scripts.forEach(el => el.remove());

		// Remove base tags
		const baseTags = head.querySelectorAll('base');
		baseTags.forEach(el => el.remove());

		// Remove only stylesheet links and style tags
		const styleElements = head.querySelectorAll('link[rel="stylesheet"], link[as="style"], style');
		styleElements.forEach(el => el.remove());

		// Ensure we have our required meta tags
		const existingViewport = head.querySelector('meta[name="viewport"]');
		if (existingViewport) {
			existingViewport.setAttribute('content', VIEWPORT);
		} else {
			const viewport = document.createElement('meta');
			viewport.setAttribute('name', 'viewport');
			viewport.setAttribute('content', VIEWPORT);
			head.appendChild(viewport);
		}

		const existingCharset = head.querySelector('meta[charset]');
		if (existingCharset) {
			existingCharset.setAttribute('charset', 'UTF-8');
		} else {
			const charset = document.createElement('meta');
			charset.setAttribute('charset', 'UTF-8');
			head.insertBefore(charset, head.firstChild);
		}

		doc.body.innerHTML = `
			<article>
			${title ? `<h1>${title}</h1>` : ''}
				<div class="metadata">
					<div class="metadata-details">
						${[
							author ? `By ${author}` : '',
							formattedDate || '',
							domain ? `<a href="${doc.URL}">${domain}</a>` : ''
						].filter(Boolean).map(item => `<span>${item}</span>`).join('<span> · </span>')}
					</div>
				</div>
				${content}
			</article>
		`;

		doc.documentElement.className = 'obsidian-reader-active';
		if (extractorType) {
			doc.documentElement.setAttribute('data-reader-extractor', extractorType);
		}
		doc.documentElement.setAttribute('data-reader-theme', this.settings.theme);
		
		// Initialize settings from local storage
		doc.documentElement.style.setProperty('--obsidian-reader-font-size', `${this.settings.fontSize}px`);
		doc.documentElement.style.setProperty('--obsidian-reader-line-height', this.settings.lineHeight.toString());
		doc.documentElement.style.setProperty('--obsidian-reader-line-width', `${this.settings.maxWidth}em`);

		// Add settings bar and outline
		this.injectSettingsBar(doc);
		this.observer = this.generateOutline(doc);
		
		this.isActive = true;
	}

	static restore(doc: Document) {
		if (this.originalHTML) {			
			// Disconnect the observer if it exists
			if (this.observer) {
				this.observer.disconnect();
				this.observer = null;
			}

			const parser = new DOMParser();
			const newDoc = parser.parseFromString(this.originalHTML, 'text/html');
			doc.replaceChild(
				newDoc.documentElement,
				doc.documentElement
			);
			
			this.originalHTML = null;
			this.settingsBar = null;
			const outline = doc.querySelector('.obsidian-reader-outline');
			if (outline) {
				outline.remove();
			}
			this.isActive = false;
		}
	}

	static async toggle(doc: Document): Promise<boolean> {
		if (this.isActive) {
			this.restore(doc);
			return false;
		} else {
			await this.apply(doc);
			return true;
		}
	}
}
