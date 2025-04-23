import dayjs from 'dayjs';
import browser from './browser-polyfill';
import { getLocalStorage, setLocalStorage } from './storage-utils';
import DOMPurify from 'dompurify';

// Import dayjs locales that match our supported languages
import 'dayjs/locale/ar';
import 'dayjs/locale/ca';
import 'dayjs/locale/cs';
import 'dayjs/locale/da';
import 'dayjs/locale/de';
import 'dayjs/locale/el';
import 'dayjs/locale/en';
import 'dayjs/locale/es';
import 'dayjs/locale/fa';
import 'dayjs/locale/fi';
import 'dayjs/locale/fr';
import 'dayjs/locale/he';
import 'dayjs/locale/hi';
import 'dayjs/locale/hu';
import 'dayjs/locale/id';
import 'dayjs/locale/it';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/nb';
import 'dayjs/locale/nl';
import 'dayjs/locale/pl';
import 'dayjs/locale/pt';
import 'dayjs/locale/ro';
import 'dayjs/locale/ru';
import 'dayjs/locale/sv';
import 'dayjs/locale/th';
import 'dayjs/locale/tl-ph';
import 'dayjs/locale/tr';
import 'dayjs/locale/uk';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh-tw';
import 'dayjs/locale/zh';

function convertToLocaleCode(locale: string): string {
	// Convert locale codes like 'pt_BR' to 'pt-br'
	const lowercaseLocale = locale.toLowerCase();

	const specialCases: { [key: string]: string } = {
		'tl': 'tl-ph',
		'no': 'nb'
	};
	
	if (specialCases[lowercaseLocale]) {
		return specialCases[lowercaseLocale];
	}
	
	return lowercaseLocale.replace('_', '-');
}

export function setDayjsLocale(locale: string): void {
	const dayjsLocale = convertToLocaleCode(locale);
	try {
		dayjs.locale(dayjsLocale);
	} catch (error) {
		console.warn(`Failed to set dayjs locale for ${locale}, falling back to English`, error);
		dayjs.locale('en');
	}
}

let currentLanguage: string | null = null;

// Return raw values, translation will be handled by the i18n system
export function getAvailableLanguages(): { code: string; name: string }[] {
	return [
		{ code: '', name: 'systemDefault' },
		{ code: 'ar', name: 'العربية' },
		{ code: 'bn', name: 'বাংলা'},
		{ code: 'ca', name: 'Català' },
		{ code: 'cs', name: 'Čeština' },
		{ code: 'da', name: 'Dansk' },
		{ code: 'de', name: 'Deutsch' },
		{ code: 'el', name: 'Ελληνικά' },
		{ code: 'en', name: 'English' },
		{ code: 'es', name: 'Español' },
		{ code: 'fa', name: 'فارسی' },
		{ code: 'fr', name: 'Français' },
		{ code: 'he', name: 'עברית' },
		{ code: 'hi', name: 'हिन्दी' },
		{ code: 'id', name: 'Bahasa Indonesia' },
		{ code: 'it', name: 'Italiano' },
		{ code: 'ja', name: '日本語' },
		{ code: 'ko', name: '한국어' },
		{ code: 'hu', name: 'Magyar' },
		{ code: 'nl', name: 'Nederlands' },
		{ code: 'no', name: 'Norsk' },
		{ code: 'pl', name: 'Polski' },
		{ code: 'pt_BR', name: 'Português do Brasil' },
		{ code: 'ro', name: 'Română' },
		{ code: 'ru', name: 'Русский' },
		{ code: 'fi', name: 'Suomi' },
		{ code: 'sv', name: 'Svenska' },
		{ code: 'th', name: 'ไทย' },
		{ code: 'tl', name: 'Tagalog' },
		{ code: 'tr', name: 'Türkçe' },
		{ code: 'uk', name: 'Українська' },
		{ code: 'vi', name: 'Tiếng Việt' },
		{ code: 'zh_CN', name: '简体中文' },
		{ code: 'zh_TW', name: '繁體中文' }
	];
}

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

export async function initializeI18n() {
	const { code } = await getEffectiveLanguage();
	currentLanguage = code;
	setDayjsLocale(code);
}

export function getMessage(messageName: string, substitutions?: string | string[]): string {
	try {
		// Load messages for the current language
		const messages = require(`../_locales/${currentLanguage || 'en'}/messages.json`);
		const messageObj = messages[messageName];

		if (!messageObj) {
			// If message not found in current language, try English
			if (currentLanguage !== 'en') {
				const enMessages = require('../_locales/en/messages.json');
				const enMessageObj = enMessages[messageName];
				if (enMessageObj) {
					let text = enMessageObj.message;
					// Handle substitutions and placeholders for English fallback
					if (substitutions) {
						const subsArray = Array.isArray(substitutions) ? substitutions : [substitutions];
						subsArray.forEach((sub, index) => {
							text = text.replace(`$${index + 1}`, sub);
						});
					}
					if (enMessageObj.placeholders) {
						Object.entries(enMessageObj.placeholders).forEach(([key, value]) => {
							const placeholder = `$${key}$`;
							const content = (value as { content: string }).content;
							text = text.replace(placeholder, content);
						});
					}
					return text;
				}
			}
			return browser.i18n.getMessage(messageName, substitutions) || messageName;
		}

		let text = messageObj.message;

		// Handle substitutions first
		if (substitutions) {
			const subsArray = Array.isArray(substitutions) ? substitutions : [substitutions];
			subsArray.forEach((sub, index) => {
				text = text.replace(`$${index + 1}`, sub);
			});
		}

		// Handle placeholders if they exist
		if (messageObj.placeholders) {
			Object.entries(messageObj.placeholders).forEach(([key, value]) => {
				const placeholder = `$${key}$`;
				const content = (value as { content: string }).content;
				text = text.replace(placeholder, content);
			});
		}

		return text;
	} catch (error) {
		console.warn(`Failed to load messages for language ${currentLanguage}`, error);
		return browser.i18n.getMessage(messageName, substitutions) || messageName;
	}
}

export async function translatePage() {
	await initializeI18n();

	// Translate elements with data-i18n attribute
	document.querySelectorAll('[data-i18n]').forEach(element => {
		const key = element.getAttribute('data-i18n');
		if (key) {
			const translation = getMessage(key);
			if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
				element.placeholder = translation;
			} else {
				// Sanitize HTML content before inserting
				element.innerHTML = DOMPurify.sanitize(translation);
			}
		}
	});

	// Translate elements with data-i18n-title attribute
	document.querySelectorAll('[data-i18n-title]').forEach(element => {
		const key = element.getAttribute('data-i18n-title');
		if (key) {
			element.setAttribute('title', getMessage(key));
		}
	});
}

// Helper function to get the effective language
export async function getEffectiveLanguage(): Promise<{ code: string; isRTL: boolean }> {
	const currentLang = await getCurrentLanguage();
	const languageCode = currentLang && currentLang !== '' ? currentLang : matchBrowserLanguage();
	return {
		code: languageCode,
		isRTL: isRTLLanguage(languageCode)
	};
}

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

// Helper function to set up language and RTL support
export async function setupLanguageAndDirection(): Promise<void> {
	const { code: languageCode, isRTL } = await getEffectiveLanguage();

	// Set HTML lang attribute
	document.documentElement.setAttribute('lang', languageCode);

	// Set RTL support
	if (isRTL) {
		document.documentElement.classList.add('mod-rtl');
		document.documentElement.setAttribute('dir', 'rtl');
	} else {
		document.documentElement.classList.remove('mod-rtl');
		document.documentElement.removeAttribute('dir');
	}
}