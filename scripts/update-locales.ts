import path from 'path';
import I18nAutomation from '../src/utils/i18n-automation';

const LOCALES_DIR = path.join(__dirname, '../src/locales');
const SRC_DIR = path.join(__dirname, '../src');

async function main() {
	// OpenAI API key to enable automatic translation
	const automation = new I18nAutomation(LOCALES_DIR, process.env.OPENAI_API_KEY);
	
	try {
		await automation.processLocales(SRC_DIR);
		console.log('Successfully updated locales');
	} catch (error) {
		console.error('Failed to update locales:', error);
		process.exit(1);
	}
}

main(); 