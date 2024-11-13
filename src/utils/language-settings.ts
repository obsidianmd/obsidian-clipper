import browser from './browser-polyfill';
import { getLocalStorage, setLocalStorage } from './storage-utils';

export async function getCurrentLanguage(): Promise<string> {
	const savedLanguage = await getLocalStorage('language');
	if (savedLanguage) {
		return savedLanguage;
	}
	return browser.i18n.getUILanguage();
}

export async function setLanguage(language: string): Promise<void> {
	await setLocalStorage('language', language);
	// Reload all extension pages to apply the new language
	const extensionPages = await browser.extension.getViews();
	extensionPages.forEach(page => {
		page.location.reload();
	});
}

export function getAvailableLanguages(): { code: string; name: string }[] {
	return [
		{ code: '', name: browser.i18n.getMessage('systemDefault') },
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' }
	];
} 