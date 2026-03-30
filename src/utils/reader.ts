import Defuddle from 'defuddle/full';
import browser from './browser-polyfill';
import { detectBrowser } from './browser-detection';
import { flattenShadowDom as flattenShadowDomUtil } from './flatten-shadow-dom';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import hljs from 'highlight.js';
import { getDomain } from './string-utils';
import { applyHighlights } from './highlighter';
import { copyToClipboard } from './clipboard-utils';
import { getMessage } from './i18n';

// Mobile viewport settings
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
	lightTheme: string;
	darkTheme: string;
	appearance: 'auto' | 'light' | 'dark';
	fontFamily: 'system' | 'custom';
	customFont: string;
	blendImages: boolean;
	colorLinks: boolean;
	customCss: string;
}

export class Reader {
	private static originalHTML: string | null = null;
	private static isActive: boolean = false;

	/**
	 * Helper function to create SVG elements
	 */
	private static createSVG(config: {
		width?: string;
		height?: string;
		viewBox?: string;
		className?: string;
		paths?: string[];
		rects?: Array<{x: string, y: string, width: string, height: string, rx?: string, ry?: string}>;
	}): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		
		if (config.width) svg.setAttribute('width', config.width);
		if (config.height) svg.setAttribute('height', config.height);
		if (config.viewBox) svg.setAttribute('viewBox', config.viewBox);
		if (config.className) svg.setAttribute('class', config.className);
		
		// Default attributes for all SVGs
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '1.5');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');
		
		// Add paths
		if (config.paths) {
			config.paths.forEach(pathData => {
				const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
				path.setAttribute('d', pathData);
				svg.appendChild(path);
			});
		}
		
		// Add rects
		if (config.rects) {
			config.rects.forEach(rectData => {
				const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
				rect.setAttribute('x', rectData.x);
				rect.setAttribute('y', rectData.y);
				rect.setAttribute('width', rectData.width);
				rect.setAttribute('height', rectData.height);
				if (rectData.rx) rect.setAttribute('rx', rectData.rx);
				if (rectData.ry) rect.setAttribute('ry', rectData.ry);
				svg.appendChild(rect);
			});
		}
		
		return svg;
	}
	private static settingsBar: HTMLElement | null = null;
	private static colorSchemeMediaQuery: MediaQueryList | null = null;
	private static readerStyles: HTMLLinkElement | null = null;
	private static lightbox: HTMLElement | null = null;
	private static currentImageIndex: number = -1;
	private static images: HTMLImageElement[] = [];
	private static settings: ReaderSettings = {
		fontSize: 16,
		lineHeight: 1.6,
		maxWidth: 38,
		lightTheme: 'default',
		darkTheme: 'same',
		appearance: 'auto',
		fontFamily: 'system',
		customFont: '',
		blendImages: true,
		colorLinks: false,
		customCss: ''
	};

	private static async loadSettings(): Promise<void> {
		const savedSettings = await browser.storage.sync.get('reader_settings')
			.then((data: Record<string, any>) => data['reader_settings']);
		if (savedSettings) {
			this.settings = {
				...this.settings,
				...savedSettings
			};
		}
	}

	private static async saveSettings(): Promise<void> {
		await browser.storage.sync.set({ reader_settings: this.settings });
	}

	private static injectSettingsBar(doc: Document) {
		// Create settings bar
		const settingsBar = doc.createElement('div');
		settingsBar.className = 'obsidian-reader-settings';
		// Create settings controls container
		const controlsContainer = doc.createElement('div');
		controlsContainer.className = 'obsidian-reader-settings-controls';

		// Font size controls group
		const fontGroup = doc.createElement('div');
		fontGroup.className = 'obsidian-reader-settings-controls-group';

		const decreaseFontBtn = doc.createElement('button');
		decreaseFontBtn.className = 'obsidian-reader-settings-button';
		decreaseFontBtn.dataset.action = 'decrease-font';
		decreaseFontBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			className: 'lucide lucide-minus-icon lucide-minus',
			paths: ['M5 12h14']
		}));

		const increaseFontBtn = doc.createElement('button');
		increaseFontBtn.className = 'obsidian-reader-settings-button';
		increaseFontBtn.dataset.action = 'increase-font';
		increaseFontBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			className: 'lucide lucide-plus-icon lucide-plus',
			paths: ['M5 12h14', 'M12 5v14']
		}));

		fontGroup.appendChild(decreaseFontBtn);
		fontGroup.appendChild(increaseFontBtn);

		// Width controls group
		const widthGroup = doc.createElement('div');
		widthGroup.className = 'obsidian-reader-settings-controls-group';

		const decreaseWidthBtn = doc.createElement('button');
		decreaseWidthBtn.className = 'obsidian-reader-settings-button';
		decreaseWidthBtn.dataset.action = 'decrease-width';
		decreaseWidthBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			paths: ['M18 16L14 12L18 8', 'M1 12L10 12', 'M14 12H23', 'M6 16L10 12L6 8']
		}));

		const increaseWidthBtn = doc.createElement('button');
		increaseWidthBtn.className = 'obsidian-reader-settings-button';
		increaseWidthBtn.dataset.action = 'increase-width';
		increaseWidthBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			className: 'lucide lucide-move-horizontal-icon lucide-move-horizontal',
			paths: ['m18 8 4 4-4 4', 'M2 12h20', 'm6 8-4 4 4 4']
		}));

		widthGroup.appendChild(decreaseWidthBtn);
		widthGroup.appendChild(increaseWidthBtn);

		// Line height controls group
		const lineHeightGroup = doc.createElement('div');
		lineHeightGroup.className = 'obsidian-reader-settings-controls-group';

		const decreaseLineHeightBtn = doc.createElement('button');
		decreaseLineHeightBtn.className = 'obsidian-reader-settings-button';
		decreaseLineHeightBtn.dataset.action = 'decrease-line-height';
		decreaseLineHeightBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			paths: ['M4 10H20', 'M4 6H20', 'M4 18H20', 'M4 14H20']
		}));

		const increaseLineHeightBtn = doc.createElement('button');
		increaseLineHeightBtn.className = 'obsidian-reader-settings-button';
		increaseLineHeightBtn.dataset.action = 'increase-line-height';
		increaseLineHeightBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			className: 'lucide lucide-menu-icon lucide-menu',
			paths: ['M4 12h16', 'M4 6h16', 'M4 18h16'] // Simplified line elements as paths
		}));

		lineHeightGroup.appendChild(decreaseLineHeightBtn);
		lineHeightGroup.appendChild(increaseLineHeightBtn);

		// Theme select
		const themeSelect = doc.createElement('select');
		themeSelect.className = 'obsidian-reader-settings-select';
		themeSelect.dataset.action = 'change-theme';

		const defaultThemeOption = doc.createElement('option');
		defaultThemeOption.value = 'default';
		defaultThemeOption.textContent = getMessage('readerColorSchemeDefault');

		const flexokiThemeOption = doc.createElement('option');
		flexokiThemeOption.value = 'flexoki';
		flexokiThemeOption.textContent = getMessage('readerColorSchemeFlexoki');

		const ayuThemeOption = doc.createElement('option');
		ayuThemeOption.value = 'ayu';
		ayuThemeOption.textContent = getMessage('readerColorSchemeAyu');

		const catppuccinThemeOption = doc.createElement('option');
		catppuccinThemeOption.value = 'catppuccin';
		catppuccinThemeOption.textContent = getMessage('readerColorSchemeCatppuccin');

		const everforestThemeOption = doc.createElement('option');
		everforestThemeOption.value = 'everforest';
		everforestThemeOption.textContent = getMessage('readerColorSchemeEverforest');

		const gruvboxThemeOption = doc.createElement('option');
		gruvboxThemeOption.value = 'gruvbox';
		gruvboxThemeOption.textContent = getMessage('readerColorSchemeGruvbox');

		const nordThemeOption = doc.createElement('option');
		nordThemeOption.value = 'nord';
		nordThemeOption.textContent = getMessage('readerColorSchemeNord');

		const rosePineThemeOption = doc.createElement('option');
		rosePineThemeOption.value = 'rose-pine';
		rosePineThemeOption.textContent = getMessage('readerColorSchemeRosePine');

		const solarizedThemeOption = doc.createElement('option');
		solarizedThemeOption.value = 'solarized';
		solarizedThemeOption.textContent = getMessage('readerColorSchemeSolarized');

		themeSelect.appendChild(defaultThemeOption);
		themeSelect.appendChild(flexokiThemeOption);
		themeSelect.appendChild(ayuThemeOption);
		themeSelect.appendChild(catppuccinThemeOption);
		themeSelect.appendChild(everforestThemeOption);
		themeSelect.appendChild(gruvboxThemeOption);
		themeSelect.appendChild(nordThemeOption);
		themeSelect.appendChild(rosePineThemeOption);
		themeSelect.appendChild(solarizedThemeOption);

		// Theme mode select
		const themeModeSelect = doc.createElement('select');
		themeModeSelect.className = 'obsidian-reader-settings-select';
		themeModeSelect.dataset.action = 'change-theme-mode';

		const autoModeOption = doc.createElement('option');
		autoModeOption.value = 'auto';
		autoModeOption.textContent = getMessage('readerAppearanceAuto');

		const lightModeOption = doc.createElement('option');
		lightModeOption.value = 'light';
		lightModeOption.textContent = getMessage('readerAppearanceLight');

		const darkModeOption = doc.createElement('option');
		darkModeOption.value = 'dark';
		darkModeOption.textContent = getMessage('readerAppearanceDark');

		themeModeSelect.appendChild(autoModeOption);
		themeModeSelect.appendChild(lightModeOption);
		themeModeSelect.appendChild(darkModeOption);

		// Font family select
		const fontFamilySelect = doc.createElement('select');
		fontFamilySelect.className = 'obsidian-reader-settings-select';
		fontFamilySelect.dataset.action = 'change-font-family';

		const systemFontOption = doc.createElement('option');
		systemFontOption.value = 'system';
		systemFontOption.textContent = getMessage('readerFontSystem');

		const customFontOption = doc.createElement('option');
		customFontOption.value = 'custom';
		customFontOption.textContent = getMessage('readerFontCustom');

		fontFamilySelect.appendChild(systemFontOption);
		fontFamilySelect.appendChild(customFontOption);

		// Highlighter controls group
		const highlighterGroup = doc.createElement('div');
		highlighterGroup.className = 'obsidian-reader-settings-controls-group';

		const highlighterBtn = doc.createElement('button');
		highlighterBtn.className = 'obsidian-reader-settings-button';
		highlighterBtn.dataset.action = 'toggle-highlighter';
		highlighterBtn.appendChild(this.createSVG({
			width: '20', height: '20', viewBox: '0 0 24 24',
			className: 'lucide lucide-highlighter-icon lucide-highlighter',
			paths: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4']
		}));

		highlighterGroup.appendChild(highlighterBtn);

		// Assemble everything
		controlsContainer.appendChild(fontGroup);
		controlsContainer.appendChild(widthGroup);
		controlsContainer.appendChild(lineHeightGroup);
		controlsContainer.appendChild(themeSelect);
		controlsContainer.appendChild(themeModeSelect);
		controlsContainer.appendChild(fontFamilySelect);

		settingsBar.appendChild(controlsContainer);

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
		themeSelect.value = this.getEffectiveTheme();
		themeSelect.addEventListener('change', () => {
			this.updateTheme(doc, themeSelect.value);
		});

		// Add theme mode select event listener
		themeModeSelect.value = this.settings.appearance;
		themeModeSelect.addEventListener('change', () => {
			this.updateThemeMode(doc, themeModeSelect.value as 'auto' | 'light' | 'dark');
		});

		// Add font family select event listener
		fontFamilySelect.value = this.settings.fontFamily;
		fontFamilySelect.addEventListener('change', () => {
			this.updateFontFamily(doc, fontFamilySelect.value as 'system' | 'custom');
		});

		// Notify content script to listen for highlighter button
		document.dispatchEvent(new CustomEvent('obsidian-reader-init'));
		
	}

	private static updateFontSize(doc: Document, size: number) {
		size = Math.max(9, Math.min(24, size));
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
		height = Math.max(1.1, Math.min(2, Math.round(height * 10) / 10));
		doc.documentElement.style.setProperty('--obsidian-reader-line-height', height.toString());
		this.settings.lineHeight = height;
		this.saveSettings();
	}

	private static getEffectiveTheme(): string {
		const { lightTheme, darkTheme, appearance } = this.settings;
		const isDark = appearance === 'dark' || (appearance === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
		return isDark && darkTheme !== 'same' ? darkTheme : lightTheme;
	}

	private static applyTheme(doc: Document): void {
		const theme = this.getEffectiveTheme();
		if (theme === 'default') {
			doc.documentElement.removeAttribute('data-reader-theme');
		} else {
			doc.documentElement.setAttribute('data-reader-theme', theme);
		}
	}

	private static updateTheme(doc: Document, theme: string): void {
		const isDark = doc.documentElement.classList.contains('theme-dark');
		if (isDark) {
			this.settings.darkTheme = theme;
		} else {
			this.settings.lightTheme = theme;
		}
		this.applyTheme(doc);
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

		this.settings.appearance = mode;
		this.applyTheme(doc);
		this.saveSettings();
	}

	private static updateFontFamily(doc: Document, fontFamily: 'system' | 'custom'): void {
		this.settings.fontFamily = fontFamily;
		this.applyFontFamily(doc, fontFamily, this.settings.customFont);
		this.saveSettings();
	}

	private static applyFontFamily(doc: Document, fontFamily: 'system' | 'custom', customFont: string): void {
		if (fontFamily === 'custom' && customFont) {
			doc.body.style.setProperty('--obsidian-reader-font-family', customFont);
		} else {
			doc.body.style.removeProperty('--obsidian-reader-font-family');
		}
	}

	private static updateBlendImages(doc: Document, blend: boolean): void {
		this.settings.blendImages = blend;
		this.applyBlendImages(doc, blend);
		this.saveSettings();
	}

	private static applyBlendImages(doc: Document, blend: boolean): void {
		doc.documentElement.classList.toggle('no-blend-images', !blend);
	}

	private static applyColorLinks(doc: Document, colorLinks: boolean): void {
		doc.documentElement.classList.toggle('color-links', colorLinks);
	}

	private static handleColorSchemeChange(e: MediaQueryListEvent, doc: Document): void {
		if (this.settings.appearance === 'auto') {
			doc.documentElement.classList.remove('theme-light', 'theme-dark');
			doc.documentElement.classList.add(e.matches ? 'theme-dark' : 'theme-light');
			this.applyTheme(doc);
		}
	}


	private static async extractContent(doc: Document): Promise<{
		content: string;
		title?: string;
		author?: string;
		published?: string;
		domain?: string;
		wordCount?: number;
		parseTime?: number;
		extractorType?: string;
	}> {

		const defuddle = new Defuddle(doc, { url: doc.URL });
		const defuddled = await defuddle.parseAsync();

		return {
			content: defuddled.content,
			title: defuddled.title,
			author: defuddled.author,
			published: defuddled.published,
			domain: getDomain(doc.URL),
			wordCount: defuddled.wordCount,
			parseTime: defuddled.parseTime
		};
	}

	private static generateOutline(doc: Document) {
		const article = doc.querySelector('article');
		if (!article) return null;

		// Get the existing outline container
		const outline = doc.querySelector('.obsidian-reader-outline') as HTMLElement;
		if (!outline) return null;

		// Find all headings h2-h6, excluding those inside blockquotes
		const headings = Array.from(article.querySelectorAll('h2, h3, h4, h5, h6'))
			.filter(h => !h.closest('blockquote'));

		// Only show outline if there are 2 or more headings
		if (headings.length < 2) {
			outline.style.display = 'none';
			return null;
		} else {
			outline.style.display = ''; 
		}

		// Add unique IDs to headings if they don't have them
		headings.forEach((heading, index) => {
			if (!heading.id) {
				heading.id = `heading-${index}`;
			}
		});

		// Create outline items and store references
		const outlineItems = new Map();

		// Keep track of the last heading at each level and their depths
		const lastHeadingAtLevel: { [key: number]: { element: Element; depth: number } } = {};
		
		headings.forEach((heading) => {
			const level = parseInt(heading.tagName[1]);
			const currentRect = heading.getBoundingClientRect();
			
			// Calculate depth based on parent headings
			let depth = 0;
			let parentFound = false;
			
			// Look through all higher levels to find the most recent parent
			for (let i = level - 1; i >= 2; i--) {
				const lastHeading = lastHeadingAtLevel[i];
				if (lastHeading) {
					const lastRect = lastHeading.element.getBoundingClientRect();
					if (lastRect.top < currentRect.top) {
						depth = lastHeading.depth + 1;
						parentFound = true;
						break;
					}
				}
			}

			// If no parent found but we have a previous sibling at same level, use its depth
			if (!parentFound && lastHeadingAtLevel[level]) {
				const lastRect = lastHeadingAtLevel[level].element.getBoundingClientRect();
				if (lastRect.top < currentRect.top) {
					depth = lastHeadingAtLevel[level].depth;
				}
			}

			const item = doc.createElement('div');
			item.className = `obsidian-reader-outline-item obsidian-reader-outline-${heading.tagName.toLowerCase()}`;
			item.setAttribute('data-depth', depth.toString());
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
			
			// Update tracking variables
			lastHeadingAtLevel[level] = { element: heading, depth };
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

		// Add footnotes link if there are footnotes
		const footnotes = article.querySelector('#footnotes');
		if (footnotes) {
			const item = doc.createElement('div');
			item.className = 'obsidian-reader-outline-item';
			item.setAttribute('data-depth', '0');
			item.textContent = 'Footnotes';
			
			item.addEventListener('click', () => {
				const rect = footnotes.getBoundingClientRect();
				const scrollTop = window.pageYOffset || doc.documentElement.scrollTop;
				const targetY = scrollTop + rect.top - window.innerHeight * 0.05;
				window.scrollTo({
					top: targetY,
					behavior: 'smooth'
				});
			});

			outline.appendChild(item);
			outlineItems.set(footnotes, item);
			observer.observe(footnotes);
		}

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

		// Ensure each footnote item has a backref link
		const footnoteItems = doc.querySelectorAll('#footnotes ol > li[id^="fn:"]');
		footnoteItems.forEach((li) => {
			const existingBackref = li.querySelector('a.footnote-backref');
			if (existingBackref) return;

			const fnNumber = li.id.replace('fn:', '');
			const refTarget = doc.getElementById(`fnref:${fnNumber}`);
			if (!refTarget) return;

			const lastParagraph = li.querySelector('p:last-of-type') || li;
			const backlink = doc.createElement('a');
			backlink.href = `#fnref:${fnNumber}`;
			backlink.title = 'return to article';
			backlink.className = 'footnote-backref';
			backlink.textContent = '\u21A9';
			lastParagraph.appendChild(backlink);
		});

		// Handle footnote clicks
		doc.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;

			// Handle backref clicks — scroll to the inline reference
			const backrefLink = target.closest('a.footnote-backref') as HTMLAnchorElement;
			if (backrefLink) {
				e.preventDefault();
				const href = backrefLink.getAttribute('href');
				if (!href) return;
				const hashIndex = href.indexOf('#');
				if (hashIndex === -1) return;
				const refId = href.substring(hashIndex + 1);
				const refElement = doc.getElementById(refId);
				if (refElement) {
					refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
				}
				return;
			}

			const footnoteLink = target.closest('a[href*="#fn:"]') as HTMLAnchorElement;

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

				const hashIndex = href.indexOf('#');
				if (hashIndex === -1) return;
				const footnoteId = href.substring(hashIndex + 1);
				const footnote = doc.getElementById(footnoteId);

				if (footnote) {
					// Remove the return link from the content
					const content = footnote.cloneNode(true) as HTMLElement;
					const returnLink = content.querySelector('a[title="return to article"]');
					returnLink?.remove();

					// Show popover
					popover.textContent = '';
					const clonedContent = content.cloneNode(true) as HTMLElement;
					popover.appendChild(clonedContent);
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
			meta.content = "script-src 'none'; object-src 'none';";
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

	private static initializeCopyButtons(doc: Document) {
		// Find all pre > code blocks
		const codeBlocks = doc.querySelectorAll('pre > code');
		codeBlocks.forEach(block => {
			const pre = block.parentElement as HTMLElement;
			
			const button = doc.createElement('button');
			button.className = 'copy-button';
			
			// Create copy SVG
			const svg = this.createSVG({
				width: '16',
				height: '16',
				viewBox: '0 0 24 24',
				className: 'lucide lucide-copy-icon lucide-copy',
				paths: ['M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
				rects: [{x: '8', y: '8', width: '14', height: '14', rx: '2', ry: '2'}]
			});
			button.appendChild(svg);

			button.addEventListener('click', async () => {
				try {
					// Get the raw text content without HTML tags
					const text = block.textContent || '';
					const success = await copyToClipboard(text);
					
					if (success) {
						// Show success state
						button.classList.add('copied');
						button.textContent = '';
						
						// Create check icon
						const checkSvg = this.createSVG({
							width: '16',
							height: '16',
							viewBox: '0 0 24 24',
							className: 'lucide lucide-check-icon lucide-check',
							paths: ['M20 6 9 17l-5-5']
						});
						button.appendChild(checkSvg);
						
						// Reset after 2 seconds
						setTimeout(() => {
							button.classList.remove('copied');
							button.textContent = '';
							button.appendChild(svg); // Re-add original SVG
						}, 2000);
					} else {
						console.log('Reader', 'Error copying code: clipboard operation failed');
					}
				} catch (err) {
					console.log('Reader', 'Error copying code:', err);
				}
			});
			pre.appendChild(button);
		});
	}

	private static initializeLightbox(doc: Document) {
		// Create lightbox container
		this.lightbox = doc.createElement('div');
		this.lightbox.className = 'obsidian-reader-lightbox theme-dark';
		this.lightbox.setAttribute('role', 'dialog');
		this.lightbox.setAttribute('aria-modal', 'true');
		// Create lightbox
		const closeButton = doc.createElement('button');
		closeButton.className = 'lightbox-close';
		closeButton.setAttribute('aria-label', 'Close image viewer');
		
		// Create close button SVG
		const closeSvg = this.createSVG({
			width: '20',
			height: '20',
			viewBox: '0 0 24 24',
			paths: ['M18 6L6 18M6 6l12 12']
		});
		closeButton.appendChild(closeSvg);
		
		// Create content structure
		const lightboxContent = doc.createElement('div');
		lightboxContent.className = 'lightbox-content';
		
		const imageContainer = doc.createElement('div');
		imageContainer.className = 'lightbox-image-container';
		
		const captionContainer = doc.createElement('div');
		captionContainer.className = 'lightbox-caption';
		
		lightboxContent.appendChild(imageContainer);
		lightboxContent.appendChild(captionContainer);
		
		this.lightbox.appendChild(closeButton);
		this.lightbox.appendChild(lightboxContent);
		doc.body.appendChild(this.lightbox);

		// Get all images in the article
		const article = doc.querySelector('article');
		if (article) {
			// Get standalone images
			const standaloneImages = Array.from(article.querySelectorAll('img:not(a img):not(figure img)')) as HTMLImageElement[];
			
			// Get images in links that point to image files
			const linkedImages = Array.from(article.querySelectorAll('a:not(figure a) img')).filter(img => {
				const link = (img as HTMLImageElement).closest('a');
				if (!link) return false;
				const href = link.href.toLowerCase();
				return href.endsWith('.jpg') || href.endsWith('.jpeg') || 
					   href.endsWith('.png') || href.endsWith('.gif') || 
					   href.endsWith('.webp') || href.endsWith('.avif');
			}) as HTMLImageElement[];

			// Get figure images
			const figures = Array.from(article.querySelectorAll('figure'));
			const figureImages = figures.flatMap(figure => {
				const images = Array.from(figure.querySelectorAll('img')) as HTMLImageElement[];
				return images.map(img => {
					// Store figure reference on the image for caption lookup
					(img as any).figureElement = figure;
					return img;
				});
			});

			this.images = [...standaloneImages, ...linkedImages, ...figureImages];

			// Add click handlers
			this.images.forEach((img, index) => {
				const figure = (img as any).figureElement;
				const parentLink = img.closest('a');

				if (figure) {
					// For figures, wrap both the image and any links
					const wrapper = doc.createElement('div');
					wrapper.className = 'image-wrapper';
					
					// If image is in a link, handle that first
					if (parentLink) {
						parentLink.parentNode?.insertBefore(wrapper, parentLink);
						wrapper.appendChild(parentLink);
					} else {
						img.parentNode?.insertBefore(wrapper, img);
						wrapper.appendChild(img);
					}

					const expandButton = doc.createElement('button');
					expandButton.className = 'image-expand-button';
					expandButton.setAttribute('aria-label', 'View full size');
					
					// Create expand SVG
					const expandSvg = this.createSVG({
						width: '16',
						height: '16',
						viewBox: '0 0 24 24',
						paths: ['M15 3h6v6', 'M14 10l7-7', 'M9 21H3v-6', 'M10 14l-7 7']
					});
					expandButton.appendChild(expandSvg);
					wrapper.appendChild(expandButton);

					// Handle expand button click
					expandButton.addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						this.showLightbox(index);
					});
				} else if (parentLink) {
					// Handle linked images as before
					const wrapper = doc.createElement('div');
					wrapper.className = 'image-wrapper';
					parentLink.parentNode?.insertBefore(wrapper, parentLink);
					wrapper.appendChild(parentLink);

					const expandButton = doc.createElement('button');
					expandButton.className = 'image-expand-button';
					expandButton.setAttribute('aria-label', 'View full size');
					
					// Create expand SVG
					const expandSvg = this.createSVG({
						width: '16',
						height: '16',
						viewBox: '0 0 24 24',
						paths: ['M15 3h6v6', 'M14 10l7-7', 'M9 21H3v-6', 'M10 14l-7 7']
					});
					expandButton.appendChild(expandSvg);
					wrapper.appendChild(expandButton);

					expandButton.addEventListener('click', (e) => {
						e.preventDefault();
						e.stopPropagation();
						this.showLightbox(index);
					});
				} else {
					// For standalone images, just add the click handler
					img.addEventListener('click', (e) => {
						e.preventDefault();
						this.showLightbox(index);
					});
				}
			});
		}

		// Close button handler - use the closeButton we already created
		closeButton.addEventListener('click', () => this.closeLightbox());

		// Click outside to close
		this.lightbox.addEventListener('click', (e) => {
			if (e.target === this.lightbox) {
				this.closeLightbox();
			}
		});

		// Keyboard navigation
		doc.addEventListener('keydown', (e) => {
			if (!this.lightbox?.classList.contains('active')) return;

			switch (e.key) {
				case 'Escape':
					this.closeLightbox();
					break;
				case 'ArrowLeft':
					this.showPreviousImage();
					break;
				case 'ArrowRight':
					this.showNextImage();
					break;
			}
		});
	}

	private static showLightbox(index: number) {
		if (!this.lightbox || !this.images[index]) return;

		this.currentImageIndex = index;
		const container = this.lightbox.querySelector('.lightbox-image-container');
		const captionContainer = this.lightbox.querySelector('.lightbox-caption');
		
		if (container && captionContainer) {
			// Clear previous content
			container.textContent = '';
			captionContainer.textContent = '';
			
			// Clone the original image to preserve loaded state
			const img = this.images[index].cloneNode(true) as HTMLImageElement;
			container.appendChild(img);

			// Handle caption if image is part of a figure
			const figure = (this.images[index] as any).figureElement as HTMLElement;
			if (figure) {
				const figcaption = figure.querySelector('figcaption');
				if (figcaption) {
					const clonedCaption = figcaption.cloneNode(true) as HTMLElement;
					captionContainer.appendChild(clonedCaption);
				}
			}
		}
		
		this.lightbox.classList.add('active');
		document.body.style.overflow = 'hidden';
	}

	private static closeLightbox() {
		if (!this.lightbox) return;
		this.lightbox.classList.remove('active');
		document.body.style.overflow = '';
		this.currentImageIndex = -1;
	}

	private static showPreviousImage() {
		if (this.images.length <= 1) return;
		
		const newIndex = this.currentImageIndex > 0 
			? this.currentImageIndex - 1 
			: this.images.length - 1;
		
		this.showLightbox(newIndex);
	}

	private static showNextImage() {
		if (this.images.length <= 1) return;
		
		const newIndex = this.currentImageIndex < this.images.length - 1 
			? this.currentImageIndex + 1 
			: 0;
		
		this.showLightbox(newIndex);
	}

	static async apply(doc: Document) {
		try {
			// Store original HTML for restoration
			this.originalHTML = doc.documentElement.outerHTML;

			// Clipper iframe container
			const clipperIframeContainer = doc.getElementById('obsidian-clipper-container');

			// Load saved settings
			await this.loadSettings();

			// Capture YouTube video state before cleanup destroys the player
			let videoTimestamp = 0;
			let videoWasPlaying = false;
			const host = doc.URL ? new URL(doc.URL).hostname : '';
			const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
			if (isYouTube) {
				const videoElement = doc.querySelector('video');
				if (videoElement) {
					videoTimestamp = Math.floor(videoElement.currentTime);
					videoWasPlaying = !videoElement.paused;
				}
			}

			// Flatten shadow DOM content before cleanup removes scripts
			await flattenShadowDomUtil(doc);

			// Remove page scripts and their effects
			this.cleanupScripts(doc);

			// Clear body attributes
			while (doc.body.attributes.length > 0) {
				doc.body.removeAttribute(doc.body.attributes[0].name);
			}
			
			// Clean the html element but preserve lang and dir attributes
			const htmlElement = doc.documentElement;
			const lang = htmlElement.getAttribute('lang');
			const dir = htmlElement.getAttribute('dir');
			
			// Restore lang and dir if they existed
			if (lang) htmlElement.setAttribute('lang', lang);
			if (dir) htmlElement.setAttribute('dir', dir);
			
			// Clone document for Defuddle before we clear the body
			const docClone = doc.cloneNode(true) as Document;
			// Preserve the URL for Defuddle's extractors
			Object.defineProperty(docClone, 'URL', { value: doc.URL, configurable: true });
			// Start content extraction on the clone (don't await yet)
			const contentPromise = this.extractContent(docClone);

			// Clean up head - remove unwanted elements but keep meta tags and non-stylesheet links
			const head = doc.head;

			// Remove base tags
			const baseTags = head.querySelectorAll('base');
			baseTags.forEach(el => el.remove());

			// Remove stylesheet links and style tags, except reader styles
			const styleElements = head.querySelectorAll('link[rel="stylesheet"], link[as="style"], style');
			styleElements.forEach(el => {
				if (el.id !== 'obsidian-reader-styles') {
					el.remove();
				}
			});

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

			doc.body.textContent = '';

			// Create main container
			const readerContainer = doc.createElement('div');
			readerContainer.className = 'obsidian-reader-container';

			// Create left sidebar
			const leftSidebar = doc.createElement('div');
			leftSidebar.className = 'obsidian-left-sidebar';
			const outline = doc.createElement('div');
			outline.className = 'obsidian-reader-outline';
			leftSidebar.appendChild(outline);

			// Create content area
			const readerContent = doc.createElement('div');
			readerContent.className = 'obsidian-reader-content';

			// Create main element
			const main = doc.createElement('main');

			// Create article placeholder with loading spinner
			const article = doc.createElement('article');
			const spinner = doc.createElement('div');
			spinner.className = 'obsidian-reader-loading';
			const spinnerText = doc.createElement('div');
			spinnerText.className = 'obsidian-reader-loading-text';
			spinnerText.textContent = 'Defuddling\u2026';
			spinner.appendChild(spinnerText);
			article.appendChild(spinner);
			main.appendChild(article);

			readerContent.appendChild(main);

			// Create footer (hidden until content loads)
			const footer = doc.createElement('div');
			footer.className = 'obsidian-reader-footer';
			footer.style.display = 'none';
			readerContent.appendChild(footer);

			// Create right sidebar
			const rightSidebar = doc.createElement('div');
			rightSidebar.className = 'obsidian-reader-right-sidebar';

			// Assemble and display the shell immediately
			readerContainer.appendChild(leftSidebar);
			readerContainer.appendChild(readerContent);
			readerContainer.appendChild(rightSidebar);
			doc.body.appendChild(readerContainer);

			// Add reader classes and attributes
			doc.documentElement.classList.add('obsidian-reader-active');

			// Apply theme mode (sets theme-light/dark), then effective theme
			this.updateThemeMode(doc, this.settings.appearance);

			// Initialize settings from local storage
			doc.documentElement.style.setProperty('--obsidian-reader-font-size', `${this.settings.fontSize}px`);
			doc.documentElement.style.setProperty('--obsidian-reader-line-height', this.settings.lineHeight.toString());
			doc.documentElement.style.setProperty('--obsidian-reader-line-width', `${this.settings.maxWidth}em`);
			this.applyFontFamily(doc, this.settings.fontFamily, this.settings.customFont);
			this.applyBlendImages(doc, this.settings.blendImages);
			this.applyColorLinks(doc, this.settings.colorLinks);

			if (this.settings.customCss) {
				const styleEl = doc.createElement('style');
				styleEl.id = 'obsidian-reader-custom-css';
				styleEl.textContent = this.settings.customCss;
				doc.head.appendChild(styleEl);
			}

			// Add settings bar
			this.injectSettingsBar(doc);

			// Re-attach the clipper iframe container if it exists
			if (clipperIframeContainer) {
				doc.body.appendChild(clipperIframeContainer);
			}

			// Toggle dark mode with D key
			doc.addEventListener('keydown', (e) => {
				if (!this.isActive) return;
				if ((e.key !== 'd' && e.key !== 'D') || e.ctrlKey || e.metaKey) return;
				const tag = (document.activeElement as HTMLElement)?.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA') return;
				const newMode = doc.documentElement.classList.contains('theme-dark') ? 'light' : 'dark';
				this.updateThemeMode(doc, newMode);
			});

			// Set up color scheme media query listener
			this.colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			this.colorSchemeMediaQuery.addEventListener('change', (e) => this.handleColorSchemeChange(e, doc));

			this.isActive = true;

			// Now await content extraction and populate the page
			const { content, title, author, published, domain, extractorType, wordCount, parseTime } = await contentPromise;

			// If reader was toggled off while waiting, abort
			if (!this.isActive) return;

			// Remove loading spinner
			spinner.remove();

			if (!content) {
				console.log('Reader', 'Failed to extract content');
				article.textContent = 'Failed to extract content.';
				return;
			}

			// Add title
			if (title) {
				const h1 = doc.createElement('h1');
				h1.textContent = title;
				main.insertBefore(h1, article);
			}

			// Format and add metadata
			let formattedDate = '';
			if (published) {
				try {
					const date = new Date(published.split(',')[0].trim());
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

			const metadataItems = [
				author ? author : '',
				formattedDate || '',
				domain ? domain : ''
			].filter(Boolean);

			if (metadataItems.length > 0) {
				const metadata = doc.createElement('div');
				metadata.className = 'metadata';
				const metadataDetails = doc.createElement('div');
				metadataDetails.className = 'metadata-details';

				metadataItems.forEach((item, index) => {
					if (index > 0) {
						const separator = doc.createElement('span');
						separator.textContent = ' · ';
						metadataDetails.appendChild(separator);
					}

					const span = doc.createElement('span');
					if (item === domain && domain) {
						const link = doc.createElement('a');
						link.href = doc.URL;
						link.textContent = domain;
						span.appendChild(link);
					} else {
						span.textContent = item;
					}
					metadataDetails.appendChild(span);
				});

				metadata.appendChild(metadataDetails);
				main.insertBefore(metadata, article);
			}

			// Insert article content
			const parser = new DOMParser();
			const contentDoc = parser.parseFromString(content, 'text/html');
			const contentBody = contentDoc.body;

			// On YouTube, fix embed self-referrer blocking and resume playback state
			if (isYouTube) {
				const iframe = contentBody.querySelector('iframe[src*="youtube.com/embed/"]') as HTMLIFrameElement;
				if (iframe) {
					const embedUrl = new URL(iframe.src);
					const videoId = embedUrl.pathname.split('/').pop();
					const browserType = await detectBrowser();
					const isSafari = ['safari', 'mobile-safari', 'ipad-os'].includes(browserType);

					if (isSafari && videoId) {
						// Safari can't modify request headers, so YouTube blocks
						// self-referrer embeds. Show a clickable thumbnail instead.
						const watchUrl = 'https://www.youtube.com/watch?v=' + videoId
							+ (videoTimestamp > 0 ? '&t=' + videoTimestamp : '');
						const thumbnail = doc.createElement('a');
						thumbnail.href = watchUrl;
						thumbnail.target = '_blank';
						thumbnail.rel = 'noopener';
						thumbnail.style.cssText = 'display:block;position:relative;aspect-ratio:16/9;max-width:100%;background:#000;border-radius:8px;overflow:hidden;';
						thumbnail.innerHTML =
							'<img src="https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg" style="width:100%;height:100%;object-fit:cover;mix-blend-mode:normal!important;">'
							+ '<svg style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;mix-blend-mode:normal!important;" viewBox="0 0 68 48">'
							+ '<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="red"/>'
							+ '<path d="M45 24L27 14v20" fill="white"/></svg>';
						iframe.replaceWith(thumbnail);
					} else {
						// Chrome/Firefox: use direct embed with header modification
						await browser.runtime.sendMessage({
							action: 'enableYouTubeEmbedRule'
						}).catch(() => {});

						if (videoTimestamp > 0 || videoWasPlaying) {
							const src = new URL(iframe.src);
							if (videoTimestamp > 0) {
								src.searchParams.set('start', String(videoTimestamp));
							}
							if (videoWasPlaying) {
								src.searchParams.set('autoplay', '1');
							}
							iframe.src = src.toString();
						}
					}
				}
			}

			while (contentBody.firstChild) {
				article.appendChild(contentBody.firstChild);
			}

			// Set extractor type
			if (extractorType) {
				doc.documentElement.setAttribute('data-reader-extractor', extractorType);
			}

			// Show footer with stats
			const footerItems = [
				'Obsidian Reader',
				wordCount ? new Intl.NumberFormat().format(wordCount) + ' words' : '',
				(parseTime ? 'parsed in ' + new Intl.NumberFormat().format(parseTime) + ' ms' : '')
			].filter(Boolean);
			footer.textContent = footerItems.join(' · ');
			footer.style.display = '';

			// Initialize content-dependent features
			this.observer = this.generateOutline(doc);
			this.initializeFootnotes(doc);
			this.initializeCodeHighlighting(doc);
			this.initializeCopyButtons(doc);
			this.initializeLightbox(doc);

			applyHighlights();

		} catch (e) {
			console.error('Reader', 'Error during apply:', e);
		}
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

			// Clean up YouTube embed referer rule if it was enabled
			const host = doc.URL ? new URL(doc.URL).hostname : '';
			if (host.includes('youtube.com') || host.includes('youtu.be')) {
				browser.runtime.sendMessage({ action: 'disableYouTubeEmbedRule' }).catch(() => {});
			}

			// Remove lightbox
			if (this.lightbox) {
				this.lightbox.remove();
				this.lightbox = null;
			}

			// Remove reader styles
			if (this.readerStyles) {
				this.readerStyles.remove();
				this.readerStyles = null;
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

			// Reapply highlights after restoring original content
			if (typeof window !== 'undefined' && window.hasOwnProperty('applyHighlights')) {
				(window as any).applyHighlights();
			}
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
