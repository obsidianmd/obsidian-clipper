import browser from './browser-polyfill';

let currentActiveTabId: number | undefined;
let currentWindowId: number | undefined;

export async function updateCurrentActiveTab(windowId: number) {
	const tabs = await browser.tabs.query({ active: true, windowId: windowId });
	if (tabs[0] && tabs[0].id && tabs[0].url) {
		currentActiveTabId = tabs[0].id;
		currentWindowId = windowId;
		browser.runtime.sendMessage({
			action: "activeTabChanged",
			tabId: currentActiveTabId,
			url: tabs[0].url,
			isValidUrl: isValidUrl(tabs[0].url),
			isBlankPage: isBlankPage(tabs[0].url)
		});
	}
}

export function isValidUrl(url: string): boolean {
	return url.startsWith('http://') || 
		   url.startsWith('https://') || 
		   url.startsWith('file:///');
}

export function isBlankPage(url: string): boolean {
	return url === 'about:blank' || url === 'chrome://newtab/' || url === 'edge://newtab/';
}