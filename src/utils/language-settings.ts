import browser from './browser-polyfill';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import { getMessage as getI18nMessage } from './i18n';

export async function getCurrentLanguage(): Promise<string> {
	const savedLanguage = await getLocalStorage('language');
	if (savedLanguage && savedLanguage !== '') {
		return savedLanguage;
	}
	return ''; // Return empty string for system default
}

export async function setLanguage(language: string): Promise<void> {
	await setLocalStorage('language', language);
	// Reload all extension pages to apply the new language
	const extensionPages = await browser.extension.getViews();
	extensionPages.forEach(page => {
		page.location.reload();
	});
}

// Return raw values, translation will be handled by the i18n system
export function getAvailableLanguages(): { code: string; name: string }[] {
	return [
		{ code: '', name: 'systemDefault' }, // This will be translated via data-i18n
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' },
		{ code: 'fa', name: 'فارسی' },
		{ code: 'fr', name: 'Français' },
		{ code: 'ja', name: '日本語' },
		{ code: 'ru', name: 'Русский' },
		{ code: 'zh-CN', name: '简体中文' }
	];
}

// Helper function to match browser language to available languages
export function matchBrowserLanguage(): string {
	const browserLang = browser.i18n.getUILanguage().toLowerCase().split('-')[0]; // Get base language code
	const availableLangs = getAvailableLanguages()
		.map(lang => lang.code)
		.filter(code => code !== ''); // Exclude system default option

	// If browser language matches an available language, use it
	if (availableLangs.includes(browserLang)) {
		return browserLang;
	}

	// Otherwise default to English
	return 'en';
}

// Export getMessage for use in settings.ts
export function getMessage(messageName: string): string {
	return getI18nMessage(messageName);
}

// Add this function to check if a language code is RTL
export function isRTLLanguage(languageCode: string): boolean {
	// List of RTL language codes
	const rtlLanguages = [
		'ar',  // Arabic
		'arc', // Aramaic
		'ckb', // Central Kurdish (Sorani)
		'dv',  // Divehi/Maldivian
		'fa',  // Persian/Farsi
		'ha',  // Hausa (when written in Arabic script)
		'he',  // Hebrew
		'khw', // Khowar
		'ks',  // Kashmiri
		'ku',  // Kurdish (in Arabic script)
		'ps',  // Pashto
		'sd',  // Sindhi
		'syr', // Syriac
		'ur',  // Urdu
		'uz-AF', // Uzbek (in Afghanistan)
		'yi'   // Yiddish
	];
	return rtlLanguages.includes(languageCode.toLowerCase().split('-')[0]);
}

// Modify getEffectiveLanguage to also return if it's RTL
export async function getEffectiveLanguage(): Promise<{ code: string; isRTL: boolean }> {
	const currentLang = await getCurrentLanguage();
	const languageCode = currentLang && currentLang !== '' ? currentLang : matchBrowserLanguage();
	return {
		code: languageCode,
		isRTL: isRTLLanguage(languageCode)
	};
} 