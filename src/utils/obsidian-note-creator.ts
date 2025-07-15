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

	// Exit if no vault is specified
	if (!vault) {
		console.error('No vault specified. Cannot create note.');
		return;
	}

	// Ensure path ends with a slash
	if (path && !path.endsWith('/')) {
		path += '/';
	}

	// Ensure correct route for the given behavior
	if (behavior.startsWith('append')) {
		obsidianUrl = `obsidian://actions-uri/note/append?`
	} else if (behavior.startsWith('prepend')) {
		obsidianUrl = `obsidian://actions-uri/note/prepend?`
	} else {
		obsidianUrl = `obsidian://actions-uri/note/create?`
	}

	// Set the vault property
	// TODO: Set correct vault if empty
	obsidianUrl += `vault=${encodeURIComponent(vault)}`

	// Ensure the file name parameter is set
	if (behavior.endsWith('daily')) {
		obsidianUrl += `&periodic-note=daily`
	} else {
		// Sanitise the note name and encode it for the URL
		const formattedNoteName = sanitizeFileName(noteName);
		const fileName = encodeURIComponent(path + formattedNoteName);

		obsidianUrl += `&file=${fileName}`;
	}

	// Overwrite existing note if behavior is set to overwrite
	if (behavior === 'overwrite') {
		obsidianUrl += '&if-exists=overwrite';
	}

	// Add silent parameter if silentOpen is enabled
	if (generalSettings.silentOpen) {
		obsidianUrl += '&silent=true';
	}

	// Add the content to the URL
	obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;

	openObsidianUrl(obsidianUrl);
	console.log('Obsidian URL:', obsidianUrl);

	function openObsidianUrl(url: string): void {
		console.log('Opening Obsidian URL:', url);
		browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
			console.log('Current tabs:', tabs);
			const currentTab = tabs[0];
			/*if (currentTab && currentTab.id) {
				browser.tabs.update(currentTab.id, { url: url });
			}*/
		});
	}
}