import browser from './browser-polyfill';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import { getMessage as getI18nMessage } from './i18n';

export async function getCurrentLanguage(): Promise<string> {
	const savedLanguage = await getLocalStorage('language');
	if (savedLanguage && savedLanguage !== '') {
		return savedLanguage;
	}
	// Get browser language and extract base language code
	const browserLang = browser.i18n.getUILanguage().split('-')[0];
	return '';  // Still return empty for system default
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
		{ code: 'es', name: 'Español' }
	];
}

// Helper function to match browser language to available languages
export function matchBrowserLanguage(): string {
	const browserLang = browser.i18n.getUILanguage().split('-')[0]; // Get base language code
	const availableLangs = getAvailableLanguages()
		.map(lang => lang.code)
		.filter(code => code !== ''); // Exclude system default option

	return availableLangs.includes(browserLang) ? browserLang : 'en';
}

// Export getMessage for use in settings.ts
export function getMessage(messageName: string): string {
	return getI18nMessage(messageName);
} 