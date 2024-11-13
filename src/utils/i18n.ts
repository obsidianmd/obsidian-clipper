import browser from './browser-polyfill';
import { getCurrentLanguage } from './language-settings';

let currentLanguage: string | null = null;

export async function initializeI18n() {
	currentLanguage = await getCurrentLanguage();
}

export function getMessage(messageName: string, substitutions?: string | string[]): string {
	// If no language is explicitly set, use browser's i18n
	if (!currentLanguage) {
		return browser.i18n.getMessage(messageName, substitutions) || messageName;
	}

	// Otherwise, load messages for the selected language
	try {
		const messages = require(`../locales/${currentLanguage}/messages.json`);
		return messages[messageName]?.message || messageName;
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
				element.textContent = translation;
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