import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeSettingToggle } from '../utils/ui-utils';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { initializeIcons } from '../icons/icons';
import { debounce } from '../utils/debounce';
import { getMessage } from '../utils/i18n';

const THEME_ORDER = ['default', 'flexoki', 'ayu', 'catppuccin', 'everforest', 'gruvbox', 'nord', 'rose-pine', 'solarized'];

const THEME_DISPLAY_NAMES: Record<string, string> = {
	default: 'Default',
	flexoki: 'Flexoki',
	ayu: 'Ayu',
	catppuccin: 'Catppuccin',
	everforest: 'Everforest',
	gruvbox: 'Gruvbox',
	'rose-pine': 'Rosé Pine',
	nord: 'Nord',
	solarized: 'Solarized',
};

function getIsDark(appearance: string): boolean {
	if (appearance === 'dark') return true;
	if (appearance === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches;
	return false;
}

function applyThemeClasses(el: HTMLElement, themeId: string, isDark: boolean): void {
	if (themeId !== 'default') {
		el.dataset.readerTheme = themeId;
	} else {
		delete el.dataset.readerTheme;
	}
	el.classList.toggle('theme-dark', isDark);
	el.classList.toggle('theme-light', !isDark);
}

function buildThemeGrid(
	container: HTMLElement,
	selectedTheme: string,
	isDark: boolean,
	customFontValue: string | null,
	onSelect: (themeId: string) => void,
): void {
	container.innerHTML = '';

	for (const themeId of THEME_ORDER) {
		const option = document.createElement('div');
		option.className = 'reader-theme-option obsidian-reader-active' + (themeId === selectedTheme ? ' is-active' : '');
		option.dataset.scheme = themeId;
		option.setAttribute('role', 'button');
		option.setAttribute('tabindex', '0');

		applyThemeClasses(option, themeId, isDark);

		const swatch = document.createElement('div');
		swatch.className = 'reader-theme-swatch';

		const inner = document.createElement('div');
		inner.className = 'reader-theme-inner';
		if (customFontValue) {
			option.style.setProperty('--obsidian-reader-font-family', customFontValue);
		}

		const title = document.createElement('div');
		title.className = 'reader-theme-inner-title';
		title.textContent = THEME_DISPLAY_NAMES[themeId] ?? themeId;

		const meta = document.createElement('div');
		meta.className = 'reader-theme-inner-meta';
		meta.textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

		const body = document.createElement('div');
		body.className = 'reader-theme-inner-body';
		body.textContent = 'File over app is a philosophy: if you want to create digital artifacts that last, they must be files you can control, in formats that are easy to retrieve and read.';

		inner.appendChild(title);
		inner.appendChild(meta);
		inner.appendChild(body);
		swatch.appendChild(inner);

		option.appendChild(swatch);
		container.appendChild(option);

		option.addEventListener('click', () => {
			container.querySelectorAll('.reader-theme-option').forEach(el => el.classList.remove('is-active'));
			option.classList.add('is-active');
			onSelect(themeId);
		});

		option.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				option.click();
			}
		});
	}
}

function isFontAvailable(fontName: string): boolean {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return true;
	const text = 'abcdefghijklmnopqrstuvwxyz0123456789';
	ctx.font = '16px monospace';
	const baseWidth = ctx.measureText(text).width;
	ctx.font = `16px "${fontName}", monospace`;
	return ctx.measureText(text).width !== baseWidth;
}

function getFontStackCss(fonts: string[]): string | null {
	if (fonts.length === 0) return null;
	return fonts.map(f => `"${f}"`).join(', ') + ', system-ui, -apple-system, sans-serif';
}

function updatePreview() {
	const preview = document.getElementById('reader-preview');
	if (!preview) return;

	const { lightTheme, darkTheme, appearance, defaultFont, fontSize, lineHeight, colorLinks } = generalSettings.readerSettings;
	const isDark = getIsDark(appearance);
	const effectiveTheme = isDark && darkTheme !== 'same' ? darkTheme : lightTheme;

	applyThemeClasses(preview, effectiveTheme, isDark);

	const fontStack = defaultFont ? getFontStackCss([defaultFont]) : null;
	if (fontStack) {
		preview.style.setProperty('--obsidian-reader-font-family', fontStack);
	} else {
		preview.style.removeProperty('--obsidian-reader-font-family');
	}

	preview.style.setProperty('--obsidian-reader-font-size', `${fontSize}px`);
	preview.style.setProperty('--obsidian-reader-line-height', String(lineHeight));
	preview.classList.toggle('color-links', colorLinks);
}

function rebuildGrids(lightGrid: HTMLElement | null, darkGrid: HTMLElement | null) {
	const { lightTheme, darkTheme, appearance, defaultFont } = generalSettings.readerSettings;
	const isDarkMode = getIsDark(appearance);
	const fontStack = defaultFont ? getFontStackCss([defaultFont]) : null;

	if (lightGrid) {
		buildThemeGrid(lightGrid, lightTheme, isDarkMode, fontStack, (themeId) => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, lightTheme: themeId } });
			updatePreview();
		});
	}

	if (darkGrid) {
		const effectiveDark = darkTheme === 'same' ? lightTheme : darkTheme;
		buildThemeGrid(darkGrid, effectiveDark, true, fontStack, (themeId) => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, darkTheme: themeId } });
			updatePreview();
		});
	}
}

export function refreshReaderPreview(): void {
	updatePreview();
	updateFontList();
	const lightGrid = document.getElementById('reader-theme-grid-light') as HTMLElement;
	const darkGrid = document.getElementById('reader-theme-grid-dark') as HTMLElement;
	rebuildGrids(lightGrid, darkGrid);
}

export function updateFontList(): void {
	const fontList = document.getElementById('reader-font-list') as HTMLUListElement;
	if (!fontList) return;

	fontList.textContent = '';

	const setDefault = (fontValue: string) => {
		generalSettings.readerSettings.defaultFont = fontValue;
		saveSettings({ ...generalSettings });
		updateFontList();
		updatePreview();
		const lightGrid = document.getElementById('reader-theme-grid-light') as HTMLElement;
		const darkGrid = document.getElementById('reader-theme-grid-dark') as HTMLElement;
		rebuildGrids(lightGrid, darkGrid);
	};

	const createDefaultTag = (fontValue: string, isDefault: boolean): HTMLDivElement => {
		const tag = document.createElement('div');
		if (isDefault) {
			tag.className = 'setting-item-default-btn is-active';
			tag.textContent = getMessage('readerFontDefault');
		} else {
			tag.className = 'setting-item-default-btn';
			tag.textContent = getMessage('readerFontSetDefault');
			tag.addEventListener('click', (e) => {
				e.stopPropagation();
				setDefault(fontValue);
			});
		}
		return tag;
	};

	// System font entry (non-removable)
	const systemLi = document.createElement('li');

	const systemSpan = document.createElement('span');
	systemSpan.textContent = getMessage('readerFontSystemFont');
	systemLi.appendChild(systemSpan);

	systemLi.appendChild(createDefaultTag('', generalSettings.readerSettings.defaultFont === ''));

	const systemRemoveBtn = createElementWithClass('button', 'setting-item-list-remove clickable-icon');
	systemRemoveBtn.setAttribute('type', 'button');
	(systemRemoveBtn as HTMLButtonElement).disabled = true;
	(systemRemoveBtn as HTMLButtonElement).style.opacity = '0';
	systemRemoveBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
	systemLi.appendChild(systemRemoveBtn);

	fontList.appendChild(systemLi);

	// Custom font entries (alphabetized)
	const sortedFonts = [...generalSettings.readerSettings.fonts].sort((a, b) => a.localeCompare(b));
	for (const font of sortedFonts) {
		const li = document.createElement('li');

		const span = document.createElement('span');
		span.textContent = font;
		li.appendChild(span);

		if (!isFontAvailable(font)) {
			const error = createElementWithClass('span', 'setting-item-error mod-warning');
			error.textContent = getMessage('readerFontNotFound');
			li.appendChild(error);
		}

		li.appendChild(createDefaultTag(font, generalSettings.readerSettings.defaultFont === font));

		const removeBtn = createElementWithClass('button', 'setting-item-list-remove clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('aria-label', 'Remove font');
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		li.appendChild(removeBtn);

		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const idx = generalSettings.readerSettings.fonts.indexOf(font);
			if (idx !== -1) generalSettings.readerSettings.fonts.splice(idx, 1);
			if (generalSettings.readerSettings.defaultFont === font) {
				generalSettings.readerSettings.defaultFont = '';
			}
			saveSettings({ ...generalSettings });
			updateFontList();
			updatePreview();
		});

		fontList.appendChild(li);
	}

	initializeIcons(fontList);
}

export async function initializeReaderSettings() {
	const form = document.getElementById('reader-settings-form');
	if (!form) return;

	await loadSettings();

	const lightGrid = document.getElementById('reader-theme-grid-light') as HTMLElement;
	const darkGrid = document.getElementById('reader-theme-grid-dark') as HTMLElement;
	const darkSection = document.getElementById('reader-theme-dark-section') as HTMLElement;
	const darkSchemeToggle = document.getElementById('reader-separate-dark-theme') as HTMLInputElement;

	// Font list management
	const fontInput = document.getElementById('reader-font-input') as HTMLInputElement;

	if (fontInput) {
		fontInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const font = fontInput.value.trim();
				if (font && !generalSettings.readerSettings.fonts.includes(font)) {
					generalSettings.readerSettings.fonts.push(font);
					saveSettings({ ...generalSettings });
					fontInput.value = '';
					updateFontList();
		
					updatePreview();
					rebuildGrids(lightGrid, darkGrid);
				}
			}
		});
	}

	updateFontList();

	const fontSizeInput = document.getElementById('reader-font-size') as HTMLInputElement;
	const fontSizeDisplay = document.getElementById('reader-font-size-display');
	if (fontSizeInput) {
		fontSizeInput.value = String(generalSettings.readerSettings.fontSize);
		if (fontSizeDisplay) fontSizeDisplay.textContent = fontSizeInput.value;
		fontSizeInput.addEventListener('input', () => {
			if (fontSizeDisplay) fontSizeDisplay.textContent = fontSizeInput.value;
			const val = parseFloat(fontSizeInput.value);
			if (!isNaN(val)) {
				generalSettings.readerSettings.fontSize = val;
				updatePreview();
			}
		});
		fontSizeInput.addEventListener('change', () => {
			const val = parseFloat(fontSizeInput.value);
			if (isNaN(val)) return;
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, fontSize: val } });
		});
	}

	const lineHeightInput = document.getElementById('reader-line-height') as HTMLInputElement;
	const lineHeightDisplay = document.getElementById('reader-line-height-display');
	if (lineHeightInput) {
		lineHeightInput.value = String(generalSettings.readerSettings.lineHeight);
		if (lineHeightDisplay) lineHeightDisplay.textContent = parseFloat(lineHeightInput.value).toFixed(1);
		lineHeightInput.addEventListener('input', () => {
			if (lineHeightDisplay) lineHeightDisplay.textContent = parseFloat(lineHeightInput.value).toFixed(1);
			const val = parseFloat(lineHeightInput.value);
			if (!isNaN(val)) {
				generalSettings.readerSettings.lineHeight = val;
				updatePreview();
			}
		});
		lineHeightInput.addEventListener('change', () => {
			const val = parseFloat(lineHeightInput.value);
			if (isNaN(val)) return;
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, lineHeight: val } });
		});
	}

	const maxWidthInput = document.getElementById('reader-max-width') as HTMLInputElement;
	const maxWidthDisplay = document.getElementById('reader-max-width-display');
	if (maxWidthInput) {
		maxWidthInput.value = String(generalSettings.readerSettings.maxWidth);
		if (maxWidthDisplay) maxWidthDisplay.textContent = maxWidthInput.value;
		maxWidthInput.addEventListener('input', () => {
			if (maxWidthDisplay) maxWidthDisplay.textContent = maxWidthInput.value;
		});
		maxWidthInput.addEventListener('change', () => {
			const val = parseFloat(maxWidthInput.value);
			if (isNaN(val)) return;
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, maxWidth: val } });
		});
	}

	initializeSettingToggle('reader-blend-images', generalSettings.readerSettings.blendImages, (checked) => {
		saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, blendImages: checked } });
	});

	initializeSettingToggle('reader-color-links', generalSettings.readerSettings.colorLinks, (checked) => {
		generalSettings.readerSettings.colorLinks = checked;
		saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, colorLinks: checked } });
		updatePreview();
	});

	const themeModeSelect = document.getElementById('reader-appearance') as HTMLSelectElement;
	if (themeModeSelect) {
		themeModeSelect.value = generalSettings.readerSettings.appearance;
		themeModeSelect.addEventListener('change', () => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, appearance: themeModeSelect.value as 'auto' | 'light' | 'dark' } });
			updatePreview();
			rebuildGrids(lightGrid, darkGrid);
		});
	}

	if (darkSchemeToggle) {
		const hasDarkScheme = generalSettings.readerSettings.darkTheme !== 'same';
		darkSchemeToggle.checked = hasDarkScheme;
		darkSchemeToggle.closest('.checkbox-container')?.classList.toggle('is-enabled', hasDarkScheme);
		if (darkSection) darkSection.style.display = hasDarkScheme ? '' : 'none';

		darkSchemeToggle.addEventListener('change', () => {
			const checked = darkSchemeToggle.checked;
			darkSchemeToggle.closest('.checkbox-container')?.classList.toggle('is-enabled', checked);
			if (darkSection) darkSection.style.display = checked ? '' : 'none';
			const newDark = checked ? generalSettings.readerSettings.lightTheme : 'same';
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, darkTheme: newDark } });
			updatePreview();
			if (checked && darkGrid) rebuildGrids(null, darkGrid);
		});
	}

	const customCssInput = document.getElementById('reader-custom-css') as HTMLTextAreaElement;
	if (customCssInput) {
		customCssInput.value = generalSettings.readerSettings.customCss ?? '';
		customCssInput.addEventListener('input', debounce(() => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, customCss: customCssInput.value } });
		}, 500));
	}

	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		rebuildGrids(lightGrid, darkGrid);
		updatePreview();
	});

	rebuildGrids(lightGrid, darkGrid);
	updatePreview();
}
