import browser from './browser-polyfill';

export async function openObsidianUrl(url: string): Promise<void> {
	if (/Chrome\//i.test(navigator.userAgent)) {
		// Use the runtime OS because desktop-site mode can hide Android in the user agent.
		const platform = await browser.runtime.getPlatformInfo();
		if (platform.os === 'android') {
			// Android Chromium needs a new tab to hand the Obsidian URI to the app.
			await browser.tabs.create({ url });
			return;
		}
	}

	const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
	if (currentTab?.id === undefined) {
		throw new Error('No active tab found');
	}
	await browser.tabs.update(currentTab.id, { url });
}
