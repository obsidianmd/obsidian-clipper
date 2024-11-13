import browser from './browser-polyfill';
import { getCurrentLanguage, matchBrowserLanguage } from './language-settings';
import DOMPurify from 'dompurify';

let currentLanguage: string | null = null;

export async function initializeI18n() {
	currentLanguage = await getCurrentLanguage();
}

export function getMessage(messageName: string, substitutions?: string | string[]): string {
	try {
		// If no language is set (system default) or language is empty string
		if (!currentLanguage || currentLanguage === '') {
			// Try to match browser language to available languages
			const matchedLang = matchBrowserLanguage();
			
			// Load messages for the matched language
			const messages = require(`../locales/${matchedLang}/messages.json`);
			const messageObj = messages[messageName];
			
			if (!messageObj) {
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
		}

		// Load messages for the explicitly selected language
		const messages = require(`../locales/${currentLanguage}/messages.json`);
		const messageObj = messages[messageName];
		
		if (!messageObj) {
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