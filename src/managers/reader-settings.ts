import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeSettingToggle } from '../utils/ui-utils';
import { debounce } from '../utils/debounce';

// Colors mirrored from reader.scss
// accent = --obsidian-reader-text-accent (normal link color)
// accentHover = --obsidian-reader-text-accent-hover
// muted = --obsidian-reader-text-muted
const THEME_COLORS = {
	default: {
		light:  { bg: '#ffffff', text: '#222222', muted: '#5c5c5c', accent: '#222222', accentHover: '#8a5cf5' },
		dark:   { bg: '#1e1e1e', text: '#dadada', muted: '#b3b3b3', accent: '#dadada', accentHover: '#a68af9' },
	},
	flexoki: {
		light:  { bg: '#FFFCF0', text: '#100F0F', muted: '#5c5c5c', accent: '#100F0F', accentHover: '#24837B' },
		dark:   { bg: '#100F0F', text: '#CECDC3', muted: '#878580', accent: '#CECDC3', accentHover: '#3AA99F' },
	},
};

function updatePreview() {
	const preview = document.getElementById('reader-preview');
	if (!preview) return;

	const { theme, themeMode, fontFamily, customFont } = generalSettings.readerSettings;

	let isDark = themeMode === 'dark';
	if (themeMode === 'auto') {
		isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	}

	const colors = THEME_COLORS[theme]?.[isDark ? 'dark' : 'light'] ?? THEME_COLORS.default.light;
	const rawFont = customFont.replace(/^["']|["']$/g, '').trim();
	const font = fontFamily === 'custom' && rawFont ? rawFont : 'system-ui, -apple-system, sans-serif';

	preview.style.setProperty('--rp-bg', colors.bg);
	preview.style.setProperty('--rp-text', colors.text);
	preview.style.setProperty('--rp-muted', colors.muted);
	preview.style.setProperty('--rp-accent', colors.accent);
	preview.style.setProperty('--rp-accent-hover', colors.accentHover);
	preview.style.setProperty('--rp-font', font);
}

export async function initializeReaderSettings() {
	const form = document.getElementById('reader-settings-form');
	if (!form) return;

	await loadSettings();

	const fontFamilySelect = document.getElementById('reader-font-family') as HTMLSelectElement;
	const customFontSetting = document.getElementById('reader-custom-font-setting') as HTMLElement;
	const customFontInput = document.getElementById('reader-custom-font') as HTMLInputElement;

	function updateCustomFontVisibility(fontFamily: string) {
		customFontSetting.style.display = fontFamily === 'custom' ? '' : 'none';
	}

	if (fontFamilySelect) {
		fontFamilySelect.value = generalSettings.readerSettings.fontFamily;
		updateCustomFontVisibility(fontFamilySelect.value);
		fontFamilySelect.addEventListener('change', () => {
			updateCustomFontVisibility(fontFamilySelect.value);
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, fontFamily: fontFamilySelect.value as 'system' | 'custom', customFont: customFontInput?.value ?? generalSettings.readerSettings.customFont } });
			updatePreview();
		});
	}

	if (customFontInput) {
		customFontInput.value = generalSettings.readerSettings.customFont;
		customFontInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') e.preventDefault();
		});
		customFontInput.addEventListener('input', debounce(() => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, customFont: customFontInput.value } });
			updatePreview();
		}, 500));
	}

	initializeSettingToggle('reader-blend-images', generalSettings.readerSettings.blendImages, (checked) => {
		saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, blendImages: checked } });
	});

	const colorSchemeSelect = document.getElementById('reader-color-scheme') as HTMLSelectElement;
	if (colorSchemeSelect) {
		colorSchemeSelect.value = generalSettings.readerSettings.theme;
		colorSchemeSelect.addEventListener('change', () => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, theme: colorSchemeSelect.value as 'default' | 'flexoki' } });
			updatePreview();
		});
	}

	const themeModeSelect = document.getElementById('reader-theme-mode') as HTMLSelectElement;
	if (themeModeSelect) {
		themeModeSelect.value = generalSettings.readerSettings.themeMode;
		themeModeSelect.addEventListener('change', () => {
			saveSettings({ ...generalSettings, readerSettings: { ...generalSettings.readerSettings, themeMode: themeModeSelect.value as 'auto' | 'light' | 'dark' } });
			updatePreview();
		});
	}

	updatePreview();
}
