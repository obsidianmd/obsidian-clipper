import browser from './browser-polyfill';
import dayjs from 'dayjs';
import { escapeDoubleQuotes, sanitizeFileName } from '../utils/string-utils';
import { Template, Property } from '../types/types';
import { generalSettings } from './storage-utils';

export async function generateFrontmatter(properties: Property[]): Promise<string> {
	let frontmatter = '';
	let hasContent = false;

	for (const property of properties) {
		let propertyContent = '';
		switch (property.type) {
			case 'multitext':
				let items: string[];
				if (property.value.trim().startsWith('["') && property.value.trim().endsWith('"]')) {
					try {
						items = JSON.parse(property.value);
					} catch (e) {
						// If parsing fails, fall back to splitting by comma
						items = property.value.split(',').map(item => item.trim());
					}
				} else {
					// Split by comma, but keep wikilinks intact
					items = property.value.split(/,(?![^\[]*\]\])/).map(item => item.trim());
				}
				items = items.filter(item => item !== '');
				if (items.length > 0) {
					propertyContent = `${property.name}:\n${items.map(item => `  - "${escapeDoubleQuotes(item)}"`).join('\n')}\n`;
					hasContent = true;
				}
				break;
			case 'number':
				const numericValue = property.value.replace(/[^\d.-]/g, '');
				if (numericValue) {
					propertyContent = `${property.name}: ${parseFloat(numericValue)}\n`;
					hasContent = true;
				}
				break;
			case 'checkbox':
				propertyContent = `${property.name}: ${property.value.toLowerCase() === 'true' || property.value === '1'}\n`;
				hasContent = true;
				break;
			case 'date':
			case 'datetime':
				if (property.value.trim() !== '') {
					propertyContent = `${property.name}: "${property.value}"\n`;
					hasContent = true;
				}
				break;
			default: // Text
				if (property.value.trim() !== '') {
					propertyContent = `${property.name}: "${escapeDoubleQuotes(property.value)}"\n`;
					hasContent = true;
				}
		}
		frontmatter += propertyContent;
	}

	return hasContent ? `---\n${frontmatter}---\n` : '';
}

export function saveToObsidian(fileContent: string, noteName: string, path: string, vault: string, behavior: string, specificNoteName?: string, dailyNoteFormat?: string): void {
	let obsidianUrl: string;
	let content = fileContent;

	// Ensure path ends with a slash
	if (path && !path.endsWith('/')) {
		path += '/';
	}

	if (behavior === 'append-specific' || behavior === 'append-daily') {
		let appendFileName: string;
		if (behavior === 'append-specific') {
			appendFileName = specificNoteName!;
		} else {
			appendFileName = dayjs().format(dailyNoteFormat!);
		}
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + appendFileName)}&append=true`;
		
		// Add newlines at the beginning to separate from existing content
		content = '\n\n' + content;
	} else {
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + sanitizeFileName(noteName))}`;
	}

	if (generalSettings.betaFeatures) {
		// Use clipboard for content in beta mode
		navigator.clipboard.writeText(content).then(() => {
			obsidianUrl += `&clipboard`;
			openObsidianUrl(obsidianUrl);
		}).catch(err => {
			console.error('Failed to copy content to clipboard:', err);
			// Fallback to the URI method if clipboard fails
			obsidianUrl += `&content=${encodeURIComponent(content)}`;
			openObsidianUrl(obsidianUrl);
		});
	} else {
		// Use the URI method
		obsidianUrl += `&content=${encodeURIComponent(content)}`;
		openObsidianUrl(obsidianUrl);
	}

	const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
	obsidianUrl += vaultParam;

	function openObsidianUrl(url: string): void {
		browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
			const currentTab = tabs[0];
			if (currentTab && currentTab.id) {
				browser.tabs.update(currentTab.id, { url: url });
			}
		});
	}
}