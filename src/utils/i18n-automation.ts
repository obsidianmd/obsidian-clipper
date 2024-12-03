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
		const i18nTitlePattern = /data-i18n="([^"]+)"/g;
		const manifestPattern = /__MSG_([^_]+)__/g;
		const showErrorPattern = /showError\(['"]([^'"]+)['"]/g;

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
					// Check for getMessage calls
					while ((match = messagePattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
					}
					// Check for data-i18n attributes
					while ((match = i18nPattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
					}
					// Check for manifest message references
					if (file.includes('manifest.')) {
						while ((match = manifestPattern.exec(content)) !== null) {
							usedKeys.add(match[1]);
						}
					}
					// Check for modal titles and other special cases
					if (file.includes('modal') || file.includes('settings.html')) {
						while ((match = i18nTitlePattern.exec(content)) !== null) {
							usedKeys.add(match[1]);
						}
					}
					// Check for showError calls
					while ((match = showErrorPattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
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

		console.log(`  🤖 Translating: "${message.substring(0, 40)}${message.length > 40 ? '...' : ''}"`);

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
		const translatedText = data.choices[0].message.content || message;
		console.log(`  ✓ Translated to: "${translatedText.substring(0, 40)}${translatedText.length > 40 ? '...' : ''}"`);
		return translatedText;
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

			// Add missing messages and translate them
			const missingKeys = Object.keys(sortedSourceMessages).filter(key => !localeMessages[key]);
			if (missingKeys.length > 0) {
				console.log(`  🔍 Found ${missingKeys.length} missing translations`);
				
				for (const key of missingKeys) {
					const value = sortedSourceMessages[key];
					try {
						console.log(`  ⚙️  Translating key: ${key}`);
						const translatedMessage = await this.translateMessage(
							value.message,
							locale
						);
						localeMessages[key] = {
							message: translatedMessage,
							...(value.placeholders && { placeholders: value.placeholders })
						};
					} catch (error) {
						console.error(`  ❌ Failed to translate key ${key}:`, error);
						localeMessages[key] = value;
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