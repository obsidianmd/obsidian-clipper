import browser from './browser-polyfill';
import { sanitizeFileName } from '../utils/string-utils';
import { generateFrontmatter as generateFrontmatterCore } from './shared';
import { Template, Property } from '../types/types';
import { generalSettings, incrementStat } from './storage-utils';
import { copyToClipboard } from './clipboard-utils';
import { getMessage } from './i18n';

export async function generateFrontmatter(properties: Property[]): Promise<string> {
	const typeMap: Record<string, string> = {};
	for (const pt of generalSettings.propertyTypes) {
		typeMap[pt.name] = pt.type;
	}
	return generateFrontmatterCore(properties, typeMap);
}

function openViaAnchorClick(url: string): void {
	const a = document.createElement('a');
	a.href = url;
	a.style.display = 'none';
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

async function openObsidianUrl(url: string): Promise<void> {
	try {
		const response = await browser.runtime.sendMessage({
			action: "openObsidianUrl",
			url: url
		}) as { success?: boolean; fallbackUrl?: string; error?: string } | undefined;

		if (response && response.success) {
			return;
		}

		console.warn('Background could not open Obsidian URL, trying local fallbacks:', response?.error);
		const fallback = response?.fallbackUrl || url;
		try {
			openViaAnchorClick(fallback);
		} catch {
			window.open(fallback, '_blank');
		}
	} catch (error) {
		console.error('Error opening Obsidian URL via background script:', error);
		try {
			openViaAnchorClick(url);
		} catch {
			window.open(url, '_blank');
		}
	}
}

async function tryClipboardWrite(fileContent: string, obsidianUrl: string): Promise<void> {
	const success = await copyToClipboard(fileContent);
	
	if (success) {
		obsidianUrl += `&clipboard&content=${encodeURIComponent(getMessage('clipboardError', 'https://help.obsidian.md/web-clipper/troubleshoot'))}`;
		await openObsidianUrl(obsidianUrl);
		console.log('Obsidian URL:', obsidianUrl);
	} else {
		console.error('All clipboard methods failed, falling back to URI method');
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		await openObsidianUrl(obsidianUrl);
		console.log('Obsidian URL (URI fallback):', obsidianUrl);
	}
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
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		console.log('Obsidian URL:', obsidianUrl);
		await openObsidianUrl(obsidianUrl);
	} else {
		// Try to copy to clipboard with fallback mechanisms
		await tryClipboardWrite(fileContent, obsidianUrl);
	}
}