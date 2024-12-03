import fs from 'fs';
import path from 'path';

interface Message {
	message: string;
	placeholders?: {
		[key: string]: {
			content: string;
		};
	};
}

interface Messages {
	[key: string]: Message;
}

export default class I18nAutomation {
	private sourceLocale = 'en';
	private localesDir: string;
	private apiKey?: string;
	private chatHistories: { [locale: string]: { role: string, content: string }[] } = {};

	constructor(localesDir: string, openaiApiKey?: string) {
		this.localesDir = localesDir;
		this.apiKey = openaiApiKey;
	}

	private initializeChatHistory(targetLanguage: string) {
		this.chatHistories[targetLanguage] = [{
			role: "system",
			content: `You are a professional translator for the Obsidian Web Clipper browser extension.

About the extension:
- It's a browser extension that helps users save web content to their Obsidian vault
- Users can clip entire articles, selected text, or highlights
- It includes features for customizing templates, managing settings, and organizing clips
- The interface needs to be clear and concise

Translation guidelines:
- Translate from English to ${targetLanguage}
- Preserve any placeholders like $1, $2, {{variable}}, etc.
- Maintain consistent terminology throughout the extension
- Keep UI text concise and clear
- Match the tone of the original text (error messages should sound like errors, etc.)
- Consider the context of each string (button labels, error messages, descriptions, etc.)

Please translate each message I send you. Respond with only the translated text, no explanations needed.`
		}];
	}

	private async translateMessage(message: string, targetLanguage: string, key: string): Promise<string> {
		if (!this.apiKey) {
			throw new Error('OpenAI API key not provided');
		}

		// Initialize chat history if it doesn't exist
		if (!this.chatHistories[targetLanguage]) {
			this.initializeChatHistory(targetLanguage);
		}

		const context = this.getMessageContext(key);
		console.log(`  🤖 Translating ${context}: "${message.substring(0, 40)}${message.length > 40 ? '...' : ''}"`);

		// Add message to translate to chat history
		this.chatHistories[targetLanguage].push({
			role: "user",
			content: `Translate this ${context}: "${message}"`
		});

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`
			},
			body: JSON.stringify({
				model: "gpt-4",
				messages: this.chatHistories[targetLanguage],
				temperature: 0.3
			})
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		const translatedText = data.choices[0].message.content || message;

		// Add assistant's response to chat history
		this.chatHistories[targetLanguage].push({
			role: "assistant",
			content: translatedText
		});

		console.log(`  ✓ Translated to: "${translatedText.substring(0, 40)}${translatedText.length > 40 ? '...' : ''}"`);
		return translatedText;
	}

	private getMessageContext(key: string): string {
		if (key.includes('error')) return 'error message';
		if (key.includes('button')) return 'button label';
		if (key.includes('title')) return 'title';
		if (key.includes('description')) return 'description';
		if (key.includes('tooltip')) return 'tooltip';
		if (key.includes('placeholder')) return 'input placeholder';
		return 'UI text';
	}

	// Sort messages alphabetically by key
	private sortMessages(messages: Messages): Messages {
		return Object.keys(messages)
			.sort()
			.reduce((acc: Messages, key) => {
				acc[key] = messages[key];
				return acc;
			}, {});
	}

	// Process all locales
	async processLocales(srcDir: string, targetLocale?: string): Promise<void> {
		console.log('\n🌍 Starting localization process...');
		
		// Read source (English) messages
		console.log(`📖 Reading source messages from ${this.sourceLocale}...`);
		const sourceFile = path.join(this.localesDir, this.sourceLocale, 'messages.json');
		const sourceMessages: Messages = JSON.parse(await fs.promises.readFile(sourceFile, 'utf-8'));
		console.log(`✓ Found ${Object.keys(sourceMessages).length} source messages`);

		// Sort source messages
		const sortedSourceMessages = this.sortMessages(sourceMessages);
		await fs.promises.writeFile(
			sourceFile,
			JSON.stringify(sortedSourceMessages, null, '\t')
		);

		// Get list of locales to process
		const locales = await fs.promises.readdir(this.localesDir);
		const localesToProcess = targetLocale 
			? [targetLocale]
			: locales.filter(locale => !locale.startsWith('.') && locale !== this.sourceLocale);

		console.log(`\n🎯 Processing ${localesToProcess.length} locale(s): ${localesToProcess.join(', ')}`);

		// Process selected locales
		for (const locale of localesToProcess) {
			console.log(`\n📝 Processing ${locale}...`);
			
			if (!locales.includes(locale)) {
				console.log(`  Creating new locale directory: ${locale}`);
				await fs.promises.mkdir(path.join(this.localesDir, locale), { recursive: true });
			}

			const localeFile = path.join(this.localesDir, locale, 'messages.json');
			let localeMessages: Messages = {};

			try {
				localeMessages = JSON.parse(await fs.promises.readFile(localeFile, 'utf-8'));
				console.log(`  📂 Found existing translations for ${locale}`);
			} catch (error) {
				console.log(`  ⚠️  No existing translations found for ${locale}, creating new file`);
			}

			// Find missing translations
			const missingKeys = Object.keys(sortedSourceMessages).filter(key => !localeMessages[key]);
			if (missingKeys.length > 0) {
				console.log(`  🔍 Found ${missingKeys.length} missing translations`);
				
				// Translate each missing message
				for (const key of missingKeys) {
					try {
						const translatedMessage = await this.translateMessage(
							sortedSourceMessages[key].message,
							locale,
							key
						);
						localeMessages[key] = {
							message: translatedMessage,
							...(sortedSourceMessages[key].placeholders && { 
								placeholders: sortedSourceMessages[key].placeholders 
							})
						};
					} catch (error) {
						console.error(`  ❌ Failed to translate ${key}:`, error);
						localeMessages[key] = sortedSourceMessages[key];
					}
				}
			} else {
				console.log(`  ✓ All messages are already translated`);
			}

			// Remove messages that don't exist in English
			const obsoleteKeys = Object.keys(localeMessages).filter(key => !sortedSourceMessages[key]);
			if (obsoleteKeys.length > 0) {
				console.log(`  🧹 Removing ${obsoleteKeys.length} obsolete messages`);
				for (const key of obsoleteKeys) {
					delete localeMessages[key];
				}
			}

			// Sort and save locale messages
			const sortedLocaleMessages = this.sortMessages(localeMessages);
			await fs.promises.writeFile(
				localeFile,
				JSON.stringify(sortedLocaleMessages, null, '\t')
			);
			console.log(`  💾 Saved translations for ${locale}`);
		}

		console.log('\n✨ Localization process completed successfully!\n');
	}
} 