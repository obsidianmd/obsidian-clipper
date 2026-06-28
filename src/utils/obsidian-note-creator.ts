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

interface OpenObsidianUrlOptions {
	targetTabId?: number;
	silent?: boolean;
}

export interface SaveToObsidianDiagnostics {
	urlLength: number;
	usesClipboard: boolean;
	usesUriContent: boolean;
	silent: boolean;
	targetTabId?: number;
	fallbackReason?: string;
}

interface SaveToObsidianOptions extends OpenObsidianUrlOptions {
	forceUriContent?: boolean;
	maxUriLength?: number;
	onUrlReady?: (diagnostics: SaveToObsidianDiagnostics) => void;
}

async function openObsidianUrl(url: string, options?: OpenObsidianUrlOptions): Promise<void> {
	try {
		const response = await browser.runtime.sendMessage({
			action: "openObsidianUrl",
			url: url,
			targetTabId: options?.targetTabId
		}) as { success?: boolean; error?: string } | undefined;

		if (response?.success === false) {
			throw new Error(response.error || 'Failed to open Obsidian URL');
		}
	} catch (error) {
		console.error('Error opening Obsidian URL via background script:', error);
		if (options?.targetTabId) {
			throw error;
		}
		window.open(url, '_blank');
	}
}

function isSilentObsidianHandoff(options?: SaveToObsidianOptions): boolean {
	return generalSettings.silentOpen || !!options?.silent;
}

async function tryClipboardWrite(
	fileContent: string,
	obsidianUrl: string,
	options?: SaveToObsidianOptions,
	fallbackReason?: string
): Promise<void> {
	const success = await copyToClipboard(fileContent);
	
	if (success) {
		// &clipboard tells Obsidian to read data from clipboard instead of the content param.
		// content is a fallback shown only if Obsidian can't access the clipboard (e.g. on Linux).
		obsidianUrl += `&clipboard&content=${encodeURIComponent(getMessage('clipboardError', 'https://help.obsidian.md/web-clipper/troubleshoot'))}`;
		options?.onUrlReady?.({
			urlLength: obsidianUrl.length,
			usesClipboard: true,
			usesUriContent: false,
			silent: isSilentObsidianHandoff(options),
			targetTabId: options?.targetTabId,
			fallbackReason
		});
		await openObsidianUrl(obsidianUrl, options);
		console.log('Obsidian URL:', obsidianUrl);
	} else {
		console.error('All clipboard methods failed, falling back to URI method');
		// Final fallback: use URI method with actual content (same as legacy mode)
		// Note: We don't add &clipboard here since we're bypassing the clipboard entirely
		obsidianUrl += `&content=${encodeURIComponent(fileContent)}`;
		options?.onUrlReady?.({
			urlLength: obsidianUrl.length,
			usesClipboard: false,
			usesUriContent: true,
			silent: isSilentObsidianHandoff(options),
			targetTabId: options?.targetTabId,
			fallbackReason: fallbackReason || 'clipboard-unavailable'
		});
		if (options?.maxUriLength && obsidianUrl.length > options.maxUriLength) {
			throw new Error(getMessage('batchErrorNoteTooLarge', obsidianUrl.length.toString()));
		}
		await openObsidianUrl(obsidianUrl, options);
		console.log('Obsidian URL (URI fallback):', obsidianUrl);
	}
}

export async function saveToObsidian(
	fileContent: string,
	noteName: string,
	path: string,
	vault: string,
	behavior: Template['behavior'],
	options?: SaveToObsidianOptions,
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

	// Add silent parameter if silentOpen is enabled or a caller explicitly asks for it.
	if (isSilentObsidianHandoff(options)) {
		obsidianUrl += '&silent=true';
	}

	if (generalSettings.legacyMode || options?.forceUriContent) {
		// Use the URI method
		const uriContentUrl = `${obsidianUrl}&content=${encodeURIComponent(fileContent)}`;
		options?.onUrlReady?.({
			urlLength: uriContentUrl.length,
			usesClipboard: false,
			usesUriContent: true,
			silent: isSilentObsidianHandoff(options),
			targetTabId: options?.targetTabId
		});
		if (options?.maxUriLength && uriContentUrl.length > options.maxUriLength) {
			throw new Error(getMessage('batchErrorNoteTooLarge', uriContentUrl.length.toString()));
		}
		console.log('Obsidian URL:', uriContentUrl);
		await openObsidianUrl(uriContentUrl, options);
	} else {
		// Try to copy to clipboard with fallback mechanisms
		await tryClipboardWrite(fileContent, obsidianUrl, options);
	}
}
