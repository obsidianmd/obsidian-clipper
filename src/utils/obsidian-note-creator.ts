import dayjs from 'dayjs';
import { Template, Property } from '../types/types';

export async function generateFrontmatter(
	properties: Property[],
	currentVariables: { [key: string]: string },
	replaceSelectorsWithContent: (text: string) => Promise<string>
): Promise<string> {
	let frontmatter = '---\n';
	for (const property of properties) {
		let value = currentVariables[`{{${property.name}}}`] || property.value;
		
		// Handle custom selectors
		value = await replaceSelectorsWithContent(value);

		frontmatter += `${property.name}:`;

		// Format the value based on the property type
		switch (property.type) {
			case 'multitext':
				frontmatter += '\n';
				const items = value.split(',').map(item => item.trim());
				items.forEach(item => {
					frontmatter += `  - ${item}\n`;
				});
				break;
			case 'number':
				const numericValue = value.replace(/[^\d.-]/g, '');
				frontmatter += numericValue ? ` ${parseFloat(numericValue)}\n` : '\n';
				break;
			case 'checkbox':
				frontmatter += ` ${value.toLowerCase() === 'true' || value === '1'}\n`;
				break;
			case 'date':
				frontmatter += ` "${value}"\n`;
				break;
			case 'datetime':
				frontmatter += ` "${value}"\n`;
				break;
			default: // Text
				frontmatter += ` "${value}"\n`;
		}
	}
	frontmatter += '---\n\n';
	return frontmatter;
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
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + noteName)}`;
	}

	obsidianUrl += `&content=${encodeURIComponent(content)}`;

	const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
	obsidianUrl += vaultParam;

	chrome.tabs.create({ url: obsidianUrl }, function(tab) {
		setTimeout(() => chrome.tabs.remove(tab!.id!), 500);
	});
}

export function getFileName(noteName: string): string {
	const isWindows = navigator.platform.indexOf('Win') > -1;
	if (isWindows) {
		noteName = noteName.replace(':', '').replace(/[/\\?%*|"<>]/g, '-');
	} else {
		noteName = noteName.replace(':', '').replace(/[/\\]/g, '-');
	}
	return noteName;
}