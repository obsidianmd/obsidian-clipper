import path from 'path';
import fs from 'fs';

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

async function findUsedMessages(srcDir: string): Promise<Set<string>> {
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
				while ((match = messagePattern.exec(content)) !== null) {
					usedKeys.add(match[1]);
				}
				while ((match = i18nPattern.exec(content)) !== null) {
					usedKeys.add(match[1]);
				}
				if (file.includes('manifest.')) {
					while ((match = manifestPattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
					}
				}
				if (file.includes('modal') || file.includes('settings.html')) {
					while ((match = i18nTitlePattern.exec(content)) !== null) {
						usedKeys.add(match[1]);
					}
				}
				while ((match = showErrorPattern.exec(content)) !== null) {
					usedKeys.add(match[1]);
				}
			}
		}
	};

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

async function checkUnusedStrings(): Promise<void> {
	const LOCALES_DIR = path.join(__dirname, '../src/locales');
	const SRC_DIR = path.join(__dirname, '../src');

	try {
		// Get all used message keys
		const usedKeys = await findUsedMessages(SRC_DIR);

		// Read English messages
		const sourceFile = path.join(LOCALES_DIR, 'en', 'messages.json');
		const sourceMessages: Messages = JSON.parse(await fs.promises.readFile(sourceFile, 'utf-8'));

		// Find unused messages
		const unusedKeys = Object.keys(sourceMessages).filter(key => !usedKeys.has(key));

		if (unusedKeys.length > 0) {
			console.log('\nUnused strings found:');
			console.log('-------------------');
			unusedKeys.forEach(key => {
				console.log(`"${key}": "${sourceMessages[key].message}"`);
			});
			console.log(`\nTotal unused strings: ${unusedKeys.length}`);
		} else {
			console.log('No unused strings found.');
		}

		// Log statistics
		console.log('\nStatistics:');
		console.log('-----------');
		console.log(`Total strings: ${Object.keys(sourceMessages).length}`);
		console.log(`Used strings: ${usedKeys.size}`);
		console.log(`Unused strings: ${unusedKeys.length}`);
		console.log(`Usage percentage: ${((usedKeys.size / Object.keys(sourceMessages).length) * 100).toFixed(1)}%`);

	} catch (error) {
		console.error('Error checking unused strings:', error);
	}
}

checkUnusedStrings(); 