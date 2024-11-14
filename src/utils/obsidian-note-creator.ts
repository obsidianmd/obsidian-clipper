import browser from './browser-polyfill';
import { escapeDoubleQuotes, sanitizeFileName } from '../utils/string-utils';
import { Template, Property } from '../types/types';
import { generalSettings } from './storage-utils';

export async function generateFrontmatter(properties: Property[]): Promise<string> {
	let frontmatter = '\u200B\n';
	for (const property of properties) {
		frontmatter += `${property.name}::`; // Use double colons

		const propertyType = generalSettings.propertyTypes.find(p => p.name === property.name)?.type || 'text';

		switch (propertyType) {
			case 'multitext':
				const tags = property.value.split(' ').map(tag => tag.trim()).filter(tag => tag !== '');
				if (tags.length > 0) {
					const formattedTags = tags.map(tag => `#${tag}`).join(' ');
					frontmatter += ` ${formattedTags}\n`;
				} else {
					frontmatter += '\n';
				}
				break;
			case 'number':
				const numericValue = property.value.replace(/[^\d.-]/g, '');
				frontmatter += numericValue ? ` ${parseFloat(numericValue)}\n` : '\n';
				break;
			case 'checkbox':
				const isChecked = typeof property.value === 'boolean' ? property.value : property.value === 'true';
				frontmatter += ` ${isChecked}\n`;
				break;
			case 'date':
			case 'datetime':
				if (property.value.trim() !== '') {
					frontmatter += ` ${property.value}\n`;
				} else {
					frontmatter += '\n';
				}
				break;
			default: // Text
				frontmatter += property.value.trim() !== '' ? ` "${escapeDoubleQuotes(property.value)}"\n` : '\n';
		}
	}
	frontmatter += 'Highlights:\n';

	// Check if the frontmatter is empty
	if (frontmatter.trim() === '---\n---') {
		return '';
	}

	return frontmatter;
}

export async function saveToObsidian(
	fileContent: string,
	noteName: string,
	behavior: Template['behavior'],
): Promise<void> {
	let obsidianUrl: string;

	const isDailyNote = behavior === 'append-daily'

	if (isDailyNote) {
		obsidianUrl = `logseq://x-callback-url/quickCapture?page=TODAY&append=true`;
	} else {
		const formattedNoteName = sanitizeFileName(noteName);
		obsidianUrl = `logseq://x-callback-url/quickCapture?page=${formattedNoteName}`;
	}

	// Add silent parameter if silentOpen is enabled
	if (generalSettings.silentOpen) {
		obsidianUrl += '&silent=true';
	}

	obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
	openObsidianUrl(obsidianUrl);

	function openObsidianUrl(url: string): void {
		browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			const currentTab = tabs[0];
			if (currentTab && currentTab.id) {
				browser.tabs.update(currentTab.id, { url: url });
			}
		});
	}
}
