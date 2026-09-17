import browser from './browser-polyfill';
import { Settings, ModelConfig, PropertyType, HistoryEntry, Provider, Rating } from '../types/types';
import { debugLog } from './debug';
import { loadSyncPayload, updateSyncPayload } from '../sync/sync-manager';
import type { SyncSettings } from '../sync/types';

export type { Settings, ModelConfig, PropertyType, HistoryEntry, Provider, Rating };

export let generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	legacyMode: false,
	silentOpen: false,
	openBehavior: 'popup',
	highlighterEnabled: true,
	alwaysShowHighlights: false,
	highlightBehavior: 'highlight-inline',
	showMoreActionsButton: false,
	interpreterModel: '',
	models: [],
	providers: [],
	interpreterEnabled: false,
	interpreterAutoRun: false,
	defaultPromptContext: '',
	propertyTypes: [],
	readerSettings: {
		fontSize: 16,
		lineHeight: 1.6,
		maxWidth: 38,
		lightTheme: 'default',
		darkTheme: 'same',
		appearance: 'auto',
		fonts: [],
		defaultFont: '',
		blendImages: true,
		colorLinks: false,
		followLinks: true,
		pinPlayer: true,
		autoScroll: true,
		highlightActiveLine: true,
		customCss: ''
	},
	stats: {
		addToObsidian: 0,
		saveFile: 0,
		copyToClipboard: 0,
		share: 0,
		readerMode: 0
	},
	history: [],
	ratings: [],
	saveBehavior: 'addToObsidian'
};

export function setLocalStorage(key: string, value: any): Promise<void> {
	return browser.storage.local.set({ [key]: value });
}

export function getLocalStorage(key: string): Promise<any> {
	return browser.storage.local.get(key).then((result: {[key: string]: any}) => result[key]);
}

export async function loadSettings(): Promise<Settings> {
	const data = (await loadSyncPayload())?.settings ?? {};
	
	// Load default settings first
	const defaultSettings: Settings = {
		vaults: [],
		showMoreActionsButton: false,
		betaFeatures: false,
		legacyMode: false,
		silentOpen: false,
		openBehavior: 'popup',
		highlighterEnabled: true,
		alwaysShowHighlights: true,
		highlightBehavior: 'highlight-inline',
		interpreterModel: '',
		models: [],
		providers: [],
		interpreterEnabled: false,
		interpreterAutoRun: false,
		defaultPromptContext: '',
		propertyTypes: [],
		saveBehavior: 'addToObsidian',
		readerSettings: {
			fontSize: 16,
			lineHeight: 1.6,
			maxWidth: 38,
			lightTheme: 'default',
			darkTheme: 'same',
			appearance: 'auto',
			fonts: [],
			defaultFont: '',
			blendImages: true,
			colorLinks: false,
			followLinks: true,
			pinPlayer: true,
			autoScroll: true,
			highlightActiveLine: true,
			customCss: ''
		},
		stats: {
			addToObsidian: 0,
			saveFile: 0,
			copyToClipboard: 0,
			share: 0,
			readerMode: 0
		},
		history: [],
		ratings: [],
	};

	// Validate and sanitize data to prevent corruption
	const sanitizedVaults = Array.isArray(data.vaults) ? data.vaults.filter(v => typeof v === 'string') : [];
	const sanitizedModels = Array.isArray(data.models)
		? data.models.filter(m => m && typeof m === 'object' && typeof m.id === 'string')
		: [];
	const sanitizedProviders = Array.isArray(data.providers)
		? data.providers.filter(p => p && typeof p === 'object' && typeof p.id === 'string')
		: [];

	// Load user settings
	const loadedSettings: Settings = {
		vaults: sanitizedVaults.length > 0 ? sanitizedVaults : defaultSettings.vaults,
		showMoreActionsButton: data.showMoreActionsButton ?? defaultSettings.showMoreActionsButton,
		betaFeatures: data.betaFeatures ?? defaultSettings.betaFeatures,
		legacyMode: data.legacyMode ?? defaultSettings.legacyMode,
		silentOpen: data.silentOpen ?? defaultSettings.silentOpen,
		openBehavior: typeof data.openBehavior === 'boolean'
			? (data.openBehavior ? 'embedded' : 'popup')
			: (data.openBehavior ?? defaultSettings.openBehavior),
		highlighterEnabled: data.highlighterEnabled ?? defaultSettings.highlighterEnabled,
		alwaysShowHighlights: data.alwaysShowHighlights ?? defaultSettings.alwaysShowHighlights,
		highlightBehavior: data.highlightBehavior ?? defaultSettings.highlightBehavior,
		interpreterModel: data.interpreterModel || defaultSettings.interpreterModel,
		models: sanitizedModels,
		providers: sanitizedProviders,
		interpreterEnabled: data.interpreterEnabled ?? defaultSettings.interpreterEnabled,
		interpreterAutoRun: data.interpreterAutoRun ?? defaultSettings.interpreterAutoRun,
		defaultPromptContext: data.defaultPromptContext || defaultSettings.defaultPromptContext,
		propertyTypes: data.propertyTypes || defaultSettings.propertyTypes,
		readerSettings: {
			fontSize: data.readerSettings?.fontSize ?? defaultSettings.readerSettings.fontSize,
			lineHeight: data.readerSettings?.lineHeight ?? defaultSettings.readerSettings.lineHeight,
			maxWidth: data.readerSettings?.maxWidth ?? defaultSettings.readerSettings.maxWidth,
			lightTheme: data.readerSettings?.lightTheme ?? defaultSettings.readerSettings.lightTheme,
			darkTheme: data.readerSettings?.darkTheme ?? defaultSettings.readerSettings.darkTheme,
			appearance: data.readerSettings?.appearance as 'auto' | 'light' | 'dark' ?? defaultSettings.readerSettings.appearance,
			fonts: data.readerSettings?.fonts ?? defaultSettings.readerSettings.fonts,
			defaultFont: data.readerSettings?.defaultFont ?? defaultSettings.readerSettings.defaultFont,
			blendImages: data.readerSettings?.blendImages ?? defaultSettings.readerSettings.blendImages,
			colorLinks: data.readerSettings?.colorLinks ?? defaultSettings.readerSettings.colorLinks,
			followLinks: data.readerSettings?.followLinks ?? defaultSettings.readerSettings.followLinks,
			pinPlayer: data.readerSettings?.pinPlayer ?? defaultSettings.readerSettings.pinPlayer,
			autoScroll: data.readerSettings?.autoScroll ?? defaultSettings.readerSettings.autoScroll,
			highlightActiveLine: data.readerSettings?.highlightActiveLine ?? defaultSettings.readerSettings.highlightActiveLine,
			customCss: data.readerSettings?.customCss ?? defaultSettings.readerSettings.customCss
		},
		stats: { ...defaultSettings.stats, ...data.stats },
		history: defaultSettings.history,
		ratings: defaultSettings.ratings,
		saveBehavior: data.saveBehavior ?? defaultSettings.saveBehavior
	};

	generalSettings = loadedSettings;
	debugLog('Settings', 'Loaded settings:', generalSettings);
	return generalSettings;
}

export async function saveSettings(settings?: Partial<Settings>): Promise<void> {
	if (settings) {
		generalSettings = {
			...generalSettings,
			...settings,
			readerSettings: settings.readerSettings
				? { ...generalSettings.readerSettings, ...settings.readerSettings }
				: generalSettings.readerSettings,
			stats: settings.stats ? { ...generalSettings.stats, ...settings.stats } : generalSettings.stats,
		};
	}

	const changedSettings = settings ? toSyncSettings(settings) : toSyncSettings(generalSettings);
	await updateSyncPayload(payload => ({
		...payload,
		settings: {
			...payload.settings,
			...changedSettings,
			readerSettings: changedSettings.readerSettings
				? { ...payload.settings.readerSettings, ...changedSettings.readerSettings }
				: payload.settings.readerSettings,
			stats: changedSettings.stats
				? { ...payload.settings.stats, ...changedSettings.stats }
				: payload.settings.stats,
		},
	}));
}

function toSyncSettings(settings: Partial<Settings>): SyncSettings {
	const synced: SyncSettings = {};
	const keys: Array<keyof Omit<Settings, 'history' | 'ratings' | 'readerSettings' | 'stats'>> = [
		'vaults', 'showMoreActionsButton', 'betaFeatures', 'legacyMode', 'silentOpen', 'openBehavior',
		'highlighterEnabled', 'alwaysShowHighlights', 'highlightBehavior', 'interpreterModel', 'models',
		'providers', 'interpreterEnabled', 'interpreterAutoRun', 'defaultPromptContext', 'propertyTypes',
		'saveBehavior',
	];
	for (const key of keys) {
		if (settings[key] !== undefined) {
			(synced as Record<string, unknown>)[key] = settings[key];
		}
	}
	if (settings.readerSettings !== undefined) synced.readerSettings = settings.readerSettings;
	if (settings.stats !== undefined) synced.stats = settings.stats;
	return synced;
}

export async function setLegacyMode(enabled: boolean): Promise<void> {
	await saveSettings({ legacyMode: enabled });
	console.log(`Legacy mode ${enabled ? 'enabled' : 'disabled'}`);
}

export async function incrementStat(
	action: keyof Settings['stats'],
	vault?: string,
	path?: string,
	url?: string,
	title?: string
): Promise<void> {
	const settings = await loadSettings();
	settings.stats[action]++;
	await saveSettings(settings);

	// Add history entry if URL is provided
	if (url) {
		await addHistoryEntry(action, url, title, vault, path);
	}
}

export async function addHistoryEntry(
	action: keyof Settings['stats'], 
	url: string, 
	title?: string,
	vault?: string,
	path?: string
): Promise<void> {
	const entry: HistoryEntry = {
		datetime: new Date().toISOString(),
		url,
		action,
		title,
		vault,
		path
	};

	// Get existing history from local storage
	const result = await browser.storage.local.get('history');
	const history: HistoryEntry[] = (result.history || []) as HistoryEntry[];

	// Add new entry at the beginning
	history.unshift(entry);

	// Keep only the last 1000 entries
	const trimmedHistory = history.slice(0, 1000);

	// Save back to local storage
	await browser.storage.local.set({ history: trimmedHistory });
}

export async function getClipHistory(): Promise<HistoryEntry[]> {
	const result = await browser.storage.local.get('history');
	return (result.history || []) as HistoryEntry[];
}

declare global {
	interface Window {
		debugStorage: (key?: string) => Promise<Record<string, unknown>>;
	}
}

// Make the selected provider payload accessible from the console.
if (typeof window !== 'undefined') {
	window.debugStorage = async (key?: string) => {
		const payload = await loadSyncPayload();
		const data = (payload ?? {}) as Record<string, unknown>;
		const result = key ? { [key]: data[key] } : data;
		console.log('Selected sync provider contents:', result);
		return result;
	};
}
