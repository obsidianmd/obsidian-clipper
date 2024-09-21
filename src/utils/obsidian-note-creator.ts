import browser from './browser-polyfill';
import dayjs from 'dayjs';
import { escapeDoubleQuotes, sanitizeFileName } from '../utils/string-utils';
import { Template, Property } from '../types/types';
import { generalSettings } from './storage-utils';

export async function generateFrontmatter(properties: Property[]): Promise<string> {
	let frontmatter = '---\n';
	for (const property of properties) {
		frontmatter += `${property.name}:`;

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
					frontmatter += '\n';
					items.forEach(item => {
						frontmatter += `  - "${escapeDoubleQuotes(item)}"\n`;
					});
				} else {
					frontmatter += '\n';
				}
				break;
			case 'number':
				const numericValue = property.value.replace(/[^\d.-]/g, '');
				frontmatter += numericValue ? ` ${parseFloat(numericValue)}\n` : '\n';
				break;
			case 'checkbox':
				frontmatter += ` ${property.value.toLowerCase() === 'true' || property.value === '1'}\n`;
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
	frontmatter += '---\n';

	// Check if the frontmatter is empty
	if (frontmatter.trim() === '---\n---') {
		return '';
	}

	return frontmatter;
}

export async function saveToObsidian(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: string,
	noteNameFormat: string
): Promise<void> {
	let obsidianUrl: string;

	// Ensure path ends with a slash
	if (path && !path.endsWith('/')) {
		path += '/';
	}

	const formattedNoteName = behavior.endsWith('-daily') 
		? dayjs().format(noteNameFormat) 
		: sanitizeFileName(noteName);

	switch (behavior) {
		case 'append-specific':
		case 'prepend-specific':
			obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + formattedNoteName)}`;
			break;
		case 'append-daily':
		case 'prepend-daily':
			obsidianUrl = `obsidian://daily?file=${encodeURIComponent(path + formattedNoteName)}`;
			break;
		default: // 'create'
			obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + formattedNoteName)}`;
	}

	if (behavior.startsWith('append')) {
		obsidianUrl += '&append=true';
	} else if (behavior.startsWith('prepend')) {
		obsidianUrl += '&prepend=true';
	}

	// Add silent parameter if silentOpen is enabled
	if (generalSettings.silentOpen) {
		obsidianUrl += '&silent=true';
	}

	if (generalSettings.betaFeatures) {
		// Use clipboard for content in beta mode
		navigator.clipboard.writeText(fileContent).then(() => {
			obsidianUrl += `&clipboard`;
			openObsidianUrl(obsidianUrl);
		}).catch(err => {
			console.error('Failed to copy content to clipboard:', err);
			// Fallback to the URI method if clipboard fails
			obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
			openObsidianUrl(obsidianUrl);
		});
	} else {
		// Use the URI method
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		openObsidianUrl(obsidianUrl);
	}

	function openObsidianUrl(url: string): void {
		browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
			const currentTab = tabs[0];
			if (currentTab && currentTab.id) {
				browser.tabs.update(currentTab.id, { url: url });
			}
		});
	}
}