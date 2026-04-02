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
			isBlankPage: isBlankPage(tabs[0].url),
			isRestrictedUrl: isRestrictedUrl(tabs[0].url)
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

// Check if the URL is a browser-protected page that extensions cannot access
export function isRestrictedUrl(url: string): boolean {
	try {
		const urlObj = new URL(url);
		const hostname = urlObj.hostname;
		
		// Firefox addon store
		if (hostname === 'addons.mozilla.org') return true;
		
		// Chrome Web Store
		if (hostname === 'chrome.google.com' && urlObj.pathname.startsWith('/webstore')) return true;
		if (hostname === 'chromewebstore.google.com') return true;
		
		// Edge Add-ons
		if (hostname === 'microsoftedge.microsoft.com' && urlObj.pathname.startsWith('/addons')) return true;
		
		return false;
	} catch {
		return false;
	}
}