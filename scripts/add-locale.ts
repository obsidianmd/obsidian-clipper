import path from 'path';
import fs from 'fs';
import I18nAutomation from '../src/utils/i18n-automation';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Language {
	code: string;
	name: string;
}

// Map of ISO codes to native language names
// Add more as needed
const LANGUAGE_NAMES: { [key: string]: string } = {
	'ar': 'العربية',
	'de': 'Deutsch',
	'en': 'English',
	'es': 'Español',
	'fa': 'فارسی',
	'fr': 'Français',
	'id': 'Bahasa Indonesia',
	'it': 'Italiano',
	'ja': '日本語',
	'ko': '한국어',
	'nl': 'Nederlands',
	'pl': 'Polski',
	'pt-BR': 'Português (Brasil)',
	'ru': 'Русский',
	'tr': 'Türkçe',
	'uk': 'Українська',
	'vi': 'Tiếng Việt',
	'zh-CN': '简体中文',
	'zh-TW': '繁體中文'
};

async function addLocale(locale: string) {
	console.log(`\n🌍 Adding new locale: ${locale}`);
	
	const ROOT_DIR = path.join(__dirname, '..');
	const I18N_FILE = path.join(ROOT_DIR, 'src/utils/i18n.ts');
	const LOCALES_DIR = path.join(ROOT_DIR, 'src/locales');

	// Validate locale format
	if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(locale)) {
		throw new Error('Invalid locale format. Use ISO format like "fr" or "pt-BR"');
	}

	// Check if locale already exists
	if (fs.existsSync(path.join(LOCALES_DIR, locale))) {
		throw new Error(`Locale ${locale} already exists`);
	}

	// Get native language name
	const nativeName = LANGUAGE_NAMES[locale];
	if (!nativeName) {
		throw new Error(`Native name not found for locale ${locale}. Please add it to LANGUAGE_NAMES`);
	}

	// 1. Update i18n.ts
	console.log('📝 Updating i18n.ts...');
	let i18nContent = fs.readFileSync(I18N_FILE, 'utf-8');
	
	// Find the languages array
	const languagesMatch = i18nContent.match(/return\s*\[([\s\S]*?)\];/);
	if (!languagesMatch) {
		throw new Error('Could not find languages array in i18n.ts');
	}

	// Parse existing languages
	const languages: Language[] = eval(`[${languagesMatch[1]}]`);
	
	// Add new language in alphabetical order
	languages.push({ code: locale, name: nativeName });
	languages.sort((a, b) => {
		if (a.code === '') return -1; // Keep system default first
		if (b.code === '') return 1;
		return a.code.localeCompare(b.code);
	});

	// Format languages array
	const formattedLanguages = languages
		.map(lang => `\t\t{ code: '${lang.code}', name: '${lang.name}' }`)
		.join(',\n');

	// Replace languages array in file
	const updatedContent = i18nContent.replace(
		/return\s*\[([\s\S]*?)\];/,
		`return [\n${formattedLanguages}\n\t];`
	);

	fs.writeFileSync(I18N_FILE, updatedContent);
	console.log('✓ Updated i18n.ts');

	// 2. Create locale directory and messages.json
	console.log(`📁 Creating locale directory for ${locale}...`);
	const localeDir = path.join(LOCALES_DIR, locale);
	fs.mkdirSync(localeDir, { recursive: true });
	
	// Create empty messages.json
	const messagesFile = path.join(localeDir, 'messages.json');
	fs.writeFileSync(messagesFile, '{}');
	console.log('✓ Created locale directory and messages.json');

	// 3. Run translation
	console.log('🤖 Starting translation...');
	const automation = new I18nAutomation(LOCALES_DIR, process.env.OPENAI_API_KEY);
	
	try {
		await automation.processLocales(path.join(ROOT_DIR, 'src'), locale);
		console.log('✓ Translation completed');
	} catch (error) {
		console.error('❌ Translation failed:', error);
		// Clean up on failure
		fs.rmSync(localeDir, { recursive: true, force: true });
		throw error;
	}
}

// Get locale from command line argument
const locale = process.argv[2];
if (!locale) {
	console.error('Please provide a locale code, e.g.: npm run add-locale fr');
	process.exit(1);
}

addLocale(locale).catch(error => {
	console.error('Failed to add locale:', error);
	process.exit(1);
}); 