import Defuddle from 'defuddle/full';
import browser from './browser-polyfill';
import { detectBrowser } from './browser-detection';
import { flattenShadowDom as flattenShadowDomUtil } from './flatten-shadow-dom';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import hljs from 'highlight.js';
import { getDomain } from './string-utils';
import { applyHighlights, invalidateHighlightCache, loadHighlights, toggleHighlighterMenu } from './highlighter';
import { copyToClipboard } from './clipboard-utils';
import { getMessage, initializeI18n } from './i18n';
import { getFontCss } from './font-utils';

// Mobile viewport settings
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

import { ReaderSettings } from '../types/types';

export class Reader {
	private static hasApplied: boolean = false;
	private static isActive: boolean = false;
	private static programmaticScroll: boolean = false;

	/**
	 * Helper function to create SVG elements
	 */
	private static createSVG(config: {
		width?: string;
		height?: string;
		viewBox?: string;
		className?: string;
		strokeWidth?: string;
		paths?: string[];
		circles?: Array<{cx: string, cy: string, r: string, fill?: string}>;
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
		svg.setAttribute('stroke-width', config.strokeWidth || '1.5');
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
		
		// Add circles
		if (config.circles) {
			config.circles.forEach(circleData => {
				const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				circle.setAttribute('cx', circleData.cx);
				circle.setAttribute('cy', circleData.cy);
				circle.setAttribute('r', circleData.r);
				if (circleData.fill) circle.setAttribute('fill', circleData.fill);
				svg.appendChild(circle);
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
		fonts: [],
		defaultFont: '',
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

		// Trigger button (always visible)
		const trigger = doc.createElement('button');
		trigger.className = 'obsidian-reader-settings-trigger nav-btn';
		trigger.setAttribute('aria-label', getMessage('settings'));
		trigger.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			circles: [{ cx: '18.5', cy: '12.5', r: '3.5' }],
			paths: ['m2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16', 'M22 9v7', 'M3.304 13h6.392'],
		}));
		trigger.addEventListener('click', (e) => {
			e.stopPropagation();
			clipDropdown.classList.remove('is-open');
			settingsBar.classList.toggle('is-open');
		});

		// Close when clicking outside
		doc.addEventListener('click', (e) => {
			if (!settingsBar.contains(e.target as Node)) {
				settingsBar.classList.remove('is-open');
			}
		});

		// Highlighter button
		const highlighterBtn = doc.createElement('button');
		highlighterBtn.className = 'obsidian-reader-settings-trigger nav-btn';
		highlighterBtn.setAttribute('aria-label', getMessage('highlighter'));
		highlighterBtn.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			paths: ['m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
		}));
		highlighterBtn.addEventListener('click', async () => {
			clipDropdown.classList.remove('is-open');
			settingsBar.classList.remove('is-open');
			const response = await browser.runtime.sendMessage({ action: 'getActiveTab' }) as { tabId?: number };
			if (response.tabId) {
				await browser.runtime.sendMessage({ action: 'toggleHighlighterMode', tabId: response.tabId });
			}
		});

		// Sync active state with highlighter mode
		const syncHighlighterBtn = () => {
			highlighterBtn.classList.toggle('is-active', doc.body.classList.contains('obsidian-highlighter-active'));
		};
		syncHighlighterBtn();
		this.highlighterObserver = new MutationObserver(syncHighlighterBtn);
		this.highlighterObserver.observe(doc.body, { attributes: true, attributeFilter: ['class'] });

		// Clip button with dropdown
		const clipButton = doc.createElement('button');
		clipButton.className = 'obsidian-reader-settings-trigger nav-btn';
		clipButton.setAttribute('aria-label', getMessage('addToObsidian'));
		clipButton.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			paths: ['m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'],
		}));

		const addToObsidianBtn = doc.createElement('button');
		addToObsidianBtn.className = 'nav-btn';
		addToObsidianBtn.setAttribute('aria-label', getMessage('addToObsidian'));
		const obsidianIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
		obsidianIcon.setAttribute('width', '18');
		obsidianIcon.setAttribute('height', '18');
		obsidianIcon.setAttribute('viewBox', '0 0 256 256');
		obsidianIcon.setAttribute('fill', 'currentColor');
		obsidianIcon.innerHTML = '<path d="M94.82 149.44c6.53-1.94 17.13-4.9 29.26-5.71a102.97 102.97 0 0 1-7.64-48.84c1.63-16.51 7.54-30.38 13.25-42.1l3.47-7.14 4.48-9.18c2.35-5 4.08-9.38 4.9-13.56.81-4.07.81-7.64-.2-11.11-1.03-3.47-3.07-7.14-7.15-11.21a17.02 17.02 0 0 0-15.8 3.77l-52.81 47.5a17.12 17.12 0 0 0-5.5 10.2l-4.5 30.18a149.26 149.26 0 0 1 38.24 57.2ZM54.45 106l-1.02 3.06-27.94 62.2a17.33 17.33 0 0 0 3.27 18.96l43.94 45.16a88.7 88.7 0 0 0 8.97-88.5A139.47 139.47 0 0 0 54.45 106Z"/><path d="m82.9 240.79 2.34.2c8.26.2 22.33 1.02 33.64 3.06 9.28 1.73 27.73 6.83 42.82 11.21 11.52 3.47 23.45-5.8 25.08-17.73 1.23-8.67 3.57-18.46 7.75-27.53a94.81 94.81 0 0 0-25.9-40.99 56.48 56.48 0 0 0-29.56-13.35 96.55 96.55 0 0 0-40.99 4.79 98.89 98.89 0 0 1-15.29 80.34h.1Z"/><path d="M201.87 197.76a574.87 574.87 0 0 0 19.78-31.6 8.67 8.67 0 0 0-.61-9.48 185.58 185.58 0 0 1-21.82-35.9c-5.91-14.16-6.73-36.08-6.83-46.69 0-4.07-1.22-8.05-3.77-11.21l-34.16-43.33c0 1.94-.4 3.87-.81 5.81a76.42 76.42 0 0 1-5.71 15.9l-4.7 9.8-3.36 6.72a111.95 111.95 0 0 0-12.03 38.23 93.9 93.9 0 0 0 8.67 47.92 67.9 67.9 0 0 1 39.56 16.52 99.4 99.4 0 0 1 25.8 37.31Z"/>';
		addToObsidianBtn.appendChild(obsidianIcon);
		addToObsidianBtn.addEventListener('click', () => {
			browser.runtime.sendMessage({ action: 'toggleIframe' });
		});

		const clipDropdown = doc.createElement('div');
		clipDropdown.className = 'obsidian-reader-clip-dropdown';

		const clipActions: Array<{ action: string; icon: SVGElement }> = [
			{ action: 'copyToClipboard', icon: this.createSVG({ width: '16', height: '16', viewBox: '0 0 24 24', strokeWidth: '1.75', paths: ['M20 8H10a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2z', 'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2'] }) },
			{ action: 'saveFile', icon: this.createSVG({ width: '16', height: '16', viewBox: '0 0 24 24', strokeWidth: '1.75', paths: ['M12 17V3', 'm6 11 6 6 6-6', 'M19 21H5'] }) },
		];

		for (const { action, icon } of clipActions) {
			const item = doc.createElement('div');
			item.className = 'obsidian-reader-clip-item';
			item.appendChild(icon);

			const itemLabel = doc.createElement('span');
			itemLabel.textContent = getMessage(action);
			item.appendChild(itemLabel);

			item.addEventListener('click', async () => {
				if (action === 'copyToClipboard') {
					const originalText = itemLabel.textContent;
					browser.runtime.sendMessage({ action: 'copyMarkdownToClipboard' });
					itemLabel.textContent = getMessage('copied');
					setTimeout(() => { itemLabel.textContent = originalText; }, 2000);
				} else if (action === 'saveFile') {
					clipDropdown.classList.remove('is-open');
					browser.runtime.sendMessage({ action: 'saveMarkdownToFile' });
				}
			});

			clipDropdown.appendChild(item);
		}

		clipButton.addEventListener('click', (e) => {
			e.stopPropagation();
			settingsBar.classList.remove('is-open');
			clipDropdown.classList.toggle('is-open');
		});

		doc.addEventListener('click', (e) => {
			if (!clipButton.contains(e.target as Node) && !clipDropdown.contains(e.target as Node)) {
				clipDropdown.classList.remove('is-open');
			}
		});

		// Outline button (mobile only, hidden until outline is generated)
		const outlineBtn = doc.createElement('button');
		outlineBtn.className = 'obsidian-reader-settings-trigger nav-btn nav-btn-outline';
		outlineBtn.setAttribute('aria-label', 'Outline');
		outlineBtn.classList.add('is-hidden');
		outlineBtn.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			paths: ['M3 5h.01', 'M3 12h.01', 'M3 19h.01', 'M8 5h13', 'M8 12h13', 'M8 19h13'],
		}));

		// Create mobile outline overlay
		const outlineOverlay = doc.createElement('div');
		outlineOverlay.className = 'obsidian-reader-outline-overlay';

		outlineBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			clipDropdown.classList.remove('is-open');
			settingsBar.classList.remove('is-open');
			const isOpen = outlineOverlay.classList.toggle('is-open');
			outlineBtn.classList.toggle('is-active', isOpen);
			doc.body.style.overflow = isOpen ? 'hidden' : '';
		});

		doc.body.appendChild(outlineOverlay);

		const triggerGroup = doc.createElement('div');
		triggerGroup.className = 'obsidian-reader-nav';
		triggerGroup.appendChild(outlineBtn);
		triggerGroup.appendChild(highlighterBtn);
		triggerGroup.appendChild(clipButton);
		triggerGroup.appendChild(trigger);
		triggerGroup.appendChild(addToObsidianBtn);
		settingsBar.appendChild(triggerGroup);
		settingsBar.appendChild(clipDropdown);

		// Hide buttons on scroll down, show on scroll up or hover
		let lastScrollY = window.scrollY;
		let scrollHidden = false;
		const scrollThreshold = 8;

		const isMobile = window.matchMedia('(pointer: coarse)').matches;

		const showButtons = () => {
			if (scrollHidden) {
				triggerGroup.style.opacity = '';
				if (isMobile) {
					triggerGroup.style.visibility = '';
					triggerGroup.style.pointerEvents = '';
				}
				scrollHidden = false;
			}
		};

		// Allow other code to force-show the nav
		window.addEventListener('reader-show-nav', () => {
			showButtons();
			lastScrollY = window.scrollY;
		});

		window.addEventListener('scroll', () => {
			if (settingsBar.classList.contains('is-open') || clipDropdown.classList.contains('is-open') || outlineOverlay.classList.contains('is-open')) return;
			const currentY = window.scrollY;
			const delta = currentY - lastScrollY;
			if (Math.abs(delta) < scrollThreshold) return;
			if (delta > 0 && currentY > 50) {
				if (!scrollHidden) {
					triggerGroup.style.opacity = '0';
					if (isMobile) {
						triggerGroup.style.visibility = 'hidden';
						triggerGroup.style.pointerEvents = 'none';
					}
					scrollHidden = true;
				}
			} else if (delta < 0) {
				showButtons();
			}
			lastScrollY = currentY;
		}, { passive: true });

		triggerGroup.addEventListener('mouseenter', showButtons);

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
		const themeWrapper = doc.createElement('div');
		themeWrapper.className = 'obsidian-reader-settings-select-wrapper';
		themeWrapper.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			circles: [
				{ cx: '13.5', cy: '6.5', r: '.5', fill: 'currentColor' },
				{ cx: '17.5', cy: '10.5', r: '.5', fill: 'currentColor' },
				{ cx: '8.5', cy: '7.5', r: '.5', fill: 'currentColor' },
				{ cx: '6.5', cy: '12.5', r: '.5', fill: 'currentColor' },
			],
			paths: ['M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z'],
		}));
		const themeSelect = doc.createElement('select');
		themeSelect.className = 'obsidian-reader-settings-select';
		themeSelect.dataset.action = 'change-theme';

		const themeOptions: Array<[string, string]> = [
			['default', ''],
			['flexoki', 'Flexoki'],
			['ayu', 'Ayu'],
			['catppuccin', 'Catppuccin'],
			['everforest', 'Everforest'],
			['gruvbox', 'Gruvbox'],
			['nord', 'Nord'],
			['rose-pine', 'Rosé Pine'],
			['solarized', 'Solarized'],
		];

		for (const [value, name] of themeOptions) {
			const option = doc.createElement('option');
			option.value = value;
			option.textContent = name || getMessage('readerColorSchemeDefault');
			themeSelect.appendChild(option);
		}
		themeWrapper.appendChild(themeSelect);

		// Theme mode select
		const themeModeWrapper = doc.createElement('div');
		themeModeWrapper.className = 'obsidian-reader-settings-select-wrapper';

		const sunIcon = this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			circles: [{ cx: '12', cy: '12', r: '4' }],
			paths: ['M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
		});
		const moonIcon = this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			paths: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
		});

		const updateModeIcon = () => {
			const isDark = doc.documentElement.classList.contains('theme-dark');
			sunIcon.style.display = isDark ? 'none' : '';
			moonIcon.style.display = isDark ? '' : 'none';
		};

		themeModeWrapper.appendChild(sunIcon);
		themeModeWrapper.appendChild(moonIcon);
		updateModeIcon();

		// Watch for theme-light/theme-dark class changes (D key, OS preference, etc.)
		this.themeModeObserver = new MutationObserver(updateModeIcon);
		this.themeModeObserver.observe(doc.documentElement, {
			attributes: true,
			attributeFilter: ['class'],
		});

		const themeModeSelect = doc.createElement('select');
		themeModeSelect.className = 'obsidian-reader-settings-select';

		const modeOptions: Array<[string, string]> = [
			['auto', 'readerAppearanceAuto'],
			['light', 'readerAppearanceLight'],
			['dark', 'readerAppearanceDark'],
		];

		for (const [value, messageKey] of modeOptions) {
			const option = doc.createElement('option');
			option.value = value;
			option.textContent = getMessage(messageKey);
			themeModeSelect.appendChild(option);
		}
		themeModeWrapper.appendChild(themeModeSelect);



		// Settings button
		const settingsBtn = doc.createElement('button');
		settingsBtn.className = 'obsidian-reader-settings-link-button';
		settingsBtn.setAttribute('aria-label', getMessage('readerSettings'));
		settingsBtn.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			circles: [{ cx: '12', cy: '12', r: '3' }],
			paths: [
				'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
			]
		}));
		const settingsLabel = doc.createElement('span');
		settingsLabel.textContent = getMessage('settings');
		settingsBtn.appendChild(settingsLabel);
		settingsBtn.addEventListener('click', () => {
			browser.runtime.sendMessage({ action: 'openSettings', section: 'reader' });
		});

		// Font select
		const fontWrapper = doc.createElement('div');
		fontWrapper.className = 'obsidian-reader-settings-select-wrapper';
		fontWrapper.appendChild(this.createSVG({
			width: '18', height: '18', viewBox: '0 0 24 24', strokeWidth: '1.75',
			paths: [
				'M4 7V4h16v3',
				'M9 20h6',
				'M12 4v16',
			],
		}));
		const fontSelect = doc.createElement('select');
		fontSelect.className = 'obsidian-reader-settings-select';

		const sansOption = doc.createElement('option');
		sansOption.value = '';
		sansOption.textContent = getMessage('readerFontSystemSans');
		fontSelect.appendChild(sansOption);

		const serifOption = doc.createElement('option');
		serifOption.value = '__serif__';
		serifOption.textContent = getMessage('readerFontSystemSerif');
		fontSelect.appendChild(serifOption);

		for (const font of [...this.settings.fonts].sort((a, b) => a.localeCompare(b))) {
			const option = doc.createElement('option');
			option.value = font;
			option.textContent = font;
			fontSelect.appendChild(option);
		}
		fontWrapper.appendChild(fontSelect);

		// Assemble everything
		const typographyGroup = doc.createElement('div');
		typographyGroup.className = 'obsidian-reader-settings-typography-group';
		typographyGroup.appendChild(fontGroup);
		typographyGroup.appendChild(widthGroup);
		typographyGroup.appendChild(lineHeightGroup);
		controlsContainer.appendChild(typographyGroup);

		const spacer = doc.createElement('div');
		spacer.className = 'obsidian-reader-settings-spacer';
		controlsContainer.appendChild(spacer);

		const dropdownGroup = doc.createElement('div');
		dropdownGroup.className = 'obsidian-reader-settings-dropdown-group';
		dropdownGroup.appendChild(themeModeWrapper);
		dropdownGroup.appendChild(themeWrapper);
		dropdownGroup.appendChild(fontWrapper);
		controlsContainer.appendChild(dropdownGroup);

		const spacer2 = doc.createElement('div');
		spacer2.className = 'obsidian-reader-settings-spacer';
		controlsContainer.appendChild(spacer2);

		controlsContainer.appendChild(settingsBtn);

		settingsBar.appendChild(controlsContainer);

		doc.body.appendChild(settingsBar);
		this.settingsBar = settingsBar;

		// Initialize values from settings
		this.updateFontSize(doc, parseInt(getComputedStyle(doc.documentElement).getPropertyValue('--font-text-size')));
		this.updateWidth(doc, parseInt(getComputedStyle(doc.documentElement).getPropertyValue('--line-width')));
		this.updateLineHeight(doc, parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--line-height-normal')));

		settingsBar.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const button = target.closest('.obsidian-reader-settings-button') as HTMLButtonElement;
			if (!button) return;

			const action = button.dataset.action;
			const html = doc.documentElement;
			const style = getComputedStyle(html);

			switch (action) {
				case 'decrease-font':
					this.updateFontSize(doc, parseInt(style.getPropertyValue('--font-text-size')) - 1);
					break;
				case 'increase-font':
					this.updateFontSize(doc, parseInt(style.getPropertyValue('--font-text-size')) + 1);
					break;
				case 'decrease-width':
					this.updateWidth(doc, parseInt(style.getPropertyValue('--line-width')) - 1);
					break;
				case 'increase-width':
					this.updateWidth(doc, parseInt(style.getPropertyValue('--line-width')) + 1);
					break;
				case 'decrease-line-height':
					this.updateLineHeight(doc, parseFloat(style.getPropertyValue('--line-height-normal')) - 0.1);
					break;
				case 'increase-line-height':
					this.updateLineHeight(doc, parseFloat(style.getPropertyValue('--line-height-normal')) + 0.1);
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

		// Add font select event listener
		fontSelect.value = this.settings.defaultFont;
		fontSelect.addEventListener('change', () => {
			this.settings.defaultFont = fontSelect.value;
			this.applyFont(doc, fontSelect.value);
			this.saveSettings();
		});

		// Notify content script to listen for highlighter button
		document.dispatchEvent(new CustomEvent('obsidian-reader-init'));
		
	}

	private static updateFontSize(doc: Document, size: number) {
		size = Math.max(9, Math.min(24, size));
		doc.documentElement.style.setProperty('--font-text-size', `${size}px`);
		this.settings.fontSize = size;
		this.saveSettings();
	}

	private static updateWidth(doc: Document, width: number) {
		width = Math.max(30, Math.min(60, width));
		doc.documentElement.style.setProperty('--line-width', `${width}em`);
		this.settings.maxWidth = width;
		this.saveSettings();
	}

	private static updateLineHeight(doc: Document, height: number) {
		height = Math.max(1.1, Math.min(2, Math.round(height * 10) / 10));
		doc.documentElement.style.setProperty('--line-height-normal', height.toString());
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
		if (isDark && this.settings.darkTheme !== 'same') {
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

	private static applyFont(doc: Document, defaultFont: string): void {
		const css = getFontCss(defaultFont);
		if (css) {
			doc.body.style.setProperty('--font-text', css);
		} else {
			doc.body.style.removeProperty('--font-text');
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


	private static getStickyOffset(): number {
		const player = document.querySelector('iframe.sticky-player') as HTMLElement | null;
		return player ? player.getBoundingClientRect().height + 16 : 0;
	}

	private static scrollToElement(el: Element): void {
		const rect = el.getBoundingClientRect();
		const stickyOffset = this.getStickyOffset();
		const gap = stickyOffset > 0 ? stickyOffset + window.innerHeight * 0.02 : window.innerHeight * 0.05;
		const targetY = (window.pageYOffset || document.documentElement.scrollTop) + rect.top - gap;
		this.scrollTo(targetY);
	}

	private static scrollTo(targetY: number, duration = 200): void {
		const startY = window.pageYOffset;
		const distance = targetY - startY;
		if (Math.abs(distance) < 1) return;
		const startTime = performance.now();
		this.programmaticScroll = true;

		const step = (now: number) => {
			const elapsed = now - startTime;
			const t = Math.min(elapsed / duration, 1);
			const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
			window.scrollTo(0, startY + distance * ease);
			if (t < 1) {
				requestAnimationFrame(step);
			} else {
				setTimeout(() => { Reader.programmaticScroll = false; }, 50);
			}
		};

		requestAnimationFrame(step);
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

	private static generateOutline(doc: Document, title?: string) {
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

		// Add title as first outline item
		const titleHeading = doc.querySelector('.obsidian-reader-content h1');
		if (title && titleHeading) {
			const titleItem = doc.createElement('div');
			titleItem.className = 'obsidian-reader-outline-item obsidian-reader-outline-h1';
			titleItem.setAttribute('data-depth', '0');
			titleItem.textContent = title;
			titleItem.addEventListener('click', () => {
				this.scrollTo(0);
			});
			outline.appendChild(titleItem);
			outlineItems.set(titleHeading, titleItem);
		}

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
				this.scrollToElement(heading);
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

		const createOutlineObserver = () => {
			const stickyOffset = this.getStickyOffset();
			const topMargin = stickyOffset > 0
				? `-${Math.round(stickyOffset / window.innerHeight * 100 + 5)}%`
				: '-5%';
			return new IntersectionObserver(observerCallback, {
				rootMargin: `${topMargin} 0px -85% 0px`,
				threshold: 0
			});
		};

		let observer = createOutlineObserver();

		// Recreate observer when sticky player appears/resizes
		const stickyPlayer = doc.querySelector('iframe.sticky-player');
		if (stickyPlayer) {
			const resizeObserver = new ResizeObserver(() => {
				observer.disconnect();
				observer = createOutlineObserver();
				if (titleHeading) observer.observe(titleHeading);
				headings.forEach(heading => observer.observe(heading));
			});
			resizeObserver.observe(stickyPlayer);
		}

		if (titleHeading) {
			observer.observe(titleHeading);
		}
		headings.forEach(heading => {
			observer.observe(heading);
		});

		// Add footnotes link if there are footnotes
		const footnotes = article.querySelector('#footnotes');
		if (footnotes) {
			const item = doc.createElement('div');
			item.className = 'obsidian-reader-outline-item';
			item.setAttribute('data-depth', '0');
			item.textContent = getMessage('readerFootnotes');
			
			item.addEventListener('click', () => {
				this.scrollToElement(footnotes);
			});

			outline.appendChild(item);
			outlineItems.set(footnotes, item);
			observer.observe(footnotes);
		}

		// Populate mobile outline overlay
		const outlineOverlay = doc.querySelector('.obsidian-reader-outline-overlay') as HTMLElement;
		const outlineBtn = doc.querySelector('.nav-btn-outline') as HTMLElement;
		if (outlineOverlay && outlineBtn) {
			outlineBtn.classList.remove('is-hidden');
			outlineOverlay.textContent = '';

			const closeOutline = () => {
				outlineOverlay.classList.remove('is-open');
				outlineBtn.classList.remove('is-active');
				doc.body.style.overflow = '';
			};

			const outlineItemsList = outline.querySelectorAll('.obsidian-reader-outline-item');
			const headingEntries = Array.from(outlineItems.entries());

			outlineItemsList.forEach((item, index) => {
				const clone = item.cloneNode(true) as HTMLElement;
				clone.addEventListener('click', () => {
					closeOutline();

					// Find the heading element for this outline item
					const entry = headingEntries[index];
					if (entry) {
						const [heading] = entry;
						const rect = heading.getBoundingClientRect();
						const navOffset = 80;
						const targetY = (window.pageYOffset || doc.documentElement.scrollTop) + rect.top - navOffset;
						this.scrollTo(Math.max(0, targetY));

						// Keep nav visible after scrolling
						setTimeout(() => {
							window.dispatchEvent(new Event('reader-show-nav'));
						}, 250);
					}
				});
				outlineOverlay.appendChild(clone);

				// Sync active/faint classes from sidebar outline to overlay clone
				new MutationObserver(() => {
					clone.className = (item as HTMLElement).className;
				}).observe(item, { attributes: true, attributeFilter: ['class'] });
			});
		}

		return observer;
	}

	private static observer: IntersectionObserver | null = null;
	private static highlighterObserver: MutationObserver | null = null;
	private static themeModeObserver: MutationObserver | null = null;
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
					const rect = refElement.getBoundingClientRect();
					const targetY = (window.pageYOffset || doc.documentElement.scrollTop) + rect.top - window.innerHeight * 0.4 - this.getStickyOffset();
					this.scrollTo(targetY);
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
		const isMobile = window.matchMedia('(pointer: coarse)').matches;
		const VIEWPORT_PADDING = isMobile ? 40 : 20; // Minimum distance from viewport edges
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
			// Polyfill requestIdleCallback for WebKit-based browsers (e.g. Orion)
			// that don't support it — page scripts may reference it in disconnectedCallback
			if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'undefined') {
				(window as any).requestIdleCallback = (cb: Function) => setTimeout(cb, 1);
				(window as any).cancelIdleCallback = (id: number) => clearTimeout(id);
			}

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

			// Replace body with a clone to remove all event listeners.
			// Skip when the clipper iframe is present — cloning creates a
			// new iframe element which reloads and loses user edits.
			if (!doc.getElementById('obsidian-clipper-container')) {
				const newBody = doc.body.cloneNode(true);
				doc.body.parentNode?.replaceChild(newBody, doc.body);
			}

			// Block inline event handlers and dynamic scripts
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

	private static readonly COMMENT_COLORS = [
		'--color-red',
		'--color-orange',
		'--color-yellow',
		'--color-green',
		'--color-cyan',
		'--color-blue',
		'--color-purple',
		'--color-pink',
		'--text-muted',
	];

	private static usernameToColor(username: string): string {
		let hash = 0;
		for (let i = 0; i < username.length; i++) {
			hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0;
		}
		return this.COMMENT_COLORS[Math.abs(hash) % this.COMMENT_COLORS.length];
	}

	private static linkifyTextUrls(doc: Document): void {
		const article = doc.querySelector('article');
		if (!article) return;

		const urlPattern = /\bhttps?:\/\/[^\s<>\[\]()'"]+/g;
		const walker = doc.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				// Skip text inside <a>, <pre>, <code>, <script>, <style>
				const parent = node.parentElement;
				if (parent?.closest('a, pre, code, script, style')) {
					return NodeFilter.FILTER_REJECT;
				}
				return urlPattern.test(node.textContent || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
			}
		});

		const textNodes: Text[] = [];
		while (walker.nextNode()) {
			textNodes.push(walker.currentNode as Text);
		}

		for (const textNode of textNodes) {
			const text = textNode.textContent || '';
			urlPattern.lastIndex = 0;
			const fragment = doc.createDocumentFragment();
			let lastIndex = 0;
			let match;

			while ((match = urlPattern.exec(text)) !== null) {
				if (match.index > lastIndex) {
					fragment.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
				}
				const link = doc.createElement('a');
				link.href = match[0];
				link.textContent = match[0];
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				fragment.appendChild(link);
				lastIndex = urlPattern.lastIndex;
			}

			if (lastIndex < text.length) {
				fragment.appendChild(doc.createTextNode(text.slice(lastIndex)));
			}

			textNode.parentNode?.replaceChild(fragment, textNode);
		}
	}

	private static initializeComments(doc: Document) {
		const commentsEl = doc.querySelector<HTMLElement>('.comments');
		if (!commentsEl) return;

		// Add background color to comment author names for easy thread following
		commentsEl.querySelectorAll<HTMLElement>('.comment-author').forEach((authorEl) => {
			const username = authorEl.querySelector('strong')?.textContent?.trim() || '';
			if (!username) return;
			authorEl.style.backgroundColor = `color-mix(in srgb, var(${this.usernameToColor(username)}) 20%, transparent)`;
		});

		// Add collapse/expand button to each comment
		commentsEl.querySelectorAll<HTMLElement>('.comment').forEach((comment) => {
			const metadata = comment.querySelector('.comment-metadata');
			if (!metadata) return;

			const btn = doc.createElement('button');
			btn.className = 'comment-collapse-btn';
			btn.setAttribute('aria-label', getMessage('readerCollapseComment'));

			const chevron = this.createSVG({
				width: '16',
				height: '16',
				viewBox: '0 0 24 24',
				paths: ['m6 9 6 6 6-6'],
			});
			chevron.classList.add('comment-collapse-chevron');
			btn.appendChild(chevron);

			const countSpan = doc.createElement('span');
			countSpan.className = 'comment-collapse-count';
			btn.appendChild(countSpan);

			metadata.appendChild(btn);

			const isTopLevel = comment.parentElement?.matches?.('.comments > blockquote');

			// Get sibling elements that should be hidden when this comment is collapsed.
			// - Blockquotes (reply branches) are always hidden
			// - Stop at the next .comment (a separate reply at the same level)
			// - Top-level: hide everything (comments + blockquotes)
			const getCollapsibleSiblings = (): HTMLElement[] => {
				const siblings: HTMLElement[] = [];
				let sibling = comment.nextElementSibling;
				while (sibling) {
					if (sibling.classList.contains('comment')) {
						if (isTopLevel) {
							siblings.push(sibling as HTMLElement);
						} else {
							break;
						}
					} else if (sibling.tagName === 'BLOCKQUOTE') {
						siblings.push(sibling as HTMLElement);
					}
					sibling = sibling.nextElementSibling;
				}
				return siblings;
			};

			const countHidden = (siblings: HTMLElement[]): number => {
				let count = 0;
				for (const el of siblings) {
					if (el.classList.contains('comment')) count++;
					else count += el.querySelectorAll('.comment').length;
				}
				return count;
			};

			const updateBtn = () => {
				const isCollapsed = comment.classList.contains('collapsed');
				const siblings = getCollapsibleSiblings();

				for (const el of siblings) {
					el.style.display = isCollapsed ? 'none' : '';
				}

				if (isCollapsed) {
					const hidden = countHidden(siblings);
					countSpan.textContent = hidden > 0 ? `${hidden}` : '';
					btn.classList.add('is-collapsed');
					btn.setAttribute('aria-label', `Expand${hidden > 0 ? ` ${hidden} more` : ''}`);
				} else {
					countSpan.textContent = '';
					btn.classList.remove('is-collapsed');
					btn.setAttribute('aria-label', getMessage('readerCollapseComment'));
				}
			};

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				comment.classList.toggle('collapsed');
				updateBtn();
			});
		});

		// Highlight ancestor thread lines up to the hovered child's arm
		let highlightedAncestors: HTMLElement[] = [];

		const clearHighlight = () => {
			for (const el of highlightedAncestors) {
				el.classList.remove('child-hovered');
				el.style.removeProperty('--highlight-height');
			}
			highlightedAncestors = [];
		};

		commentsEl.addEventListener('mouseover', (e) => {
			const target = e.target as HTMLElement;
			const bq = target.closest('blockquote') as HTMLElement;
			if (!bq || bq.closest('.comment-content')) {
				clearHighlight();
				return;
			}

			// Walk up the chain: for each ancestor blockquote, highlight
			// its border-left up to the child branch that leads to the hovered element.
			const newAncestors: HTMLElement[] = [];
			let child = bq;
			let parent = child.parentElement;
			while (parent && parent.tagName === 'BLOCKQUOTE' && !parent.closest('.comment-content')) {
				newAncestors.push(parent);
				child = parent;
				parent = child.parentElement;
			}

			// Skip update if same set of ancestors
			if (newAncestors.length === highlightedAncestors.length &&
				newAncestors.every((el, i) => el === highlightedAncestors[i])) {
				return;
			}

			clearHighlight();

			// Re-walk to set --highlight-height on each ancestor
			child = bq;
			parent = child.parentElement;
			while (parent && parent.tagName === 'BLOCKQUOTE' && !parent.closest('.comment-content')) {
				parent.style.setProperty('--highlight-height', `${child.offsetTop + 2}px`);
				parent.classList.add('child-hovered');
				highlightedAncestors.push(parent);

				// If parent is a top-level blockquote (its parent is .comments),
				// highlight all previous sibling blockquotes of `child` to trace
				// the thread line back up to the top-level comment.
				if (parent.parentElement?.matches?.('.comments')) {
					let sibling = child.previousElementSibling;
					while (sibling) {
						if (sibling.tagName === 'BLOCKQUOTE') {
							(sibling as HTMLElement).classList.add('child-hovered');
							highlightedAncestors.push(sibling as HTMLElement);
						}
						sibling = sibling.previousElementSibling;
					}
				}

				child = parent;
				parent = child.parentElement;
			}
		});

		commentsEl.addEventListener('mouseleave', clearHighlight);
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
		closeButton.setAttribute('aria-label', getMessage('readerCloseImageViewer'));
		
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
					expandButton.setAttribute('aria-label', getMessage('readerViewFullSize'));
					
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
					expandButton.setAttribute('aria-label', getMessage('readerViewFullSize'));
					
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
			await initializeI18n();

			this.hasApplied = true;

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
			// Remove the clipper container from the clone so Defuddle
			// doesn't extract it as page content
			docClone.getElementById('obsidian-clipper-container')?.remove();
			// Preserve the URL for Defuddle's extractors
			Object.defineProperty(docClone, 'URL', { value: doc.URL, configurable: true });
			// Start content extraction on the clone (don't await yet)
			const contentPromise = this.extractContent(docClone);

			// Clean up head - remove unwanted elements but keep meta tags and non-stylesheet links
			const head = doc.head;

			// Remove base tags
			const baseTags = head.querySelectorAll('base');
			baseTags.forEach(el => el.remove());

			// Remove stylesheet links and style tags, except reader and extension styles
			const styleElements = head.querySelectorAll('link[rel="stylesheet"], link[as="style"], style');
			styleElements.forEach(el => {
				if (el.id === 'obsidian-reader-styles') return;
				// Preserve extension-injected styles (clipper, highlighter)
				if (el instanceof HTMLStyleElement && el.textContent?.includes('obsidian-clipper')) return;
				el.remove();
			});

			// Re-add reader CSS as a link element after cleanup
			// The CSS injected by insertCSS lacks the protected id and gets removed above
			if (!doc.getElementById('obsidian-reader-styles')) {
				const readerLink = doc.createElement('link');
				readerLink.id = 'obsidian-reader-styles';
				readerLink.rel = 'stylesheet';
				readerLink.href = browser.runtime.getURL('reader.css');
				doc.head.appendChild(readerLink);
			}

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

			// Clear body children, preserving the clipper iframe container
			if (clipperIframeContainer) {
				for (let i = doc.body.childNodes.length - 1; i >= 0; i--) {
					const child = doc.body.childNodes[i];
					if (child !== clipperIframeContainer) {
						doc.body.removeChild(child);
					}
				}
			} else {
				doc.body.textContent = '';
			}

			// Create main container
			const readerContainer = doc.createElement('div');
			readerContainer.className = 'obsidian-reader-container';

			// Create left sidebar
			const leftSidebar = doc.createElement('div');
			leftSidebar.className = 'obsidian-reader-left-sidebar';
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
			spinnerText.textContent = getMessage('readerLoading');
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
			doc.documentElement.style.setProperty('--font-text-size', `${this.settings.fontSize}px`);
			doc.documentElement.style.setProperty('--line-height-normal', this.settings.lineHeight.toString());
			doc.documentElement.style.setProperty('--line-width', `${this.settings.maxWidth}em`);
			this.applyFont(doc, this.settings.defaultFont);
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

			// Re-activate highlighter if it was active before entering Reader
			if (doc.body.classList.contains('obsidian-highlighter-active')) {
				toggleHighlighterMenu(true);
			}

			// Re-attach the clipper iframe container only if it was
			// detached (not present when body clone was skipped)
			if (clipperIframeContainer && !doc.body.contains(clipperIframeContainer)) {
				doc.body.appendChild(clipperIframeContainer);
			}

			// Toggle dark mode with D key (visual only, doesn't change appearance setting)
			doc.addEventListener('keydown', (e) => {
				if (!this.isActive) return;
				if ((e.key !== 'd' && e.key !== 'D') || e.ctrlKey || e.metaKey) return;
				const tag = (document.activeElement as HTMLElement)?.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA') return;
				const html = doc.documentElement;
				const isDark = html.classList.contains('theme-dark');
				html.classList.remove('theme-light', 'theme-dark');
				html.classList.add(isDark ? 'theme-light' : 'theme-dark');
				this.applyTheme(doc);
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
				article.textContent = getMessage('readerError');
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

			const authors = author ? author.split(/,\s*/) : [];
			const metadataItems: {text: string, type: string}[] = [
				...authors.map(a => ({text: a, type: 'author'})),
				formattedDate ? {text: formattedDate, type: 'date'} : null,
				domain ? {text: domain, type: 'domain'} : null,
			].filter((item): item is {text: string, type: string} => item !== null);

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
					if (item.type === 'author') {
						span.className = 'metadata-author';
						span.textContent = item.text;
					} else if (item.type === 'domain' && domain) {
						const link = doc.createElement('a');
						link.href = doc.URL;
						link.textContent = domain;
						span.appendChild(link);
					} else {
						span.textContent = item.text;
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

			// Make YouTube iframe sticky when a transcript follows,
			// and wire up timestamp clicks to seek the video
			const transcript = article.querySelector('.youtube.transcript') as HTMLElement | null;
			if (transcript) {
				const iframe = article.querySelector('iframe[src*="youtube.com/embed/"]') as HTMLIFrameElement | null;
				if (iframe) {
					iframe.classList.add('sticky-player');

					// Enable JS API on the embed
					const src = new URL(iframe.src);
					src.searchParams.set('enablejsapi', '1');
					src.searchParams.set('origin', window.location.origin);
					iframe.src = src.toString();

					// Initialize postMessage connection once iframe loads
					iframe.addEventListener('load', () => {
						if (iframe.contentWindow) {
							iframe.contentWindow.postMessage(JSON.stringify({
								event: 'listening'
							}), '*');
						}
					});

					// Build a sorted list of segments with their start times
					const segments = Array.from(transcript.querySelectorAll('.transcript-segment')) as HTMLElement[];
					segments.forEach(seg => {
						// Pull the timestamp out into its own element
						// and wrap remaining text in a span
						const strong = seg.querySelector('strong');
						if (!strong) return;

						// Remove " · " separator
						if (strong.nextSibling?.nodeType === Node.TEXT_NODE) {
							strong.nextSibling.textContent = strong.nextSibling.textContent!.replace(/^\s*·\s*/, '');
						}

						// Move timestamp strong out, wrap the rest in a div
						const textWrapper = doc.createElement('div');
						textWrapper.className = 'transcript-segment-text';
						strong.remove();
						while (seg.firstChild) {
							textWrapper.appendChild(seg.firstChild);
						}
						seg.appendChild(strong);
						seg.appendChild(textWrapper);
					});
					// Set timestamp column width to the widest timestamp
					let maxWidth = 0;
					segments.forEach(seg => {
						const strong = seg.querySelector('strong');
						if (strong) {
							maxWidth = Math.max(maxWidth, strong.getBoundingClientRect().width);
						}
					});
					transcript.style.setProperty('--timestamp-width', Math.ceil(maxWidth) + 'px');

					const segmentTimes = segments.map(seg => {
						const ts = seg.querySelector('.timestamp');
						return parseFloat(ts?.getAttribute('data-timestamp') || '0');
					});

					// Track active segment based on video current time
					let activeSegment: HTMLElement | null = null;
					let activeIndex = -1;
					let suppressScroll = false;
					let lastUserScroll = 0;
					let lastCurrentTime = -1;

					window.addEventListener('scroll', () => {
						if (Reader.programmaticScroll || scrubbing) return;
						lastUserScroll = Date.now();
					}, { passive: true });

					const updateActiveSegment = (currentTime: number) => {
						if (Math.abs(currentTime - lastCurrentTime) < 0.05) return;
						lastCurrentTime = currentTime;
						let newIndex = -1;
						for (let i = segmentTimes.length - 1; i >= 0; i--) {
							if (currentTime >= segmentTimes[i]) {
								newIndex = i;
								break;
							}
						}
						if (newIndex !== activeIndex) {
							// Resume auto-scroll once segment changes after scrub ends
							if (suppressScroll && !scrubbing) {
								suppressScroll = false;
							}
							activeSegment?.classList.remove('is-active');
							if (newIndex >= 0) {
								segments[newIndex].classList.add('is-active');
								// Auto-scroll to keep active segment visible
								if (!suppressScroll && Date.now() - lastUserScroll > 2000) {
									const rect = segments[newIndex].getBoundingClientRect();
									const stickyOffset = this.getStickyOffset();
									const targetY = (window.pageYOffset || doc.documentElement.scrollTop)
										+ rect.top - stickyOffset - 20;
									this.scrollTo(targetY);
								}
							}
							activeSegment = newIndex >= 0 ? segments[newIndex] : null;
							activeIndex = newIndex;
						}
						// Update progress line on the scrub track
						if (activeSegment && activeIndex >= 0) {
							const segRect = activeSegment.getBoundingClientRect();
							const trackRect = scrubTrack.getBoundingClientRect();
							const start = segmentTimes[activeIndex];
							const end = activeIndex < segmentTimes.length - 1
								? segmentTimes[activeIndex + 1]
								: start + 30;
							const segProgress = Math.min(1, Math.max(0, (currentTime - start) / (end - start)));
							const yInTrack = (segRect.top - trackRect.top) + segProgress * segRect.height;
							const trackProgress = yInTrack / trackRect.height;
							scrubTrack.style.setProperty('--track-progress', (trackProgress * 100) + '%');

							// Update playback highlight — underline the current line
							if (playbackHighlight) {
								playbackHighlight.clear();
								const textEl = activeSegment.querySelector('.transcript-segment-text');
								const textNode = textEl?.firstChild;
								if (textNode && textNode.nodeType === Node.TEXT_NODE) {
									const totalLen = (textNode.textContent || '').length;
									const charPos = Math.min(totalLen - 1, Math.max(0, Math.round(segProgress * totalLen)));

									// Find lines around the current position
									const probe = doc.createRange();
									const getLineY = (pos: number) => {
										probe.setStart(textNode!, Math.min(pos, totalLen - 1));
										probe.setEnd(textNode!, Math.min(pos + 1, totalLen));
										return probe.getClientRects()[0]?.top;
									};

									const lineY = getLineY(charPos);
									if (lineY === undefined) return;

									// Scan backward to find start of current sentence
									// but limit to ~2 lines back so run-ons don't over-highlight
									const text = textNode.textContent || '';
									let start = 0;
									if (segProgress > 0.05) {
										start = charPos;
										let backLineChanges = 0;
										let backLastY = lineY;
										while (start > 0) {
											if (/[.!?]/.test(text[start - 1]) && /\s/.test(text[start])) {
												while (start < charPos && /\s/.test(text[start])) start++;
												break;
											}
											const y = getLineY(start - 1);
											if (y !== undefined && Math.abs(y - backLastY) > 2) {
												backLineChanges++;
												if (backLineChanges >= 2) break;
												backLastY = y;
											}
											start--;
										}
									}

									// Scan forward: up to 3 lines total, stop at sentence end or comma
									let end = charPos + 1;
									let fwdLines = 0;
									let fwdLastY = lineY;
									while (end < totalLen && fwdLines < 3) {
										const y = getLineY(end);
										if (y === undefined) break;
										if (Math.abs(y - fwdLastY) > 2) {
											fwdLines++;
											if (fwdLines >= 3) break;
											fwdLastY = y;
										}
										// After moving past the start, stop at sentence punctuation or comma
										if (end > charPos + 1 && /[.!?,]/.test(text[end - 1]) && (end >= totalLen || /\s/.test(text[end]))) break;
										end++;
									}

									const range = doc.createRange();
									range.setStart(textNode, start);
									range.setEnd(textNode, end);
									playbackHighlight.add(range);
								}
							}
						}
					};

					// Listen for time updates from the iframe
					const onMessage = (e: MessageEvent) => {
						if (e.source !== iframe.contentWindow) return;
						try {
							const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
							if (data?.info?.currentTime !== undefined) {
								updateActiveSegment(data.info.currentTime);
							}
						} catch {}
					};
					window.addEventListener('message', onMessage);

					// Poll current time while iframe is on the page
					const poll = setInterval(() => {
						if (!iframe.contentWindow || !doc.contains(iframe)) {
							clearInterval(poll);
							window.removeEventListener('message', onMessage);
							return;
						}
						iframe.contentWindow.postMessage(JSON.stringify({
							event: 'command',
							func: 'getCurrentTime',
							args: []
						}), '*');
					}, 500);

					// Scrub video via a track behind the timestamps
					const seekTo = (seconds: number) => {
						if (!iframe.contentWindow) return;
						iframe.contentWindow.postMessage(JSON.stringify({
							event: 'command',
							func: 'seekTo',
							args: [seconds, true]
						}), '*');
					};

					// Add a scrub track behind the timestamps
					const scrubTrack = doc.createElement('div');
					scrubTrack.className = 'transcript-scrub-track';
					const scrubHover = doc.createElement('div');
					scrubHover.className = 'transcript-scrub-hover';
					scrubTrack.appendChild(scrubHover);
					transcript.style.position = 'relative';
					transcript.appendChild(scrubTrack);

					// Word highlights using CSS Custom Highlight API
					const hasHighlights = !!(CSS as any).highlights;
					const playbackHighlight = hasHighlights ? new (window as any).Highlight() : null;
					const hoverHighlight = hasHighlights ? new (window as any).Highlight() : null;
					if (hasHighlights) {
						(CSS as any).highlights.set('transcript-playback', playbackHighlight);
						(CSS as any).highlights.set('transcript-hover', hoverHighlight);
					}

					const getCaretNode = (x: number, y: number): { node: Node; offset: number } | null => {
						if ('caretPositionFromPoint' in doc) {
							const pos = (doc as any).caretPositionFromPoint(x, y);
							if (pos) return { node: pos.offsetNode, offset: pos.offset };
						} else if ('caretRangeFromPoint' in doc) {
							const range = (doc as any).caretRangeFromPoint(x, y) as Range | null;
							if (range) return { node: range.startContainer, offset: range.startOffset };
						}
						return null;
					};

					const getHoverRange = (textNode: Node, offset: number): Range | null => {
						const text = textNode.textContent || '';
						const totalWords = 8;

						// Forward first: up to 6 words, stop at sentence boundary
						// Commas act as soft stops — prefer stopping at a comma if we have 4+ words
						let end = offset;
						let wordsForward = 0;
						let lastComma = -1;
						let wordsAtComma = 0;
						while (end < text.length && wordsForward < 6) {
							if (/[.!?]/.test(text[end - 1]) && (end >= text.length || /\s/.test(text[end]))) break;
							if (text[end - 1] === ',' && wordsForward >= 3) {
								lastComma = end;
								wordsAtComma = wordsForward;
							}
							end++;
							if (end < text.length && /\s/.test(text[end - 1]) && /\S/.test(text[end])) wordsForward++;
						}
						// Prefer comma stop if we went past it
						if (lastComma > 0 && wordsForward > wordsAtComma) {
							end = lastComma;
							wordsForward = wordsAtComma;
						}

						// Backward: if forward hit punctuation, limit to 2 words back
						const hitPunctuation = end < text.length && /[.!?]/.test(text[end - 1]);
						const maxBack = hitPunctuation ? 2 : Math.max(1, totalWords - wordsForward);
						let start = offset;
						let wordsBack = 0;
						while (start > 0 && wordsBack < maxBack) {
							if (/[.!?]/.test(text[start - 1]) && /\s/.test(text[start])) break;
							start--;
							if (start > 0 && /\s/.test(text[start]) && /\S/.test(text[start - 1])) wordsBack++;
						}

						// Trim whitespace at edges
						while (start < offset && /\s/.test(text[start])) start++;
						while (end > offset && /\s/.test(text[end - 1])) end--;
						if (start >= end) return null;
						const range = doc.createRange();
						range.setStart(textNode, start);
						range.setEnd(textNode, end);
						return range;
					};

					const updateHoverHighlight = (e: MouseEvent) => {
						if (!hoverHighlight) return;
						hoverHighlight.clear();
						const seg = (e.target as HTMLElement).closest('.transcript-segment-text');
						if (!seg) return;
						const caret = getCaretNode(e.clientX, e.clientY);
						if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !seg.contains(caret.node)) return;
						const range = getHoverRange(caret.node, caret.offset);
						if (range) hoverHighlight.add(range);
					};

					transcript.addEventListener('mousemove', (e: MouseEvent) => {
						const rect = scrubTrack.getBoundingClientRect();
						scrubHover.style.top = (e.clientY - rect.top) + 'px';
						updateHoverHighlight(e);
					});
					transcript.addEventListener('mouseleave', (e: MouseEvent) => {
						scrubHover.style.top = '';
						if (hoverHighlight) hoverHighlight.clear();
					});
					// Position from first segment to bottom
					const positionTrack = () => {
						const transcriptRect = transcript.getBoundingClientRect();
						const firstSegRect = segments[0].getBoundingClientRect();
						scrubTrack.style.top = (firstSegRect.top - transcriptRect.top) + 'px';
					};
					positionTrack();

					const getTimeFromY = (clientY: number): number => {
						// Find which segment the Y position falls within
						for (let i = segments.length - 1; i >= 0; i--) {
							const rect = segments[i].getBoundingClientRect();
							if (clientY >= rect.top) {
								const progress = Math.min(1, (clientY - rect.top) / rect.height);
								const start = segmentTimes[i];
								const end = i < segmentTimes.length - 1
									? segmentTimes[i + 1]
									: start + 30;
								return start + progress * (end - start);
							}
						}
						return segmentTimes[0] || 0;
					};

					let scrubbing = false;
					let lastScrub = 0;

					scrubTrack.addEventListener('mousedown', (e) => {
						scrubbing = true;
						suppressScroll = true;
						seekTo(getTimeFromY(e.clientY));
						e.preventDefault();
					});

					window.addEventListener('mousemove', (e) => {
						if (!scrubbing) return;
						const now = Date.now();
						if (now - lastScrub < 100) return;
						lastScrub = now;
						seekTo(getTimeFromY(e.clientY));
					});

					window.addEventListener('mouseup', () => {
						scrubbing = false;
					});

					// Click anywhere in a segment to seek to that position
					transcript.addEventListener('click', (e: MouseEvent) => {
						// Don't seek if highlighter is active or user was selecting text
						if (doc.body.classList.contains('obsidian-highlighter-active')) return;
						const selection = window.getSelection();
						if (selection && selection.toString().length > 0) return;

						const seg = (e.target as HTMLElement).closest('.transcript-segment') as HTMLElement | null;
						if (!seg) return;
						const idx = segments.indexOf(seg);
						if (idx < 0) return;

						const start = segmentTimes[idx];
						const end = idx < segmentTimes.length - 1
							? segmentTimes[idx + 1]
							: start + 30;

						// Use caret position to estimate character-level progress
						const textEl = seg.querySelector('.transcript-segment-text');
						if (textEl) {
							const totalLen = (textEl.textContent || '').length;
							if (totalLen > 0) {
								// Resolve caret position from click coordinates
								let caretNode: Node | null = null;
								let caretOffset = 0;
								if ('caretPositionFromPoint' in doc) {
									const pos = (doc as any).caretPositionFromPoint(e.clientX, e.clientY);
									if (pos && textEl.contains(pos.offsetNode)) {
										caretNode = pos.offsetNode;
										caretOffset = pos.offset;
									}
								} else if ('caretRangeFromPoint' in doc) {
									const range = (doc as any).caretRangeFromPoint(e.clientX, e.clientY) as Range | null;
									if (range && textEl.contains(range.startContainer)) {
										caretNode = range.startContainer;
										caretOffset = range.startOffset;
									}
								}

								let charOffset = totalLen;
								if (caretNode) {
									const walker = doc.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
									charOffset = 0;
									let node: Node | null;
									while ((node = walker.nextNode())) {
										if (node === caretNode) {
											charOffset += caretOffset;
											break;
										}
										charOffset += (node.textContent || '').length;
									}
								}

								const progress = Math.min(1, Math.max(0, charOffset / totalLen));
								seekTo(start + progress * (end - start));
								return;
							}
						}

						// Fallback to Y position
						const rect = seg.getBoundingClientRect();
						const progress = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
						seekTo(start + progress * (end - start));
					});
				}
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
			this.observer = this.generateOutline(doc, title);
			if (!this.observer) {
				const leftSidebar = doc.querySelector('.obsidian-reader-left-sidebar') as HTMLElement;
				if (leftSidebar) {
					leftSidebar.classList.add('is-empty');
				}
			}
			this.initializeFootnotes(doc);
			this.initializeCodeHighlighting(doc);
			this.initializeCopyButtons(doc);
			this.initializeLightbox(doc);
			this.linkifyTextUrls(doc);
			this.initializeComments(doc);

			invalidateHighlightCache();
			await loadHighlights();
			applyHighlights();

		} catch (e) {
			console.error('Reader', 'Error during apply:', e);
		}
	}

	static async restore(doc: Document) {
		if (this.hasApplied) {
			this.hasApplied = false;
			this.isActive = false;

			// Send all messages to background before reloading
			const messages: Promise<any>[] = [
				browser.runtime.sendMessage({ action: 'readerModeChanged', isActive: false }).catch(() => {}),
			];

			const host = doc.URL ? new URL(doc.URL).hostname : '';
			if (host.includes('youtube.com') || host.includes('youtu.be')) {
				messages.push(browser.runtime.sendMessage({ action: 'disableYouTubeEmbedRule' }).catch(() => {}));
			}

			await Promise.all(messages);
			window.location.reload();
		}
	}

	static async toggle(doc: Document): Promise<boolean> {
		if (this.isActive) {
			await this.restore(doc);
			// restore() triggers a page reload — return a promise that
			// never resolves to prevent further DOM changes (like
			// removing reader classes) that would flash before reload
			return new Promise(() => {});
		} else {
			await this.apply(doc);
			return true;
		}
	}
}
