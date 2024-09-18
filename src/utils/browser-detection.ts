interface NavigatorExtended extends Navigator {
	brave?: {
		isBrave: () => Promise<boolean>;
	};
}

export async function detectBrowser(): Promise<'chrome' | 'firefox' | 'firefox-mobile' | 'brave' | 'edge' | 'other'> {
	const userAgent = navigator.userAgent.toLowerCase();
	
	if (userAgent.includes('firefox')) {
		return userAgent.includes('mobile') ? 'firefox-mobile' : 'firefox';
	} else if (userAgent.indexOf("edg/") > -1) {
		return 'edge';
	} else if (userAgent.indexOf("chrome") > -1) {
		// Check for Brave
		const nav = navigator as NavigatorExtended;
		if (nav.brave && await nav.brave.isBrave()) {
			return 'brave';
		}
		return 'chrome';
	} else {
		return 'other';
	}
}

export async function addBrowserClassToHtml() {
	const browser = await detectBrowser();
	const htmlElement = document.documentElement;

	// Remove any existing browser classes
	htmlElement.classList.remove('is-firefox-mobile', 'is-chromium', 'is-firefox', 'is-edge', 'is-chrome', 'is-brave');

	// Add the appropriate class based on the detected browser
	switch (browser) {
		case 'firefox-mobile':
			htmlElement.classList.add('is-firefox-mobile', 'is-firefox');
			break;
		case 'firefox':
			htmlElement.classList.add('is-firefox');
			break;
		case 'edge':
			htmlElement.classList.add('is-edge', 'is-chromium');
			break;
		case 'chrome':
			htmlElement.classList.add('is-chrome', 'is-chromium');
			break;
		case 'brave':
			htmlElement.classList.add('is-brave', 'is-chromium');
			break;
		default:
			// For 'other' browsers, we don't add any class
			break;
	}
}