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
	themeMode: 'auto' | 'light' | 'dark';
}

export class Reader {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;
	private static settingsBar: HTMLElement | null = null;
	private static iframe: HTMLIFrameElement | null = null;
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
				top: 20px;
				right: 20px;
				background: var(--obsidian-reader-background-primary);
				padding: 4px;
				z-index: 999999999;
				font-family: var(--obsidian-reader-font-family);
				user-select: none;
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
				width: 200px;
				max-height: 100vh;
				padding: max(2rem, 3vh) 20px 20px 20px;
				overflow-y: auto;
				font-size: 14px;
				z-index: 999999998;
				user-select: none;
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
				const iframeWindow = doc.defaultView;
				if (iframeWindow) {
					const scrollTop = iframeWindow.pageYOffset || doc.documentElement.scrollTop;
					const targetY = scrollTop + rect.top - iframeWindow.innerHeight * 0.05;
					iframeWindow.scrollTo({
						top: targetY,
						behavior: 'smooth'
					});
				}
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
		
		// Create a sandboxed iframe
		this.iframe = document.createElement('iframe');
		this.iframe.style.cssText = `
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			border: none;
			background: var(--obsidian-reader-background-primary);
			z-index: 999999999;
		`;
		this.iframe.setAttribute('sandbox', 'allow-same-origin allow-popups');
		document.body.appendChild(this.iframe);

		// Get the iframe's document
		const iframeDoc = this.iframe.contentDocument;
		if (!iframeDoc) {
			console.error('Failed to get iframe document');
			return;
		}

		// Clean the html element but preserve lang and dir attributes
		const htmlElement = iframeDoc.documentElement;
		const lang = doc.documentElement.getAttribute('lang');
		const dir = doc.documentElement.getAttribute('dir');
		
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

		// Set up the iframe document
		iframeDoc.head.innerHTML = `
			<meta charset="UTF-8">
			<meta name="viewport" content="${VIEWPORT}">
			<style>
				/* Import our CSS directly */
				${this.getReaderStyles()}
			</style>
		`;

		iframeDoc.body.innerHTML = `
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
		`;

		iframeDoc.documentElement.className = 'obsidian-reader-active';
		if (extractorType) {
			iframeDoc.documentElement.setAttribute('data-reader-extractor', extractorType);
		}
		iframeDoc.documentElement.setAttribute('data-reader-theme', this.settings.theme);
		
		// Apply theme mode
		this.updateThemeMode(iframeDoc, this.settings.themeMode);

		// Initialize settings from local storage
		iframeDoc.documentElement.style.setProperty('--obsidian-reader-font-size', `${this.settings.fontSize}px`);
		iframeDoc.documentElement.style.setProperty('--obsidian-reader-line-height', this.settings.lineHeight.toString());
		iframeDoc.documentElement.style.setProperty('--obsidian-reader-line-width', `${this.settings.maxWidth}em`);

		// Add settings bar and outline
		this.injectSettingsBar(iframeDoc);
		this.observer = this.generateOutline(iframeDoc);
		
		this.isActive = true;
	}

	static restore(doc: Document) {
		// Disconnect the observer if it exists
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}

		// Remove the iframe
		if (this.iframe) {
			this.iframe.remove();
			this.iframe = null;
		}
		
		this.settingsBar = null;
		this.isActive = false;
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

	private static getReaderStyles(): string {
		// This contains all the CSS needed for reader mode
		return `
			html.obsidian-reader-active {
				font-size: 62.5%;
			}

			.obsidian-reader-active {
				--obsidian-reader-background-primary: #fff;
				--obsidian-reader-background-primary-alt: #fcfcfc;
				--obsidian-reader-text-primary: #222222;
				--obsidian-reader-text-muted: #5c5c5c;
				--obsidian-reader-text-faint: #ababab;
				--obsidian-reader-text-accent: #222222;
				--obsidian-reader-text-accent-hover: #8a5cf5;
				--obsidian-reader-border: #e0e0e0;
				--obsidian-reader-text-selection: #E8DFFD;

				&.theme-dark {
					--obsidian-reader-background-primary: #1e1e1e;
					--obsidian-reader-background-primary-alt: #212121;
					--obsidian-reader-text-primary: #dadada;
					--obsidian-reader-text-muted: #b3b3b3;
					--obsidian-reader-text-faint: #666666;
					--obsidian-reader-text-accent: #dadada;
					--obsidian-reader-text-accent-hover: #a68af9;
					--obsidian-reader-border: #363636;
					--obsidian-reader-text-selection: #3A2D53;
				}
			}

			.obsidian-reader-active[data-reader-theme="flexoki"] {
				--obsidian-reader-background-primary: #FFFCF0;
				--obsidian-reader-background-primary-alt: #F2F0E5;
				--obsidian-reader-text-primary: #100F0F;
				--obsidian-reader-text-muted: #5c5c5c;
				--obsidian-reader-text-faint: #B7B5AC;
				--obsidian-reader-text-accent: #100F0F;
				--obsidian-reader-text-accent-hover: #24837B;
				--obsidian-reader-border: #E6E4D9;
				--obsidian-reader-text-selection: #DDF1E4;

				&.theme-dark {
					--obsidian-reader-background-primary: #100F0F;
					--obsidian-reader-background-primary-alt: #1C1B1A;
					--obsidian-reader-text-primary: #CECDC3;
					--obsidian-reader-text-muted: #878580;
					--obsidian-reader-text-faint: #575653;
					--obsidian-reader-text-accent: #CECDC3;
					--obsidian-reader-text-accent-hover: #3AA99F;
					--obsidian-reader-border: #282726;
					--obsidian-reader-text-selection: #101F1D;
				}
			}

			.obsidian-reader-active {
				&.theme-light {
					img, svg {
						mix-blend-mode: multiply;
					}
				}
				&.theme-dark {
					.mw-invert {
						filter: invert(1);
					}
					.invert-images {
						img, svg {
							filter: invert(1) hue-rotate(180deg);
							mix-blend-mode: screen;
						}
					}
				}
			}

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

			.obsidian-reader-outline {
				position: fixed;
				left: 0;
				top: 0;
				width: 200px;
				max-height: 100vh;
				padding: max(2rem, 3vh) 20px 20px 20px;
				overflow-y: auto;
				font-size: 14px;
				z-index: 999999998;
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

			.obsidian-reader-active body {
				--obsidian-reader-font-family: system-ui, -apple-system, sans-serif;
				--obsidian-reader-dynamic-font-size: calc(var(--obsidian-reader-font-size) + 0.25vw);

				background: var(--obsidian-reader-background-primary) !important;	
				color: var(--obsidian-reader-text-primary) !important;
				font-size: var(--obsidian-reader-dynamic-font-size) !important;
				width: var(--obsidian-reader-line-width) !important;
				margin: max(4rem, 6vh) auto 40vh !important;
				max-width: 90% !important;
				line-height: var(--obsidian-reader-line-height) !important;
				font-family: var(--obsidian-reader-font-family) !important;
				-webkit-font-smoothing: antialiased !important;

				::selection {
					background-color: var(--obsidian-reader-text-selection);
				}

				article {
					overflow: hidden;
				}

				h1 { 
					font-weight: 700;
					font-size: 1.6em;
					letter-spacing: -0.02em;
					line-height: calc(var(--obsidian-reader-line-height) * 0.75);
					margin: 0 0 0.5em 0;
				}

				h2 {
					font-weight: 700;
					font-size: 1.3em;
					letter-spacing: -0.015em;
					margin-top: 1.8em;
					margin-bottom: 0.5em;
					line-height: calc(var(--obsidian-reader-line-height) * 0.85);
				}

				h3 { 
					font-weight: 700;
					font-size: 1.225em;
					line-height: calc(var(--obsidian-reader-line-height) * 0.85);
					margin-top: 2em;
					margin-bottom: 0.5em;
				}

				h4 { 
					font-size: 1.15em;
					font-weight: 700;
					line-height: calc(var(--obsidian-reader-line-height) * 0.85);
					margin-top: 2em;
					margin-bottom: 0;
				}

				h5 {
					font-weight: 600;
					line-height: calc(var(--obsidian-reader-line-height) * 0.85);
					text-transform: uppercase;
					margin-bottom: 1em;
					letter-spacing: 0.05em;
					font-size: 1em;
				}

				h1 + h2,
				h2 + h2,
				h2 + h3,
				h3 + h4 {
					margin-top: 0;
				}

				.metadata {
					margin-bottom: max(2rem, 3vh);
				}

				.metadata-details {
					color: var(--obsidian-reader-text-muted);
					font-size: 0.9em;

					a {
						color: inherit;
						text-decoration: none;
					}

					a:hover {
						text-decoration: underline;
					}
				}

				img, video, figure, svg {
					max-width: 100%;
					height: auto;
					border-radius: 4px;
					vertical-align: bottom;
				}

				iframe {
					max-width: 100%;
					width: 100%;
					&[src*="youtube.com"] {
						aspect-ratio: 16 / 9;
						height: auto;
					}
				}

				figure {
					margin-inline-start: 0;
					margin-inline-end: 0;
					overflow-x: auto;
				}

				a {
					color: var(--obsidian-reader-text-accent);
					&:hover {
						color: var(--obsidian-reader-text-accent-hover);
					}
				}

				blockquote {
					padding-left: 1.5em;
					margin: 1.5em 0;
					border-left: 2px solid var(--obsidian-reader-text-primary);
				}

				small[class*="caption"],
				figcaption,
				caption {
					color: var(--obsidian-reader-text-muted);
					font-size: 85%;
					margin-top: 1em;
					margin-bottom: 1em;
					line-height: calc(var(--obsidian-reader-line-height) * 0.9);
				}

				sup {
					a {
						text-decoration: none;
						color: var(--obsidian-reader-text-muted);
					}
				}

				hr {
					background-color: var(--obsidian-reader-border);
					width: 100%;
					border: 0;
					height: 1px;
					margin: 1.5em 0;
				}

				pre, code, kbd, tt {
					background-color: var(--obsidian-reader-background-primary-alt);
					border-radius: 6px;
					border: 1px solid var(--obsidian-reader-border);
					font-size: 0.8em;
				}

				code, kbd, tt {
					padding: 0.1em 0.25em;
				}

				pre {
					white-space: pre;
					max-width: 100%;
					overflow-x: auto;
					padding: 12px 16px;

					pre,
					code {
						font-size: inherit;
						border: none;
						background-color: transparent;
						padding: 0 !important;
					}
				}

				table {
					overflow-x: auto;
					font-size: 0.9em;
					line-height: calc(var(--obsidian-reader-line-height) * 0.9);
					border-collapse: collapse !important;

					tr {
						td, th {
							padding: 0.25em 0.5em !important;
							border: 1px solid var(--obsidian-reader-border) !important;
						}
					}
				}
			}
		`;
	}
}
