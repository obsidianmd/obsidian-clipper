import { normalizeUrl } from './utils/url-utils';

// Keep the declarative content script intentionally small. The background
// checks whether this URL has saved highlights and injects the full content
// script only when they need to be rendered.
try {
	type StorageChange = { newValue?: unknown };
	type ExtensionApi = {
		runtime: {
			sendMessage(message: unknown): Promise<unknown> | undefined;
		};
		storage: {
			onChanged: {
				addListener(listener: (changes: Record<string, StorageChange>, areaName: string) => void): void;
			};
		};
	};

	const extensionApi = (typeof browser !== 'undefined' ? browser : chrome) as unknown as ExtensionApi;
	const requestContentScript = () => {
		const request = extensionApi.runtime.sendMessage({
			action: 'loadContentScriptForHighlights',
			url: window.location.href,
		});
		request?.catch(() => {
			// The extension may have been updated while this page was open.
		});
	};

	requestContentScript();

	// If another tab or extension page creates the first highlight for this
	// page, wake the full content script so cross-tab updates remain live.
	extensionApi.storage.onChanged.addListener((changes, areaName) => {
		if (areaName !== 'local' || !changes.highlights) return;
		const allHighlights = (changes.highlights.newValue || {}) as Record<string, { highlights?: unknown[] }>;
		const rawUrl = window.location.href;
		const stored = allHighlights[normalizeUrl(rawUrl)] ?? allHighlights[rawUrl];
		if (Array.isArray(stored?.highlights) && stored.highlights.length > 0) {
			requestContentScript();
		}
	});
} catch {
	// The extension may have been updated while this page was open.
}
