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

	constructor(localesDir: string, openaiApiKey?: string) {
		this.localesDir = localesDir;
		this.apiKey = openaiApiKey;
	}

	// Find all message keys that are actually used in the codebase
	private async findUsedMessages(srcDir: string): Promise<Set<string>> {
		const usedKeys = new Set<string>();
		const messagePattern = /getMessage\(['"]([^'"]+)['"]/g;
		const i18nPattern = /data-i18n="([^"]+)"/g;
		const manifestPattern = /__MSG_([^_]+)__/g;

		const searchFiles = async (dir: string) => {
			const files = await fs.promises.readdir(dir);
			
			for (const file of files) {
				const fullPath = path.join(dir, file);
				const stat = await fs.promises.stat(fullPath);
				
				if (stat.isDirectory()) {
					await searchFiles(fullPath);
				} else if (/\.(ts|js|tsx|jsx|html|json)$/.test(file)) {
					const content = await fs.promises.readFile(fullPath, 'utf-8');
					
					let match;
					while ((match = messagePattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
					}
					while ((match = i18nPattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
					}
					// Check for manifest message references
					if (file.includes('manifest.')) {
						while ((match = manifestPattern.exec(content)) !== null) {
							usedKeys.add(match[1]);
						}
					}
				}
			}
		};

		// Search in src directory
		await searchFiles(srcDir);

		// Also search in root directory for manifest files
		const rootDir = path.join(srcDir, '..');
		const rootFiles = await fs.promises.readdir(rootDir);
		for (const file of rootFiles) {
			if (file.startsWith('manifest.') && file.endsWith('.json')) {
				const content = await fs.promises.readFile(path.join(rootDir, file), 'utf-8');
				let match;
				while ((match = manifestPattern.exec(content)) !== null) {
					usedKeys.add(match[1]);
				}
			}
		}

		return usedKeys;
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

	// Translate a message to a target language using OpenAI
	private async translateMessage(message: string, targetLanguage: string): Promise<string> {
		if (!this.apiKey) {
			throw new Error('OpenAI API key not provided');
		}

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${this.apiKey}`
			},
			body: JSON.stringify({
				model: "gpt-4",
				messages: [{
					role: "system",
					content: `You are a professional translator. Translate the following text to ${targetLanguage}. Preserve any placeholders like $1, $2, {{variable}}, etc. Maintain the same tone and formality as the source text.`
				}, {
					role: "user",
					content: message
				}],
				temperature: 0.3
			})
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.statusText}`);
		}

		const data = await response.json();
		return data.choices[0].message.content || message;
	}

	// Process all locales
	async processLocales(srcDir: string): Promise<void> {
		// 1. Find used messages
		const usedKeys = await this.findUsedMessages(srcDir);
		
		// Read source (English) messages
		const sourceFile = path.join(this.localesDir, this.sourceLocale, 'messages.json');
		const sourceMessages: Messages = JSON.parse(await fs.promises.readFile(sourceFile, 'utf-8'));

		// Remove unused messages from source
		for (const key of Object.keys(sourceMessages)) {
			if (!usedKeys.has(key)) {
				delete sourceMessages[key];
			}
		}

		// Sort source messages
		const sortedSourceMessages = this.sortMessages(sourceMessages);

		// Save updated source messages
		await fs.promises.writeFile(
			sourceFile,
			JSON.stringify(sortedSourceMessages, null, '\t')
		);

		// Process other locales
		const locales = await fs.promises.readdir(this.localesDir);
		
		for (const locale of locales) {
			if (locale === this.sourceLocale) continue;

			const localeFile = path.join(this.localesDir, locale, 'messages.json');
			let localeMessages: Messages = {};

			try {
				localeMessages = JSON.parse(await fs.promises.readFile(localeFile, 'utf-8'));
			} catch (error) {
				console.log(`Creating new locale: ${locale}`);
			}

			// Add missing messages and translate them
			for (const [key, value] of Object.entries(sortedSourceMessages)) {
				if (!localeMessages[key]) {
					try {
						const translatedMessage = await this.translateMessage(
							value.message,
							locale
						);
						localeMessages[key] = {
							message: translatedMessage,
							...(value.placeholders && { placeholders: value.placeholders })
						};
					} catch (error) {
						console.error(`Failed to translate message ${key} to ${locale}:`, error);
						localeMessages[key] = value;
					}
				}
			}

			// Remove unused messages
			for (const key of Object.keys(localeMessages)) {
				if (!sortedSourceMessages[key]) {
					delete localeMessages[key];
				}
			}

			// Sort and save locale messages
			const sortedLocaleMessages = this.sortMessages(localeMessages);
			await fs.promises.writeFile(
				localeFile,
				JSON.stringify(sortedLocaleMessages, null, '\t')
			);
		}
	}
} 