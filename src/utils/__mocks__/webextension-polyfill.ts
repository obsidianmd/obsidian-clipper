// Mock for webextension-polyfill in test environment
export const runtime = {
	getURL: (path: string) => `chrome-extension://mock-id/${path}`,
	sendMessage: async () => ({}),
	onMessage: {
		addListener: () => {},
		removeListener: () => {},
	},
};

export const storage = {
	local: {
		get: async () => ({}),
		set: async () => {},
	},
	sync: {
		get: async () => ({}),
		set: async () => {},
	},
};

export const tabs = {
	query: async () => [],
	sendMessage: async () => ({}),
};

export const i18n = {
	getMessage: (key: string) => key,
};

export default {
	runtime,
	storage,
	tabs,
	i18n,
};
