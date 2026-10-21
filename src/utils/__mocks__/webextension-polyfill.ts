// Mock for webextension-polyfill in test environment
type StorageChanges = Record<string, { newValue?: unknown; oldValue?: unknown }>;
type StorageChangeListener = (changes: StorageChanges, area: string) => void;
const storageChangeListeners = new Set<StorageChangeListener>();

// Tests can deliver the same event shape as the browser without replacing the
// product listener or making every storage write synchronous.
export function emitStorageChange(changes: StorageChanges, area = 'local'): void {
	for (const listener of storageChangeListeners) listener(changes, area);
}
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
	onChanged: {
		addListener: (listener: StorageChangeListener) => { storageChangeListeners.add(listener); },
		removeListener: (listener: StorageChangeListener) => { storageChangeListeners.delete(listener); },
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
