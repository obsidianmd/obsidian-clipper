import { hasStoredHighlights } from './utils/url-utils';

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
	// Once the full content script is loaded it tracks highlight changes itself.
	let contentScriptLoaded = false;
	const requestContentScript = () => {
		const request = extensionApi.runtime.sendMessage({
			action: 'loadContentScriptForHighlights',
			url: window.location.href,
		});
		request?.then((response) => {
			if ((response as { loaded?: boolean } | undefined)?.loaded) {
				contentScriptLoaded = true;
			}
		}).catch(() => {
			// The extension may have been updated while this page was open.
		});
	};

	requestContentScript();

	// If another tab or extension page creates the first highlight for this
	// page, wake the full content script so cross-tab updates remain live.
	extensionApi.storage.onChanged.addListener((changes, areaName) => {
		if (contentScriptLoaded || areaName !== 'local' || !changes.highlights) return;
		if (hasStoredHighlights(changes.highlights.newValue, window.location.href)) {
			requestContentScript();
		}
	});
} catch {
	// The extension may have been updated while this page was open.
}
