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
