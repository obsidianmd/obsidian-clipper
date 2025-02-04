import browser from './browser-polyfill';
import { escapeDoubleQuotes, sanitizeFileName } from '../utils/string-utils';
import { Template, Property } from '../types/types';
import { generalSettings, incrementStat } from './storage-utils';

export async function generateFrontmatter(properties: Property[]): Promise<string> {
	let frontmatter = '---\n';
	for (const property of properties) {
		frontmatter += `${property.name}:`;

		const propertyType = generalSettings.propertyTypes.find(p => p.name === property.name)?.type || 'text';

		switch (propertyType) {
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
	behavior: Template['behavior'],
): Promise<void> {
	let obsidianUrl: string;

	const isDailyNote = behavior === 'append-daily' || behavior === 'prepend-daily';

	if (isDailyNote) {
		obsidianUrl = `obsidian://daily?`;
	} else {
		// Ensure path ends with a slash
		if (path && !path.endsWith('/')) {
			path += '/';
		}

		const formattedNoteName = sanitizeFileName(noteName);
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + formattedNoteName)}`;
	}

	if (behavior.startsWith('append')) {
		obsidianUrl += '&append=true';
	} else if (behavior.startsWith('prepend')) {
		obsidianUrl += '&prepend=true';
	} else if (behavior === 'overwrite') {
		obsidianUrl += '&overwrite=true';
	}

	const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
	obsidianUrl += vaultParam;

	// Add silent parameter if silentOpen is enabled
	if (generalSettings.silentOpen) {
		obsidianUrl += '&silent=true';
	}

	if (generalSettings.legacyMode) {
		// Use the URI method
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		console.log('Obsidian URL:', obsidianUrl);
		openObsidianUrl(obsidianUrl);
	} else {
		// Use clipboard
		navigator.clipboard.writeText(fileContent).then(() => {
			obsidianUrl += `&clipboard`;
			openObsidianUrl(obsidianUrl);
			console.log('Obsidian URL:', obsidianUrl);
		}).catch(err => {
			console.log('Obsidian URL:', obsidianUrl);
			console.error('Failed to copy content to clipboard:', err);
			obsidianUrl += `&clipboard`;
			obsidianUrl += `&content=${encodeURIComponent("There was an error creating the content. Make sure you are using Obsidian 1.7.2 or above.")}`;
			openObsidianUrl(obsidianUrl);
		});
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