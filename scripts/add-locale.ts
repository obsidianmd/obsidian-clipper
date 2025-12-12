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
const LANGUAGE_NAMES: { [key: string]: string } = {
	'af': 'Afrikaans',
	'ar': 'العربية',
	'az': 'Azərbaycan',
	'be': 'Беларуская',
	'bg': 'Български',
	'bn': 'বাংলা',
	'bs': 'Bosanski',
	'ca': 'Català',
	'cs': 'Čeština',
	'da': 'Dansk',
	'de': 'Deutsch',
	'el': 'Ελληνικά',
	'en': 'English',
	'es': 'Español',
	'et': 'Eesti',
	'fa': 'فارسی',
	'fi': 'Suomi',
	'fil': 'Filipino',
	'fr': 'Français',
	'he': 'עברית',
	'hi': 'हिन्दी',
	'hr': 'Hrvatski',
	'hu': 'Magyar',
	'hy': 'Հայերեն',
	'id': 'Bahasa Indonesia',
	'is': 'Íslenska',
	'it': 'Italiano',
	'ja': '日本語',
	'ka': 'ქართული',
	'kk': 'Қазақша',
	'km': 'ខ្មែរ',
	'ko': '한국어',
	'lt': 'Lietuvių',
	'lv': 'Latviešu',
	'mk': 'Македонски',
	'mn': 'Монгол',
	'ms': 'Bahasa Melayu',
	'my': 'မြန်မာဘာသာ',
	'nb': 'Norsk Bokmål',
	'nl': 'Nederlands',
	'pl': 'Polski',
	'pt_PT': 'Português',
	'pt_BR': 'Português (Brasil)',
	'ro': 'Română',
	'ru': 'Русский',
	'sk': 'Slovenčina',
	'sl': 'Slovenščina',
	'sr': 'Српски',
	'sv': 'Svenska',
	'th': 'ไทย',
	'tr': 'Türkçe',
	'uk': 'Українська',
	'ur': 'اردو',
	'uz': 'O‘zbek',
	'vi': 'Tiếng Việt',
	'zh_CN': '简体中文',
	'zh_TW': '繁體中文'
};

async function addLocale(locale: string) {
	console.log(`\n🌍 Adding new locale: ${locale}`);
	
	const ROOT_DIR = path.join(__dirname, '..');
	const I18N_FILE = path.join(ROOT_DIR, 'src/utils/i18n.ts');
	const LOCALES_DIR = path.join(ROOT_DIR, 'src/_locales');

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