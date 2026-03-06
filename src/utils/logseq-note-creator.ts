import dayjs from 'dayjs';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import { sanitizeFileName } from './string-utils';
import { Template, Property } from '../types/types';
import { generalSettings, incrementStat } from './storage-utils';
import { copyToClipboard } from './clipboard-utils';
import { logseqClient, BatchBlock } from './logseq-api-client';
import { getMessage } from './i18n';

dayjs.extend(advancedFormat);

/**
 * Generates LogSeq properties block in `property:: value` format.
 * These go at the top of the page (page-level properties).
 */
export function generateLogseqProperties(properties: Property[]): string {
	let propsBlock = '';

	for (const property of properties) {
		if (!property.name || property.value === undefined) continue;

		const propertyType = generalSettings.propertyTypes.find(p => p.name === property.name)?.type || 'text';
		const name = property.name;
		let value = property.value;

		if (value === undefined || value === null) {
			propsBlock += `${name}:: \n`;
			continue;
		}

		switch (propertyType) {
			case 'multitext': {
				let items: string[];
				if (value.trim().startsWith('["') && value.trim().endsWith('"]')) {
					try {
						items = JSON.parse(value);
					} catch {
						items = value.split(',').map(item => item.trim());
					}
				} else {
					// Split by comma but keep wikilinks intact
					items = value.split(/,(?![^\[]*\]\])/).map(item => item.trim());
				}
				items = items.filter(item => item !== '');
				propsBlock += `${name}:: ${items.join(', ')}\n`;
				break;
			}
			case 'number': {
				const numericValue = value.replace(/[^\d.-]/g, '');
				propsBlock += numericValue ? `${name}:: ${parseFloat(numericValue)}\n` : `${name}:: \n`;
				break;
			}
			case 'checkbox': {
				const isChecked = typeof value === 'boolean' ? value : value === 'true';
				propsBlock += `${name}:: ${isChecked}\n`;
				break;
			}
			case 'date':
			case 'datetime':
				propsBlock += value.trim() !== '' ? `${name}:: ${value}\n` : `${name}:: \n`;
				break;
			default: // text
				propsBlock += value.trim() !== '' ? `${name}:: ${value}\n` : `${name}:: \n`;
		}
	}

	return propsBlock;
}

/**
 * Splits markdown content into logical blocks for LogSeq's outliner.
 * Returns an array of strings, each representing a top-level block.
 */
export function convertToBlocks(markdownContent: string): string[] {
	if (!markdownContent.trim()) return [];

	// Preserve fenced code blocks as single units
	const codeBlockRegex = /```[\s\S]*?```/g;
	const codeBlocks: string[] = [];
	const withPlaceholders = markdownContent.replace(codeBlockRegex, (match) => {
		codeBlocks.push(match);
		return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
	});

	// Preserve tables as single units
	const tableRegex = /(\|.+\|\n)+/g;
	const tables: string[] = [];
	const withTablePlaceholders = withPlaceholders.replace(tableRegex, (match) => {
		tables.push(match.trimEnd());
		return `%%TABLE_${tables.length - 1}%%\n`;
	});

	// Split by double newlines (paragraph boundaries)
	const rawBlocks = withTablePlaceholders
		.split(/\n{2,}/)
		.map(block => block.trim())
		.filter(block => block.length > 0);

	// Restore placeholders
	const restoredBlocks = rawBlocks.map(block => {
		let restored = block;
		restored = restored.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[parseInt(idx)]);
		restored = restored.replace(/%%TABLE_(\d+)%%/g, (_, idx) => tables[parseInt(idx)]);
		return restored;
	});

	return restoredBlocks;
}

/**
 * Gets today's journal page name in the configured LogSeq format.
 */
function getTodayJournalPageName(): string {
	const format = generalSettings.logseqJournalFormat || 'MMM Do, YYYY';
	return dayjs().format(format);
}

/**
 * Saves content to LogSeq via the HTTP API.
 */
export async function saveToLogseq(
	propertiesContent: string,
	noteContent: string,
	noteName: string,
	namespace: string,
	graph: string | undefined,
	behavior: Template['behavior'],
): Promise<void> {
	const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

	// Determine the full page name
	let fullPageName: string;
	if (isDailyNote) {
		fullPageName = getTodayJournalPageName();
	} else {
		const sanitized = sanitizeFileName(noteName);
		fullPageName = namespace ? `${namespace}/${sanitized}` : sanitized;
	}

	// Check if API is available
	const available = await logseqClient.isAvailable();
	if (!available) {
		throw new Error(getMessage('logseqApiUnavailable') || 'Cannot connect to LogSeq. Make sure the desktop app is running and the HTTP API is enabled in Settings > Features.');
	}

	// Convert content to blocks
	const contentBlocks = convertToBlocks(noteContent);

	switch (behavior) {
		case 'create':
		case 'overwrite': {
			if (behavior === 'overwrite') {
				// Delete all existing blocks before writing
				try {
					const existingBlocks = await logseqClient.getPageBlocksTree(fullPageName);
					for (const block of existingBlocks || []) {
						await logseqClient.removeBlock(block.uuid);
					}
				} catch {
					// Page may not exist yet, continue
				}
			}

			// Create or ensure page exists
			await logseqClient.createPage(fullPageName, {});

			// Add properties block first (as first block of the page)
			if (propertiesContent.trim()) {
				await logseqClient.appendBlockInPage(fullPageName, propertiesContent.trimEnd());
			}

			// Add content blocks
			for (const block of contentBlocks) {
				await logseqClient.appendBlockInPage(fullPageName, block);
			}
			break;
		}

		case 'append-specific':
		case 'append-daily': {
			// Append properties + content
			const appendText = [propertiesContent.trimEnd(), ...contentBlocks].filter(Boolean).join('\n\n');
			if (appendText.trim()) {
				await logseqClient.appendBlockInPage(fullPageName, appendText);
			}
			break;
		}

		case 'prepend-specific':
		case 'prepend-daily': {
			const prependText = [propertiesContent.trimEnd(), ...contentBlocks].filter(Boolean).join('\n\n');
			if (prependText.trim()) {
				await logseqClient.prependBlockInPage(fullPageName, prependText);
			}
			break;
		}
	}
}
