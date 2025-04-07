import Defuddle from 'defuddle/full';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import hljs from 'highlight.js';
import { getDomain } from './string-utils';

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
	private static readerStyles: HTMLLinkElement | null = null;
	private static lightbox: HTMLElement | null = null;
	private static currentImageIndex: number = -1;
	private static images: HTMLImageElement[] = [];
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
		wordCount?: number;
		parseTime?: number;
		extractorType?: string;
	} {
		
		// const defuddled = new Defuddle(doc, {debug: true}).parse();
		const defuddled = new Defuddle(doc).parse();

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

	private static initializeCopyButtons(doc: Document) {
		// Find all pre > code blocks
		const codeBlocks = doc.querySelectorAll('pre > code');
		codeBlocks.forEach(block => {
			const pre = block.parentElement as HTMLElement;
			
			const button = doc.createElement('button');
			button.className = 'copy-button';
			button.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
			`;

			button.addEventListener('click', async () => {
				try {
					// Get the raw text content without HTML tags
					const text = block.textContent || '';
					await navigator.clipboard.writeText(text);
					
					// Show success state
					button.classList.add('copied');
					button.innerHTML = `
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-icon lucide-check"><path d="M20 6 9 17l-5-5"/></svg>
					`;
					
					// Reset after 2 seconds
					setTimeout(() => {
						button.classList.remove('copied');
						button.innerHTML = `
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy-icon lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
						`;
					}, 2000);
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
		this.lightbox.innerHTML = `
			<button class="lightbox-close" aria-label="Close image viewer">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
			<div class="lightbox-content">
				<div class="lightbox-image-container"></div>
				<div class="lightbox-caption"></div>
			</div>
		`;
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
					expandButton.innerHTML = `
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7"/>
						</svg>
					`;
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
					expandButton.innerHTML = `
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7"/>
						</svg>
					`;
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

		// Close button handler
		const closeButton = this.lightbox.querySelector('.lightbox-close');
		if (closeButton) {
			closeButton.addEventListener('click', () => this.closeLightbox());
		}

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
			container.innerHTML = '';
			captionContainer.innerHTML = '';
			
			// Clone the original image to preserve loaded state
			const img = this.images[index].cloneNode(true) as HTMLImageElement;
			container.appendChild(img);

			// Handle caption if image is part of a figure
			const figure = (this.images[index] as any).figureElement as HTMLElement;
			if (figure) {
				const figcaption = figure.querySelector('figcaption');
				if (figcaption) {
					captionContainer.innerHTML = figcaption.innerHTML;
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

			// Load saved settings
			await this.loadSettings();

			// Remove page scripts and their effects
			this.cleanupScripts(doc);
			
			// Clean the html element but preserve lang and dir attributes
			const htmlElement = doc.documentElement;
			const lang = htmlElement.getAttribute('lang');
			const dir = htmlElement.getAttribute('dir');
			
			// Restore lang and dir if they existed
			if (lang) htmlElement.setAttribute('lang', lang);
			if (dir) htmlElement.setAttribute('dir', dir);
			
			// Extract content using extractors or Defuddle
			const { content, title, author, published, domain, extractorType, wordCount, parseTime } = this.extractContent(doc);
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

			doc.body.innerHTML = `
				<div class="obsidian-reader-container">
					<div class="obsidian-left-sidebar">
						<div class="obsidian-reader-outline"></div>
					</div>
					<div class="obsidian-reader-content">
						<main>
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
							<article>
								${content}
							</article>
						</main>
						<div class="obsidian-reader-footer">
							${[
								'Obsidian Reader',
								wordCount ? new Intl.NumberFormat().format(wordCount) + ' words' : '',
								(parseTime ? 'parsed in ' + new Intl.NumberFormat().format(parseTime) + ' ms' : '')
							].filter(Boolean).join(' · ')}
						</div>
					</div>
					<div class="obsidian-reader-right-sidebar"></div>
				</div>
			`;

			// Add reader classes and attributes
			doc.documentElement.classList.add('obsidian-reader-active');
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
			this.initializeCopyButtons(doc);
			this.initializeLightbox(doc);

			// Set up color scheme media query listener
			this.colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			this.colorSchemeMediaQuery.addEventListener('change', (e) => this.handleColorSchemeChange(e, doc));
			
			this.isActive = true;
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
