import browser from './browser-polyfill';

export function flattenShadowDom(doc: Document): Promise<void> {
	let found = false;
	const all = doc.querySelectorAll('*');
	for (let i = 0; i < all.length; i++) {
		if (all[i].shadowRoot) {
			found = true;
			break;
		}
	}
	if (!found) return Promise.resolve();

	return new Promise((resolve) => {
		const script = doc.createElement('script');
		script.src = browser.runtime.getURL('flatten-shadow-dom.js');
		script.onload = () => {
			script.remove();
			resolve();
		};
		script.onerror = () => {
			script.remove();
			resolve(); // Continue even if injection fails
		};
		(doc.head || doc.documentElement).appendChild(script);
	});
}
