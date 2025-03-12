import { Defuddle } from 'defuddle';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import { ExtractorRegistry } from './extractor-registry';
import hljs from 'highlight.js';

// Mobile viewport settings
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
	theme: string;
	themeMode: 'auto' | 'light' | 'dark';
}

export class Reader {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;
	private static settingsBar: HTMLElement | null = null;
	private static colorSchemeMediaQuery: MediaQueryList | null = null;
	private static settings: ReaderSettings = {
		fontSize: 16,
		lineHeight: 1.6,
		maxWidth: 38,
		theme: 'default',
		themeMode: 'auto'
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

				<select class="obsidian-reader-settings-select" data-action="change-theme-mode">
					<option value="auto">Automatic</option>
					<option value="light">Light</option>
					<option value="dark">Dark</option>
				</select>
			</div>
		`;

		const style = doc.createElement('style');
		style.textContent = `
			.obsidian-reader-settings {
				position: fixed;
				top: 0;
				right: 0;
				background: var(--obsidian-reader-background-primary);
				padding: 20px;
				opacity: 0;
				z-index: 999999999;
				font-family: var(--obsidian-reader-font-family);
			}
			.obsidian-reader-settings:hover {
				opacity: 1;
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
			.obsidian-reader-container {
				display: grid;
				grid-template-columns: 1fr auto 1fr;
				gap: 20px;
				width: 100%;
				margin: 0 auto;
			}
			.obsidian-reader-outline {
				box-sizing: border-box;
				background: var(--obsidian-reader-background-primary);
				position: sticky;
				top: 0;
				height: 100vh;
				padding: max(4rem, 4vh) 20px 20px 20px;
				overflow-y: auto;
				font-size: 14px;
			}
			.obsidian-reader-outline-item {
				color: var(--obsidian-reader-text-muted);
				cursor: pointer;
				padding: 6px 8px;
				border-radius: 4px;
				line-height: 1.15;
			}
			.obsidian-reader-outline-item:hover {
				color: var(--obsidian-reader-text-primary);
				background-color: var(--obsidian-reader-background-primary-alt);
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
				background-color: var(--obsidian-reader-background-primary-alt);
			}
			.obsidian-reader-outline-item.faint {
				color: var(--obsidian-reader-text-faint);
			}
			.obsidian-reader-outline-item.faint:hover {
				color: var(--obsidian-reader-text-muted);
			}
			@media (max-width: 768px) {
				.obsidian-reader-container {
					grid-template-columns: 1fr;
				}
				.obsidian-reader-active body .obsidian-reader-content {
					max-width: 90%;
					width: 100%;
					margin: 0 auto;
				}
				.obsidian-left-sidebar,
				.obsidian-right-sidebar {
					display: none;
				}
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

		// Add theme mode select event listener
		const themeModeSelect = settingsBar.querySelector('[data-action="change-theme-mode"]') as HTMLSelectElement;
		if (themeModeSelect) {
			themeModeSelect.value = this.settings.themeMode;
			themeModeSelect.addEventListener('change', () => {
				this.updateThemeMode(doc, themeModeSelect.value as 'auto' | 'light' | 'dark');
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

	private static updateThemeMode(doc: Document, mode: 'auto' | 'light' | 'dark'): void {
		const html = doc.documentElement;
		html.classList.remove('theme-light', 'theme-dark');

		if (mode === 'auto') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			html.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
		} else {
			html.classList.add(`theme-${mode}`);
		}

		this.settings.themeMode = mode;
		this.saveSettings();
	}

	private static handleColorSchemeChange(e: MediaQueryListEvent, doc: Document): void {
		if (this.settings.themeMode === 'auto') {
			doc.documentElement.classList.remove('theme-light', 'theme-dark');
			doc.documentElement.classList.add(e.matches ? 'theme-dark' : 'theme-light');
		}
	}

	private static extractContent(doc: Document): { 
		content: string; 
		title?: string; 
		author?: string; 
		published?: string; 
		domain?: string;
		extractorType?: string;
	} {
		const defuddled = new Defuddle(doc, {debug: true}).parse();
		const schemaOrgData = defuddled.schemaOrgData;

		// Try to use a specific extractor first
		const extractor = ExtractorRegistry.findExtractor(doc, doc.URL, schemaOrgData);
		if (extractor && extractor.canExtract()) {
			console.log('Reader', 'Using custom extractor:', extractor.constructor.name);
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

		// Get the existing outline container
		const outline = doc.querySelector('.obsidian-reader-outline') as HTMLElement;
		if (!outline) return null;

		// Find all headings h2-h6
		const headings = article.querySelectorAll('h2, h3, h4, h5, h6');

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

		return observer;
	}

	private static observer: IntersectionObserver | null = null;
	private static activePopover: HTMLElement | null = null;
	private static activeFootnoteLink: HTMLAnchorElement | null = null;

	private static initializeFootnotes(doc: Document) {
		// Create popover container
		const popover = doc.createElement('div');
		popover.className = 'footnote-popover';
		doc.body.appendChild(popover);

		// Handle footnote clicks
		doc.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const footnoteLink = target.closest('a[href^="#fn:"]') as HTMLAnchorElement;
			
			// Close active popover if clicking outside
			if (!footnoteLink && !target.closest('.footnote-popover')) {
				this.hideFootnotePopover();
				return;
			}

			if (footnoteLink) {
				e.preventDefault();
				
				// Toggle if clicking the same footnote
				if (this.activeFootnoteLink === footnoteLink) {
					this.hideFootnotePopover();
					return;
				}

				const href = footnoteLink.getAttribute('href');
				if (!href) return;
				
				const footnoteId = href.substring(1);
				const footnote = doc.getElementById(footnoteId);
				
				if (footnote) {
					// Remove the return link from the content
					const content = footnote.cloneNode(true) as HTMLElement;
					const returnLink = content.querySelector('a[title="return to article"]');
					returnLink?.remove();

					// Show popover
					popover.innerHTML = content.innerHTML;
					this.showFootnotePopover(popover, footnoteLink);

					// Update active states
					if (this.activeFootnoteLink) {
						this.activeFootnoteLink.classList.remove('active');
					}
					footnoteLink.classList.add('active');
					this.activeFootnoteLink = footnoteLink;
				}
			}
		});

		// Handle scroll and resize events
		const updatePopoverPosition = () => {
			if (this.activeFootnoteLink && this.activePopover) {
				this.positionPopover(this.activePopover, this.activeFootnoteLink);
			}
		};

		doc.addEventListener('scroll', updatePopoverPosition, { passive: true });
		window.addEventListener('resize', updatePopoverPosition);
	}

	private static showFootnotePopover(popover: HTMLElement, link: HTMLAnchorElement) {
		this.activePopover = popover;
		this.positionPopover(popover, link);
		popover.classList.add('active');
	}

	private static hideFootnotePopover() {
		if (this.activePopover) {
			this.activePopover.classList.remove('active');
		}
		if (this.activeFootnoteLink) {
			this.activeFootnoteLink.classList.remove('active');
		}
		this.activePopover = null;
		this.activeFootnoteLink = null;
	}

	private static positionPopover(popover: HTMLElement, link: HTMLAnchorElement) {
		const ARROW_HEIGHT = 16; // Height of the arrow
		const VIEWPORT_PADDING = 20; // Minimum distance from viewport edges
		const VERTICAL_SPACING = 8; // Space between popover and link

		const linkRect = link.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Reset position to get actual dimensions
		popover.style.top = '0';
		popover.style.left = '0';
		const popoverRect = popover.getBoundingClientRect();

		// Determine if popover should appear above or below
		const spaceBelow = viewportHeight - linkRect.bottom - ARROW_HEIGHT - VIEWPORT_PADDING;
		const spaceAbove = linkRect.top - ARROW_HEIGHT - VIEWPORT_PADDING;
		const showBelow = spaceBelow >= popoverRect.height || spaceBelow >= spaceAbove;

		// Calculate vertical position
		let top = showBelow
			? linkRect.bottom + ARROW_HEIGHT + VERTICAL_SPACING
			: linkRect.top - popoverRect.height - ARROW_HEIGHT - VERTICAL_SPACING;

		// Calculate horizontal position (centered with link)
		let left = linkRect.left + (linkRect.width / 2) - (popoverRect.width / 2);

		// Adjust horizontal position if it would overflow
		if (left < VIEWPORT_PADDING) {
			left = VIEWPORT_PADDING;
		} else if (left + popoverRect.width > viewportWidth - VIEWPORT_PADDING) {
			left = viewportWidth - popoverRect.width - VIEWPORT_PADDING;
		}

		// Position the arrow relative to the link
		const arrowOffset = Math.max(0, Math.min(
			linkRect.left + (linkRect.width / 2) - left,
			popoverRect.width
		));

		// Update arrow position with CSS custom property
		popover.style.setProperty('--arrow-offset', `${arrowOffset}px`);

		// Set position and data attribute for arrow direction
		popover.style.top = `${top}px`;
		popover.style.left = `${left}px`;
		popover.setAttribute('data-position', showBelow ? 'bottom' : 'top');

		// If popover would be outside viewport vertically, adjust its height
		const currentTop = parseFloat(popover.style.top);
		if (currentTop < VIEWPORT_PADDING) {
			const maxHeight = viewportHeight - (VIEWPORT_PADDING * 2);
			popover.style.top = `${VIEWPORT_PADDING}px`;
			popover.style.maxHeight = `${maxHeight}px`;
			popover.style.overflowY = 'auto';
		} else {
			const bottomOverflow = currentTop + popoverRect.height - (viewportHeight - VIEWPORT_PADDING);
			if (bottomOverflow > 0) {
				popover.style.maxHeight = `${popoverRect.height - bottomOverflow}px`;
				popover.style.overflowY = 'auto';
			}
		}
	}

	private static cleanupScripts(doc: Document) {
		try {
			// Only attempt to clear timeouts if we have access to these methods
			if (typeof window !== 'undefined' && window.clearTimeout && window.clearInterval) {
				const nativeClearTimeout = window.clearTimeout.bind(window);
				const nativeClearInterval = window.clearInterval.bind(window);
				
				// Clear all timeouts and intervals
				let id = window.setTimeout(() => {}, 0);
				while (id--) {
					try {
						nativeClearTimeout(id);
						nativeClearInterval(id);
					} catch (e) {
						// Ignore errors from clearing individual timeouts
						console.log('Reader', 'Error clearing timeout/interval:', e);
					}
				}
			}

			// Remove all script elements except JSON-LD
			const scripts = doc.querySelectorAll('script:not([type="application/ld+json"])');
			scripts.forEach(el => el.remove());

			// Replace body with a clone to remove all event listeners
			const newBody = doc.body.cloneNode(true);
			doc.body.parentNode?.replaceChild(newBody, doc.body);

			// Block common ad/tracking domains
			const meta = doc.createElement('meta');
			meta.httpEquiv = 'Content-Security-Policy';
			meta.content = "script-src 'none'; frame-src 'none'; object-src 'none';";
			doc.head.appendChild(meta);
		} catch (e) {
			console.log('Reader', 'Error during script cleanup:', e);
			// Continue with reader mode even if script cleanup fails
		}
	}

	private static initializeCodeHighlighting(doc: Document) {
		// Find all pre > code blocks
		const codeBlocks = doc.querySelectorAll('pre > code');
		codeBlocks.forEach(block => {
			// Try to detect the language from class
			const classes = block.className.split(' ');
			const languageClass = classes.find(c => c.startsWith('language-'));
			const language = languageClass ? languageClass.replace('language-', '') : '';

			if (language) {
				try {
					hljs.highlightElement(block as HTMLElement);
				} catch (e) {
					console.log('Reader', 'Error highlighting code block:', e);
				}
			} else {
				// If no language specified, try autodetection
				try {
					hljs.highlightElement(block as HTMLElement);
				} catch (e) {
					console.log('Reader', 'Error highlighting code block:', e);
				}
			}
		});

		// Also highlight inline code with specified language
		const inlineCode = doc.querySelectorAll('code:not(pre > code)');
		inlineCode.forEach(code => {
			const classes = code.className.split(' ');
			const languageClass = classes.find(c => c.startsWith('language-'));
			if (languageClass) {
				try {
					hljs.highlightElement(code as HTMLElement);
				} catch (e) {
					console.log('Reader', 'Error highlighting inline code:', e);
				}
			}
		});
	}

	static async apply(doc: Document) {
		// Load saved settings first
		await this.loadSettings();

		// Store original HTML for restoration
		this.originalHTML = doc.documentElement.outerHTML;
		
		// Remove page scripts and their effects
		this.cleanupScripts(doc);
		
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
			console.log('Reader', 'Failed to extract content');
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
				console.log('Reader', 'Error formatting date:', e);
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
			<div class="obsidian-reader-container">
				<div class="obsidian-left-sidebar">
					<div class="obsidian-reader-outline"></div>
				</div>
				<div class="obsidian-reader-content">
					<article>
					${title ? `<h1>${title}</h1>` : ''}
						<div class="metadata">
							<div class="metadata-details">
								${[
									author ? `${author}` : '',
									formattedDate || '',
									domain ? `<a href="${doc.URL}">${domain}</a>` : ''
								].filter(Boolean).map(item => `<span>${item}</span>`).join('<span> · </span>')}
							</div>
						</div>
						${content}
					</article>
				</div>
				<div class="obsidian-reader-right-sidebar"></div>
			</div>
		`;

		doc.documentElement.className = 'obsidian-reader-active';
		if (extractorType) {
			doc.documentElement.setAttribute('data-reader-extractor', extractorType);
		}
		doc.documentElement.setAttribute('data-reader-theme', this.settings.theme);
		
		// Apply theme mode
		this.updateThemeMode(doc, this.settings.themeMode);

		// Initialize settings from local storage
		doc.documentElement.style.setProperty('--obsidian-reader-font-size', `${this.settings.fontSize}px`);
		doc.documentElement.style.setProperty('--obsidian-reader-line-height', this.settings.lineHeight.toString());
		doc.documentElement.style.setProperty('--obsidian-reader-line-width', `${this.settings.maxWidth}em`);

		// Add settings bar and outline
		this.injectSettingsBar(doc);
		this.observer = this.generateOutline(doc);
		
		this.initializeFootnotes(doc);
		this.initializeCodeHighlighting(doc);

		// Set up color scheme media query listener
		this.colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		this.colorSchemeMediaQuery.addEventListener('change', (e) => this.handleColorSchemeChange(e, doc));
		
		this.isActive = true;
	}

	static restore(doc: Document) {
		if (this.originalHTML) {			
			// Disconnect the observer if it exists
			if (this.observer) {
				this.observer.disconnect();
				this.observer = null;
			}

			// Remove color scheme media query listener
			if (this.colorSchemeMediaQuery) {
				this.colorSchemeMediaQuery.removeEventListener('change', (e) => this.handleColorSchemeChange(e, doc));
				this.colorSchemeMediaQuery = null;
			}

			// Hide any active footnote popover
			this.hideFootnotePopover();

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
