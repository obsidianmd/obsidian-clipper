import Defuddle from 'defuddle/full';
import browser from './browser-polyfill';
import { detectBrowser } from './browser-detection';
import { flattenShadowDom as flattenShadowDomUtil } from './flatten-shadow-dom';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import hljs from 'highlight.js';
import { getDomain } from './string-utils';
import type { HighlighterAPI } from './highlighter';
import * as localHighlighter from './highlighter';
import { removeExistingHighlights as localRemoveExistingHighlights } from './highlighter-overlays';

// Bridge: on a live page with reader mode (case 2), content.js already loaded
// and owns the highlighter module. reader-script.js delegates to it via this
// window global to avoid two independent `highlights[]` arrays on the same
// tab. On the standalone reader.html (case 3), no content.js exists — the
// direct import is the only copy and serves as the fallback. Cached after
// first resolution so the fallback spread doesn't re-allocate per call.
let _hl: HighlighterAPI;
function hl(): HighlighterAPI {
	return _hl ??= window.__obsidianHighlighter ?? {
		...localHighlighter,
		removeExistingHighlights: localRemoveExistingHighlights,
		ensureHighlighterCSS: () => Reader.ensureHighlighterCSS(document),
	};
}
import { copyToClipboard } from './clipboard-utils';
import { getMessage, initializeI18n } from './i18n';
import { getFontCss } from './font-utils';
import { createMarkdownContent } from 'defuddle/full';
import { saveFile } from './file-utils';
import { parseForClip } from './clip-utils';
import { updateSidebarWidth, addResizeHandle, cleanupResizeHandlers } from './iframe-resize';
import { setElementHTML, setSVGChildren, serializeChildren } from './dom-utils';

// Mobile viewport settings
const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1';

import { ReaderSettings } from '../types/types';
import { wireTranscript } from './reader-transcript';

interface ReaderContent {
	content: string;
	title?: string;
	author?: string;
	published?: string;
	domain?: string;
	wordCount?: number;
	parseTime?: number;
	extractorType?: string;
}

export class Reader {
	private static hasApplied: boolean = false;
	private static isActive: boolean = false;
	private static programmaticScroll: boolean = false;

	static isReaderPage: boolean = false;

	// Callback for SPA-style navigation on the reader page.
	// Set by reader-view.ts to handle link clicks without full page reload.
	static onNavigate: ((url: string) => void) | null = null;

	// Pre-extracted content to skip Defuddle re-extraction in Reader.apply.
	// Set this before calling apply() to use already-extracted content.
	static preExtractedContent: {
		content: string;
		title?: string;
		author?: string;
		published?: string;
		domain?: string;
		wordCount?: number;
		parseTime?: number;
		extractorType?: string;
	} | null = null;

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
		followLinks: true,
		pinPlayer: true,
		autoScroll: true,
		highlightActiveLine: true,
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
			await Reader.toggleHighlighter(doc);
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
		setSVGChildren(obsidianIcon, '<path d="M94.82 149.44c6.53-1.94 17.13-4.9 29.26-5.71a102.97 102.97 0 0 1-7.64-48.84c1.63-16.51 7.54-30.38 13.25-42.1l3.47-7.14 4.48-9.18c2.35-5 4.08-9.38 4.9-13.56.81-4.07.81-7.64-.2-11.11-1.03-3.47-3.07-7.14-7.15-11.21a17.02 17.02 0 0 0-15.8 3.77l-52.81 47.5a17.12 17.12 0 0 0-5.5 10.2l-4.5 30.18a149.26 149.26 0 0 1 38.24 57.2ZM54.45 106l-1.02 3.06-27.94 62.2a17.33 17.33 0 0 0 3.27 18.96l43.94 45.16a88.7 88.7 0 0 0 8.97-88.5A139.47 139.47 0 0 0 54.45 106Z"/><path d="m82.9 240.79 2.34.2c8.26.2 22.33 1.02 33.64 3.06 9.28 1.73 27.73 6.83 42.82 11.21 11.52 3.47 23.45-5.8 25.08-17.73 1.23-8.67 3.57-18.46 7.75-27.53a94.81 94.81 0 0 0-25.9-40.99 56.48 56.48 0 0 0-29.56-13.35 96.55 96.55 0 0 0-40.99 4.79 98.89 98.89 0 0 1-15.29 80.34h.1Z"/><path d="M201.87 197.76a574.87 574.87 0 0 0 19.78-31.6 8.67 8.67 0 0 0-.61-9.48 185.58 185.58 0 0 1-21.82-35.9c-5.91-14.16-6.73-36.08-6.83-46.69 0-4.07-1.22-8.05-3.77-11.21l-34.16-43.33c0 1.94-.4 3.87-.81 5.81a76.42 76.42 0 0 1-5.71 15.9l-4.7 9.8-3.36 6.72a111.95 111.95 0 0 0-12.03 38.23 93.9 93.9 0 0 0 8.67 47.92 67.9 67.9 0 0 1 39.56 16.52 99.4 99.4 0 0 1 25.8 37.31Z"/>');
		addToObsidianBtn.appendChild(obsidianIcon);
		addToObsidianBtn.addEventListener('click', () => {
			if (Reader.isReaderPage) {
				Reader.toggleReaderPageIframe(doc);
			} else {
				browser.runtime.sendMessage({ action: 'toggleIframe' });
			}
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
					if (Reader.isReaderPage) {
						Reader.copyMarkdownOnReaderPage(doc);
					} else {
						browser.runtime.sendMessage({ action: 'copyMarkdownToClipboard' });
					}
					itemLabel.textContent = getMessage('copied');
					setTimeout(() => { itemLabel.textContent = originalText; }, 2000);
				} else if (action === 'saveFile') {
					clipDropdown.classList.remove('is-open');
					if (Reader.isReaderPage) {
						Reader.saveMarkdownOnReaderPage(doc);
					} else {
						browser.runtime.sendMessage({ action: 'saveMarkdownToFile' });
					}
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

		const getPlayerToggles = () => doc.querySelector('.player-toggles') as HTMLElement | null;

		const showButtons = () => {
			if (scrollHidden) {
				triggerGroup.style.opacity = '';
				if (isMobile) {
					triggerGroup.style.visibility = '';
					triggerGroup.style.pointerEvents = '';
				}
				const floatingToggles = getPlayerToggles();
				if (floatingToggles) {
					floatingToggles.style.opacity = '';
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
					const floatingToggles = getPlayerToggles();
					if (floatingToggles) {
						floatingToggles.style.opacity = '0';
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
		const player = document.querySelector('.pin-player') as HTMLElement | null;
		if (player) return player.getBoundingClientRect().height + 16;
		// When pin-player is off, the toggles bar is sticky independently
		const toggles = document.querySelector('article > .player-toggles') as HTMLElement | null;
		if (toggles) return toggles.getBoundingClientRect().height + 32;
		return 0;
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

	private static async extractContent(doc: Document): Promise<ReaderContent> {
		// Use pre-extracted content if available (set by reader-view.ts)
		if (this.preExtractedContent) {
			const pre = this.preExtractedContent;
			this.preExtractedContent = null;
			return pre;
		}

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
			item.setAttribute('data-heading-id', heading.id);
			item.textContent = heading.textContent;
			
			item.addEventListener('click', () => {
				this.scrollToElement(heading);
			});

			outline.appendChild(item);
			outlineItems.set(heading, item);
			
			// Update tracking variables
			lastHeadingAtLevel[level] = { element: heading, depth };
		});

		const setActiveOutlineItem = (heading: Element) => {
			const item = outlineItems.get(heading);
			if (!item) return;
			outlineItems.forEach((outlineItem) => {
				outlineItem.classList.remove('active');
			});
			item.classList.add('active');
			const currentHeadingTop = heading.getBoundingClientRect().top;
			outlineItems.forEach((outlineItem, itemHeading) => {
				if (itemHeading.getBoundingClientRect().top < currentHeadingTop) {
					outlineItem.classList.add('faint');
				} else {
					outlineItem.classList.remove('faint');
				}
			});
		};

		// Set up intersection observer for headings
		const allHeadings = [titleHeading, ...headings].filter(Boolean) as Element[];

		// Suppress observer until user scrolls — on initial load images
		// haven't rendered yet so headings below the fold appear in-view.
		let outlineReady = !!window.location.hash || window.scrollY > 0;
		if (!outlineReady) {
			if (allHeadings[0]) setActiveOutlineItem(allHeadings[0]);
			const onFirstScroll = () => {
				outlineReady = true;
				window.removeEventListener('scroll', onFirstScroll);
				Reader.outlineScrollHandler = null;
			};
			window.addEventListener('scroll', onFirstScroll, { passive: true });
			Reader.outlineScrollHandler = onFirstScroll;
		}

		const observerCallback = (entries: IntersectionObserverEntry[]) => {
			if (!outlineReady) return;
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					setActiveOutlineItem(entry.target);
				} else if (entry.rootBounds && entry.boundingClientRect.top > entry.rootBounds.bottom) {
					// Heading exited the zone going down (user scrolling up)
					// Activate the heading above it
					const idx = allHeadings.indexOf(entry.target);
					if (idx > 0) {
						setActiveOutlineItem(allHeadings[idx - 1]);
					}
				}
			});
		};

		const createOutlineObserver = () => {
			const stickyOffset = this.getStickyOffset();
			const topPercent = stickyOffset > 0
				? Math.round(stickyOffset / window.innerHeight * 100 + 2)
				: 5;
			const bottomPercent = 100 - topPercent - 15;
			return new IntersectionObserver(observerCallback, {
				rootMargin: `-${topPercent}% 0px -${bottomPercent}% 0px`,
				threshold: 0
			});
		};

		let observer = createOutlineObserver();

		// Recreate observer when sticky player appears/resizes
		const pinPlayer = doc.querySelector('.pin-player');
		if (pinPlayer) {
			const resizeObserver = new ResizeObserver(() => {
				observer.disconnect();
				observer = createOutlineObserver();
				if (titleHeading) observer.observe(titleHeading);
				headings.forEach(heading => observer.observe(heading));
			});
			resizeObserver.observe(pinPlayer);
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
				const syncObs = new MutationObserver(() => {
					clone.className = (item as HTMLElement).className;
				});
				syncObs.observe(item, { attributes: true, attributeFilter: ['class'] });
				this.outlineMutationObservers.push(syncObs);
			});
		}

		return observer;
	}

	private static observer: IntersectionObserver | null = null;
	private static highlighterObserver: MutationObserver | null = null;
	private static themeModeObserver: MutationObserver | null = null;
	private static activePopover: HTMLElement | null = null;
	private static activeFootnoteLink: HTMLAnchorElement | null = null;
	private static footnoteClickHandler: ((e: Event) => void) | null = null;
	private static footnoteScrollHandler: (() => void) | null = null;
	private static footnoteResizeHandler: (() => void) | null = null;
	private static lightboxKeyHandler: ((e: KeyboardEvent) => void) | null = null;
	private static outlineScrollHandler: (() => void) | null = null;
	private static outlineMutationObservers: MutationObserver[] = [];

	// Clean up event listeners and DOM elements from the previous page.
	// Called before updateReaderContent to prevent stale state.
	private static teardownContent(doc: Document) {
		// Outline
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		if (this.outlineScrollHandler) {
			window.removeEventListener('scroll', this.outlineScrollHandler);
			this.outlineScrollHandler = null;
		}
		for (const obs of this.outlineMutationObservers) obs.disconnect();
		this.outlineMutationObservers = [];
		const outline = doc.querySelector('.obsidian-reader-outline') as HTMLElement;
		if (outline) outline.textContent = '';
		const outlineOverlay = doc.querySelector('.obsidian-reader-outline-overlay') as HTMLElement;
		if (outlineOverlay) outlineOverlay.textContent = '';

		// Footnotes
		doc.querySelector('.footnote-popover')?.remove();
		if (this.footnoteClickHandler) {
			doc.removeEventListener('click', this.footnoteClickHandler);
			this.footnoteClickHandler = null;
		}
		if (this.footnoteScrollHandler) {
			doc.removeEventListener('scroll', this.footnoteScrollHandler);
			this.footnoteScrollHandler = null;
		}
		if (this.footnoteResizeHandler) {
			window.removeEventListener('resize', this.footnoteResizeHandler);
			this.footnoteResizeHandler = null;
		}
		this.activePopover = null;
		this.activeFootnoteLink = null;

		// Lightbox
		if (this.lightboxKeyHandler) {
			doc.removeEventListener('keydown', this.lightboxKeyHandler);
			this.lightboxKeyHandler = null;
		}
		doc.querySelector('.obsidian-reader-lightbox')?.remove();

		// Highlights
		hl().removeExistingHighlights();
	}

	private static initializeFootnotes(doc: Document) {
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
		this.footnoteClickHandler = (e: Event) => {
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
		};
		doc.addEventListener('click', this.footnoteClickHandler);

		this.footnoteScrollHandler = () => {
			if (this.activeFootnoteLink && this.activePopover) {
				this.positionPopover(this.activePopover, this.activeFootnoteLink);
			}
		};
		this.footnoteResizeHandler = this.footnoteScrollHandler;
		doc.addEventListener('scroll', this.footnoteScrollHandler, { passive: true });
		window.addEventListener('resize', this.footnoteResizeHandler);
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
		this.lightboxKeyHandler = (e: KeyboardEvent) => {
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
		};
		doc.addEventListener('keydown', this.lightboxKeyHandler);
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
		let resolveViewTransition: (() => void) | undefined;
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
			let youtubeVideoElement: HTMLVideoElement | null = null;
			const host = doc.URL ? new URL(doc.URL).hostname : '';
			const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
			// Browser type is only needed for YouTube-specific behavior
			const browserType = isYouTube ? await detectBrowser() : '';
			if (isYouTube) {
				const videoElement = doc.querySelector('video');
				if (videoElement) {
					videoTimestamp = Math.floor(videoElement.currentTime);
					videoWasPlaying = !videoElement.paused;
					// Chromium's iframe embed works via declarativeNetRequest.
					// Safari/Firefox can't modify headers, so we preserve
					// the native video element instead.
					if (!['chrome', 'brave', 'edge'].includes(browserType)) {
						youtubeVideoElement = videoElement;
						videoElement.remove();
					}
				}
			}

			let spinner: HTMLElement;
			let article: HTMLElement;
			let main: HTMLElement;
			let footer: HTMLElement;

			// Flatten shadow DOM before cloning (cloneNode doesn't copy shadow DOM)
			await flattenShadowDomUtil(doc);

			// Clone document and start Defuddle before the view transition
			// so content extraction runs during the crossfade animation
			const docClone = doc.cloneNode(true) as Document;
			docClone.getElementById('obsidian-clipper-container')?.remove();
			Object.defineProperty(docClone, 'URL', { value: doc.URL, configurable: true });
			const contentPromise = this.extractContent(docClone);

			// Use view transition for smooth crossfade into reader mode
			// Skip on the reader page where we're already in reader context
			if ('startViewTransition' in document && !this.isReaderPage) {
				await new Promise<void>(resolve => {
					try {
						const vt = (document as any).startViewTransition(() => {
							resolve();
							return new Promise<void>(r => { resolveViewTransition = r; });
						});
						vt.ready.catch(() => {});
						vt.finished.catch(() => {});
					} catch {
						resolve();
					}
				});
			}

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

			// Clear all html element attributes (e.g. scroll-locking classes/styles from the original page)
			while (htmlElement.attributes.length > 0) {
				htmlElement.removeAttribute(htmlElement.attributes[0].name);
			}

			// Restore lang and dir if they existed
			if (lang) htmlElement.setAttribute('lang', lang);
			if (dir) htmlElement.setAttribute('dir', dir);

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
			main = doc.createElement('main');

			// Create article placeholder with loading spinner
			article = doc.createElement('article');
			spinner = doc.createElement('div');
			spinner.className = 'obsidian-reader-loading';
			const spinnerText = doc.createElement('div');
			spinnerText.className = 'obsidian-reader-loading-text';
			spinnerText.textContent = getMessage('readerLoading');
			spinner.appendChild(spinnerText);
			article.appendChild(spinner);
			main.appendChild(article);

			readerContent.appendChild(main);

			// Create footer (hidden until content loads)
			footer = doc.createElement('div');
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

			// Load the highlighter stylesheet. On a live page (case 2), this
			// goes through content.js's bridge. On reader.html (case 3), the
			// local implementation injects the <link> tag directly.
			hl().ensureHighlighterCSS();

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
				hl().toggleHighlighterMenu(true);
			}

			// Re-attach the clipper iframe container only if it was
			// detached (not present when body clone was skipped)
			if (clipperIframeContainer && !doc.body.contains(clipperIframeContainer)) {
				doc.body.appendChild(clipperIframeContainer);
			}

			// D: toggle dark mode (visual only, doesn't change appearance setting)
			Reader.registerHotkey(doc, 'd', () => {
				const html = doc.documentElement;
				const isDark = html.classList.contains('theme-dark');
				html.classList.remove('theme-light', 'theme-dark');
				html.classList.add(isDark ? 'theme-light' : 'theme-dark');
				this.applyTheme(doc);
			});

			// H: toggle highlighter
			Reader.registerHotkey(doc, 'h', () => Reader.toggleHighlighter(doc));

			// Selection → highlight affordance. When highlighter is OFF and the
			// user makes a normal text selection inside the article, surface a
			// floating button that converts the selection into a highlight.
			Reader.registerSelectionToHighlightButton(doc);

			// Set up color scheme media query listener
			this.colorSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			this.colorSchemeMediaQuery.addEventListener('change', (e) => this.handleColorSchemeChange(e, doc));

			this.isActive = true;

			// Signal view transition that DOM update is complete
			if (resolveViewTransition) {
				resolveViewTransition();
			}

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

			this.populateArticle(doc, main, article, { content, title, author, published, domain, wordCount, parseTime });

			// Use the Defuddle-extracted title (article title only) instead of
			// document.title (which often includes the site name suffix).
			if (title) hl().setPageTitle(title);

			// On YouTube, replace the Defuddle-generated iframe with the
			// preserved native video element, or fall back to embed
			if (isYouTube) {
				const iframe = article.querySelector('iframe[src*="youtube.com/embed/"]') as HTMLIFrameElement;
				if (iframe && youtubeVideoElement) {
					// Use the original video element instead of an iframe
					youtubeVideoElement.className = 'reader-video-player';
					youtubeVideoElement.removeAttribute('style');
					youtubeVideoElement.setAttribute('controls', '');
					// YouTube's JS may keep resetting attributes —
					// use a MutationObserver to enforce our settings
					const videoObs = new MutationObserver(() => {
						if (!youtubeVideoElement!.hasAttribute('controls')) {
							youtubeVideoElement!.setAttribute('controls', '');
						}
						if (youtubeVideoElement!.className !== 'reader-video-player') {
							youtubeVideoElement!.className = 'reader-video-player';
						}
					});
					videoObs.observe(youtubeVideoElement, {
						attributes: true,
						attributeFilter: ['controls', 'class', 'style']
					});
					const videoWrapper = doc.createElement('div');
					videoWrapper.className = 'reader-video-wrapper';
					videoWrapper.appendChild(youtubeVideoElement);
					iframe.replaceWith(videoWrapper);
				} else if (iframe) {
					// Fallback: use embed with header modification (Chrome)
					// or thumbnail (Safari)
					const embedUrl = new URL(iframe.src);
					const videoId = embedUrl.pathname.split('/').pop();
					const isSafari = ['safari', 'mobile-safari', 'ipad-os'].includes(browserType);

					if (isSafari && videoId) {
						const watchUrl = 'https://www.youtube.com/watch?v=' + videoId
							+ (videoTimestamp > 0 ? '&t=' + videoTimestamp : '');
						const thumbnail = doc.createElement('a');
						thumbnail.href = watchUrl;
						thumbnail.target = '_blank';
						thumbnail.rel = 'noopener';
						thumbnail.style.cssText = 'display:block;position:relative;aspect-ratio:16/9;max-width:100%;background:#000;border-radius:8px;overflow:hidden;';
						const thumbImg = doc.createElement('img');
						thumbImg.src = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
						thumbImg.style.cssText = 'width:100%;height:100%;object-fit:cover;mix-blend-mode:normal!important;';
						const playSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
						playSvg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;mix-blend-mode:normal!important;';
						playSvg.setAttribute('viewBox', '0 0 68 48');
						setSVGChildren(playSvg,
							'<path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="red"/>'
							+ '<path d="M45 24L27 14v20" fill="white"/>');
						thumbnail.replaceChildren(thumbImg, playSvg);
						iframe.replaceWith(thumbnail);
					} else {
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

			// Store original article HTML before wireTranscript modifies
			// the DOM (moves timestamps, wraps text, adds scrub track).
			this.storeOriginalHtml(article);

			wireTranscript(doc, article, this.settings, {
				getStickyOffset: () => this.getStickyOffset(),
				scrollTo: (y) => this.scrollTo(y),
				programmaticScroll: () => this.programmaticScroll,
			}, (key, value) => {
				(this.settings as any)[key] = value;
				this.saveSettings();
			});

			if (extractorType) {
				doc.documentElement.setAttribute('data-reader-extractor', extractorType);
			}

			await this.initializeContentFeatures(doc, title);

		} catch (e) {
			console.error('Reader', 'Error during apply:', e);
			if (resolveViewTransition) resolveViewTransition();
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

	// Floating "Highlight" button that appears on text selection while
	// highlighter is OFF, and converts the selection into a highlight. When
	// highlighter is ON, the usual mouseup path in highlighter-overlays.ts
	// handles selections directly, so we stay out of its way.
	private static registerSelectionToHighlightButton(doc: Document) {
		// Idempotent: if Reader.apply runs again without a page reload (e.g.
		// SPA navigation where we re-enter reader), don't stack a second
		// button + three more listeners on the same document.
		if (doc.querySelector('.obsidian-selection-action')) return;
		const btn = doc.createElement('button');
		btn.type = 'button';
		btn.className = 'obsidian-selection-action';
		btn.setAttribute('aria-label', getMessage('highlightSelection'));
		setElementHTML(btn, `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg><span>${getMessage('highlightSelection')}</span>`);
		btn.style.display = 'none';
		// Preserve the selection when the pointer goes down on the button —
		// otherwise the browser clears it before click handlers run.
		btn.addEventListener('mousedown', e => e.preventDefault());
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const sel = doc.getSelection();
			if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
			// Create the highlight without entering highlighter mode — the
			// user's intent is a single edit, not a session. handleTextSelection
			// reads the live selection and clears it on return.
			hl().handleTextSelection(sel);
			hide();
		});
		doc.body.appendChild(btn);

		const hide = () => { btn.style.display = 'none'; };

		const update = () => {
			if (!this.isActive) return hide();
			if (doc.body.classList.contains('obsidian-highlighter-active')) return hide();
			const sel = doc.getSelection();
			if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hide();
			const range = sel.getRangeAt(0);
			const article = doc.querySelector('.obsidian-reader-content article');
			if (!article || !article.contains(range.commonAncestorContainer)) return hide();
			const rects = range.getClientRects();
			if (rects.length === 0) return hide();
			const last = rects[rects.length - 1];
			btn.style.display = 'flex';
			// Ensure the button stays within the viewport.
			const btnWidth = btn.offsetWidth || 90;
			const idealLeft = last.right + 2;
			const clampedLeft = Math.min(idealLeft, window.innerWidth - btnWidth - 4);
			btn.style.left = `${Math.max(4, clampedLeft) + window.scrollX}px`;
			btn.style.top = `${last.bottom + window.scrollY - 6}px`;
		};

		// mouseup / keyup catch the end of a drag-select or shift-arrow select;
		// selectionchange catches collapse-by-click so we can hide promptly.
		doc.addEventListener('mouseup', () => setTimeout(update, 0));
		doc.addEventListener('keyup', (e) => {
			if (e.shiftKey || e.key === 'Shift') setTimeout(update, 0);
		});
		// selectionchange covers mobile (long-press + handles, no mouseup)
		// and desktop keyboard selection (Ctrl+A, Shift+arrows). Debounced
		// to avoid repositioning the button mid-drag on desktop.
		let selChangeTimer: ReturnType<typeof setTimeout> | null = null;
		doc.addEventListener('selectionchange', () => {
			const sel = doc.getSelection();
			if (!sel || sel.isCollapsed) {
				if (selChangeTimer) { clearTimeout(selChangeTimer); selChangeTimer = null; }
				hide();
			} else {
				if (selChangeTimer) clearTimeout(selChangeTimer);
				selChangeTimer = setTimeout(update, 200);
			}
		});
		window.addEventListener('resize', hide);
	}

	// Single-key hotkey wired to the reader document. Ignores presses while
	// reader is inactive, while modifier keys are held, or while the user is
	// typing in an input.
	private static registerHotkey(doc: Document, key: string, handler: () => void) {
		const lowerKey = key.toLowerCase();
		doc.addEventListener('keydown', (e) => {
			if (!this.isActive) return;
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (e.key.toLowerCase() !== lowerKey) return;
			const tag = (document.activeElement as HTMLElement)?.tagName;
			if (tag === 'INPUT' || tag === 'TEXTAREA') return;
			handler();
		});
	}

	// Inject highlighter.css for the standalone reader.html (case 3, no
	// content.js). On live pages (case 2), hl() routes to content.js's
	// Promise-cached version instead.
	static ensureHighlighterCSS(doc: Document): void {
		if (doc.getElementById('obsidian-highlighter-stylesheet')) return;
		const link = doc.createElement('link');
		link.id = 'obsidian-highlighter-stylesheet';
		link.rel = 'stylesheet';
		link.href = browser.runtime.getURL('highlighter.css');
		(doc.head || doc.documentElement).appendChild(link);
	}

	static toggleHighlighter(doc: Document): void {
		const willBeActive = !doc.body.classList.contains('obsidian-highlighter-active');
		hl().toggleHighlighterMenu(willBeActive);
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

	private static initializeFollowLinks(doc: Document): void {
		if (!this.settings.followLinks) return;

		const article = doc.querySelector('.obsidian-reader-content article');
		if (!article) return;

		article.addEventListener('click', (e: Event) => {
			const link = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
			if (!link) return;

			const href = link.href;
			if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
			if (link.getAttribute('href')?.startsWith('#')) return;

			e.preventDefault();

			if (this.isReaderPage && this.onNavigate) {
				this.onNavigate(href);
			} else if (this.isReaderPage) {
				window.location.href = browser.runtime.getURL('reader.html?url=' + encodeURIComponent(href));
			} else {
				browser.runtime.sendMessage({ action: 'openReaderPage', url: href });
			}
		});
	}

	// Build title, metadata, article HTML, and footer into the given main element.
	// Shared between apply() and updateReaderContent().
	private static populateArticle(
		doc: Document, main: HTMLElement, article: HTMLElement, content: ReaderContent
	): void {
		// Title
		if (content.title) {
			const h1 = doc.createElement('h1');
			h1.textContent = content.title;
			main.insertBefore(h1, article);
		}

		// Metadata
		let formattedDate = '';
		if (content.published) {
			try {
				const date = new Date(content.published.split(',')[0].trim());
				formattedDate = !isNaN(date.getTime())
					? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date)
					: content.published;
			} catch { formattedDate = content.published || ''; }
		}
		const authors = content.author ? content.author.split(/,\s*/) : [];
		const metadataItems: {text: string, type: string}[] = [
			...authors.map(a => ({text: a, type: 'author'})),
			formattedDate ? {text: formattedDate, type: 'date'} : null,
			content.domain ? {text: content.domain, type: 'domain'} : null,
		].filter((item): item is {text: string, type: string} => item !== null);

		if (metadataItems.length > 0) {
			const metadata = doc.createElement('div');
			metadata.className = 'metadata';
			const metadataDetails = doc.createElement('div');
			metadataDetails.className = 'metadata-details';
			metadataItems.forEach((item, index) => {
				if (index > 0) {
					const sep = doc.createElement('span');
					sep.textContent = ' · ';
					metadataDetails.appendChild(sep);
				}
				const span = doc.createElement('span');
				if (item.type === 'author') {
					span.className = 'metadata-author';
					span.textContent = item.text;
				} else if (item.type === 'domain' && content.domain) {
					const domain = content.domain;
					const link = doc.createElement('a');
					link.href = doc.URL;
					link.textContent = domain;
					span.appendChild(link);

					// Async: append highlight count after domain if any exist
					this.getHighlightCountForDomain(domain).then(count => {
						if (count > 0) {
							const sep = doc.createElement('span');
							sep.textContent = ' · ';
							metadataDetails.appendChild(sep);

							const countLink = doc.createElement('a');
							countLink.href = '#';
							countLink.className = 'metadata-highlights';
							countLink.textContent = `${count} highlight${count === 1 ? '' : 's'}`;
							countLink.addEventListener('click', (e) => {
								e.preventDefault();
								browser.runtime.sendMessage({ action: 'openHighlights', domain });
							});
							metadataDetails.appendChild(countLink);
						}
					});
				} else {
					span.textContent = item.text;
				}
				metadataDetails.appendChild(span);
			});
			metadata.appendChild(metadataDetails);
			main.insertBefore(metadata, article);
		}

		// Article content
		if (content.content) {
			const contentParser = new DOMParser();
			const contentDoc = contentParser.parseFromString(content.content, 'text/html');
			while (contentDoc.body.firstChild) {
				article.appendChild(doc.adoptNode(contentDoc.body.firstChild));
			}
		}

		// Footer
		const footer = doc.querySelector('.obsidian-reader-footer') as HTMLElement | null;
		if (footer) {
			const footerItems = [
				'Obsidian Reader',
				content.wordCount ? new Intl.NumberFormat().format(content.wordCount) + ' words' : '',
				content.parseTime ? 'parsed in ' + new Intl.NumberFormat().format(content.parseTime) + ' ms' : '',
			].filter(Boolean);
			footer.textContent = footerItems.join(' · ');
			footer.style.display = '';
		}
	}

	// Wrap each <table> in a scroll container so wide tables can scroll
	// horizontally on mobile without blowing out the article width.
	private static storeOriginalHtml(article: Element): void {
		const clone = article.cloneNode(true) as Element;
		clone.querySelectorAll('span.timestamp').forEach(span => {
			span.replaceWith(span.textContent || '');
		});
		article.setAttribute('data-original-html', serializeChildren(clone));
	}

	private static wrapTables(doc: Document) {
		const tables = doc.querySelectorAll('article table');
		tables.forEach(table => {
			if (table.parentElement?.classList.contains('table-wrapper')) return;
			const wrapper = doc.createElement('div');
			wrapper.className = 'table-wrapper';
			table.parentNode?.insertBefore(wrapper, table);
			wrapper.appendChild(table);
		});
	}

	// Run all content-dependent feature initializations.
	// Shared between apply() and updateReaderContent().
	private static async initializeContentFeatures(doc: Document, title?: string): Promise<void> {
		this.observer = this.generateOutline(doc, title);
		const leftSidebar = doc.querySelector('.obsidian-reader-left-sidebar') as HTMLElement;
		if (leftSidebar) {
			leftSidebar.classList.toggle('is-empty', !this.observer);
		}
		this.initializeFootnotes(doc);
		this.initializeCodeHighlighting(doc);
		this.initializeCopyButtons(doc);
		this.initializeLightbox(doc);
		this.wrapTables(doc);
		this.linkifyTextUrls(doc);
		this.initializeComments(doc);
		this.initializeFollowLinks(doc);

		hl().invalidateHighlightCache();
		await hl().loadHighlights();
		hl().applyHighlights();
	}

	private static async getHighlightCountForDomain(domain: string): Promise<number> {
		const result = await browser.storage.local.get('highlights');
		const allHighlights = (result.highlights || {}) as Record<string, { highlights: any[]; url: string }>;
		let count = 0;
		for (const stored of Object.values(allHighlights)) {
			try {
				const hostname = new URL(stored.url).hostname.replace(/^www\./, '');
				if (hostname === domain.replace(/^www\./, '')) {
					count += stored.highlights.length;
				}
			} catch { /* skip invalid URLs */ }
		}
		return count;
	}

	// Replace article content in-place for SPA navigation on the reader page.
	static async updateReaderContent(doc: Document, content: ReaderContent): Promise<void> {
		const main = doc.querySelector('.obsidian-reader-content main') as HTMLElement | null;
		if (!main) return;

		this.teardownContent(doc);
		main.textContent = '';

		const article = doc.createElement('article');
		main.appendChild(article);

		this.populateArticle(doc, main, article, content);

		const host = doc.URL ? new URL(doc.URL).hostname : '';
		if (host.includes('youtube.com') || host.includes('youtu.be')) {
			const iframe = article.querySelector('iframe[src*="youtube.com/embed/"]') as HTMLIFrameElement;
			if (iframe) {
				await browser.runtime.sendMessage({
					action: 'enableYouTubeEmbedRule'
				}).catch(() => {});
				iframe.src = iframe.src;
			}
		}

		this.storeOriginalHtml(article);

		wireTranscript(doc, article, this.settings, {
			getStickyOffset: () => this.getStickyOffset(),
			scrollTo: (y) => this.scrollTo(y),
			programmaticScroll: () => this.programmaticScroll,
		}, (key, value) => {
			(this.settings as any)[key] = value;
			this.saveSettings();
		});

		await this.initializeContentFeatures(doc, content.title);
	}

	// --- Reader page helpers (extension page context) ---

	static async toggleReaderPageIframe(doc: Document): Promise<void> {
		const containerId = 'obsidian-clipper-container';
		const iframeId = 'obsidian-clipper-iframe';

		const existing = doc.getElementById(containerId);
		if (existing) {
			existing.classList.add('is-closing');
			updateSidebarWidth(doc, null);
			cleanupResizeHandlers(doc);
			existing.addEventListener('animationend', () => {
				existing.remove();
				hl().repositionHighlights();
			}, { once: true });
			return;
		}

		const container = doc.createElement('div');
		container.id = containerId;
		container.classList.add('is-open');

		const { clipperIframeWidth, clipperIframeHeight } = await browser.storage.local.get(['clipperIframeWidth', 'clipperIframeHeight']);
		if (clipperIframeWidth) container.style.width = `${clipperIframeWidth}px`;
		if (clipperIframeHeight) container.style.height = `${clipperIframeHeight}px`;

		const iframe = doc.createElement('iframe');
		iframe.id = iframeId;
		iframe.allow = 'clipboard-write; web-share';
		// Pass the article URL so the side panel can identify the page
		// (tabs.get() can't see extension page URLs without the tabs permission)
		iframe.src = browser.runtime.getURL('side-panel.html?context=iframe&readerUrl=' + encodeURIComponent(doc.URL));
		container.appendChild(iframe);

		const resizeCallbacks = {
			onResize: () => hl().repositionHighlights(),
			onResizeEnd: () => hl().repositionHighlights(),
		};
		addResizeHandle(doc, container, 'w', resizeCallbacks);
		addResizeHandle(doc, container, 's', resizeCallbacks);
		addResizeHandle(doc, container, 'sw', resizeCallbacks);

		doc.body.appendChild(container);
		updateSidebarWidth(doc, container);
		container.addEventListener('animationend', () => hl().repositionHighlights(), { once: true });
	}

	static copyMarkdownOnReaderPage(doc: Document): void {
		try {
			const defuddled = parseForClip(doc);
			const markdown = createMarkdownContent(defuddled.content, doc.URL);
			navigator.clipboard.writeText(markdown).catch(() => {
				const textArea = doc.createElement('textarea');
				textArea.value = markdown;
				doc.body.appendChild(textArea);
				textArea.select();
				doc.execCommand('copy');
				doc.body.removeChild(textArea);
			});
		} catch (err) {
			console.error('Failed to copy markdown:', err);
		}
	}

	static async saveMarkdownOnReaderPage(doc: Document): Promise<void> {
		try {
			const defuddled = parseForClip(doc);
			const markdown = createMarkdownContent(defuddled.content, doc.URL);
			const title = defuddled.title || doc.title || 'Untitled';
			const fileName = title.replace(/[/\\?%*:|"<>]/g, '-');
			await saveFile({ content: markdown, fileName, mimeType: 'text/markdown' });
		} catch (err) {
			console.error('Failed to save markdown:', err);
		}
	}
}
