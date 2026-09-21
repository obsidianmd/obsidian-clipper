// Keep the declarative content script intentionally small. The background
// checks whether this URL has saved highlights and injects the full content
// script only when they need to be rendered.
try {
	const runtime = (typeof browser !== 'undefined' ? browser.runtime : chrome.runtime) as unknown as {
		sendMessage(message: unknown): Promise<unknown> | undefined;
	};
	const request = runtime.sendMessage({
		action: 'loadContentScriptForHighlights',
		url: window.location.href,
	}) as Promise<unknown> | undefined;
	request?.catch(() => {
		// The extension may have been updated while this page was open.
	});
} catch {
	// The extension may have been updated while this page was open.
}
