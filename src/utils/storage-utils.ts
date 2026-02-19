import browser from './browser-polyfill';
import { Settings, ModelConfig, PropertyType, HistoryEntry, Provider, Rating } from '../types/types';
import { debugLog } from './debug';
import { copyToClipboard } from 'core/popup';

export type { Settings, ModelConfig, PropertyType, HistoryEntry, Provider, Rating };

export const DEFAULT_HIGHLIGHT_PALETTE = ['#ffeb3b', '#86d26f', '#6db6ff', '#f66d9b', '#bb86fc'];
export const DEFAULT_HIGHLIGHT_COLOR = DEFAULT_HIGHLIGHT_PALETTE[0];

export let generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	legacyMode: false,
	silentOpen: false,
	openBehavior: 'popup',
	highlighterEnabled: true,
	alwaysShowHighlights: false,
	highlightBehavior: 'highlight-inline',
	highlightPalette: [...DEFAULT_HIGHLIGHT_PALETTE],
	showMoreActionsButton: false,
	interpreterModel: '',
	models: [],
	providers: [],
	interpreterEnabled: false,
	interpreterAutoRun: false,
	defaultPromptContext: '',
	propertyTypes: [],
	readerSettings: {
		fontSize: 1.5,
		lineHeight: 1.6,
		maxWidth: 38,
		theme: 'default',
		themeMode: 'auto'
	},
	stats: {
		addToObsidian: 0,
		saveFile: 0,
		copyToClipboard: 0,
		share: 0
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

interface StorageData {
	general_settings?: {
		showMoreActionsButton?: boolean;
		betaFeatures?: boolean;
		legacyMode?: boolean;
		silentOpen?: boolean;
		openBehavior?: boolean | 'popup' | 'embedded';
		saveBehavior?: 'addToObsidian' | 'copyToClipboard' | 'saveFile';
	};
	vaults?: string[];
	highlighter_settings?: {
		highlighterEnabled?: boolean;
		alwaysShowHighlights?: boolean;
		highlightBehavior?: string;
		highlightPalette?: string[];
		// Legacy field kept for backward-compatible parsing; runtime now derives default color from highlightPalette[0].
		defaultHighlightColor?: string;
	};
	reader_settings?: {
		fontSize?: number;
		lineHeight?: number;
		maxWidth?: number;
		theme?: 'default' | 'flexoki';
		themeMode?: 'auto' | 'light' | 'dark';
	};
	interpreter_settings?: {
		interpreterModel?: string;
		models?: ModelConfig[];
		providers?: Provider[];
		interpreterEnabled?: boolean;
		interpreterAutoRun?: boolean;
		defaultPromptContext?: string;
	};
	property_types?: PropertyType[];
	stats?: {
		addToObsidian: number;
		saveFile: number;
		copyToClipboard: number;
		share: number;
	};
	history?: HistoryEntry[];
	ratings?: Rating[];
	migrationVersion?: number;
}

const CURRENT_MIGRATION_VERSION = 1;

function sanitizeHexColor(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export async function loadSettings(): Promise<Settings> {
	const data = await browser.storage.sync.get(null) as StorageData;
	
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
		highlightPalette: [...DEFAULT_HIGHLIGHT_PALETTE],
		interpreterModel: '',
		models: [],
		providers: [],
		interpreterEnabled: false,
		interpreterAutoRun: false,
		defaultPromptContext: '',
		propertyTypes: [],
		saveBehavior: 'addToObsidian',
		readerSettings: {
			fontSize: 1.5,
			lineHeight: 1.6,
			maxWidth: 38,
			theme: 'default',
			themeMode: 'auto'
		},
		stats: {
			addToObsidian: 0,
			saveFile: 0,
			copyToClipboard: 0,
			share: 0
		},
		history: [],
		ratings: [],
	};

	// Update migration version if needed
	if (!data.migrationVersion || data.migrationVersion < CURRENT_MIGRATION_VERSION) {
		await browser.storage.sync.set({ migrationVersion: CURRENT_MIGRATION_VERSION });
		debugLog('Settings', `Updated migration version to ${CURRENT_MIGRATION_VERSION}`);
	}

	// Validate and sanitize data to prevent corruption
	const sanitizedVaults = Array.isArray(data.vaults) ? data.vaults.filter(v => typeof v === 'string') : [];
	const sanitizedModels = Array.isArray(data.interpreter_settings?.models) 
		? data.interpreter_settings.models.filter(m => m && typeof m === 'object' && typeof m.id === 'string') 
		: [];
	const sanitizedProviders = Array.isArray(data.interpreter_settings?.providers) 
		? data.interpreter_settings.providers.filter(p => p && typeof p === 'object' && typeof p.id === 'string') 
		: [];
	const sanitizedHighlightPalette = Array.isArray(data.highlighter_settings?.highlightPalette)
		? data.highlighter_settings.highlightPalette
			.map(sanitizeHexColor)
			.filter((color): color is string => color !== null)
		: [];
	// Ensure at least one configured color exists so highlightPalette[0] can always be used as the runtime default.
	const highlightPalette = sanitizedHighlightPalette.length > 0
		? sanitizedHighlightPalette
		: defaultSettings.highlightPalette;
	// Load user settings
	const loadedSettings: Settings = {
		vaults: sanitizedVaults.length > 0 ? sanitizedVaults : defaultSettings.vaults,
		showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? defaultSettings.showMoreActionsButton,
		betaFeatures: data.general_settings?.betaFeatures ?? defaultSettings.betaFeatures,
		legacyMode: data.general_settings?.legacyMode ?? defaultSettings.legacyMode,
		silentOpen: data.general_settings?.silentOpen ?? defaultSettings.silentOpen,
		openBehavior: typeof data.general_settings?.openBehavior === 'boolean' 
			? (data.general_settings.openBehavior ? 'embedded' : 'popup') 
			: (data.general_settings?.openBehavior ?? defaultSettings.openBehavior),
		highlighterEnabled: data.highlighter_settings?.highlighterEnabled ?? defaultSettings.highlighterEnabled,
		alwaysShowHighlights: data.highlighter_settings?.alwaysShowHighlights ?? defaultSettings.alwaysShowHighlights,
		highlightBehavior: data.highlighter_settings?.highlightBehavior ?? defaultSettings.highlightBehavior,
		highlightPalette: highlightPalette,
		interpreterModel: data.interpreter_settings?.interpreterModel || defaultSettings.interpreterModel,
		models: sanitizedModels,
		providers: sanitizedProviders,
		interpreterEnabled: data.interpreter_settings?.interpreterEnabled ?? defaultSettings.interpreterEnabled,
		interpreterAutoRun: data.interpreter_settings?.interpreterAutoRun ?? defaultSettings.interpreterAutoRun,
		defaultPromptContext: data.interpreter_settings?.defaultPromptContext || defaultSettings.defaultPromptContext,
		propertyTypes: data.property_types || defaultSettings.propertyTypes,
		readerSettings: {
			fontSize: data.reader_settings?.fontSize ?? defaultSettings.readerSettings.fontSize,
			lineHeight: data.reader_settings?.lineHeight ?? defaultSettings.readerSettings.lineHeight,
			maxWidth: data.reader_settings?.maxWidth ?? defaultSettings.readerSettings.maxWidth,
			theme: data.reader_settings?.theme as 'default' | 'flexoki' ?? defaultSettings.readerSettings.theme,
			themeMode: data.reader_settings?.themeMode as 'auto' | 'light' | 'dark' ?? defaultSettings.readerSettings.themeMode
		},
		stats: data.stats || defaultSettings.stats,
		history: data.history || defaultSettings.history,
		ratings: data.ratings || defaultSettings.ratings,
		saveBehavior: data.general_settings?.saveBehavior ?? defaultSettings.saveBehavior
	};

	generalSettings = loadedSettings;
	debugLog('Settings', 'Loaded settings:', generalSettings);
	return generalSettings;
}

export async function saveSettings(settings?: Partial<Settings>): Promise<void> {
	if (settings) {
		generalSettings = { ...generalSettings, ...settings };
	}

	await browser.storage.sync.set({
		vaults: generalSettings.vaults,
		general_settings: {
			showMoreActionsButton: generalSettings.showMoreActionsButton,
			betaFeatures: generalSettings.betaFeatures,
			legacyMode: generalSettings.legacyMode,
			silentOpen: generalSettings.silentOpen,
			openBehavior: generalSettings.openBehavior,
			saveBehavior: generalSettings.saveBehavior,
		},
		highlighter_settings: {
			highlighterEnabled: generalSettings.highlighterEnabled,
			alwaysShowHighlights: generalSettings.alwaysShowHighlights,
			highlightBehavior: generalSettings.highlightBehavior,
			highlightPalette: generalSettings.highlightPalette
		},
		interpreter_settings: {
			interpreterModel: generalSettings.interpreterModel,
			models: generalSettings.models,
			providers: generalSettings.providers,
			interpreterEnabled: generalSettings.interpreterEnabled,
			interpreterAutoRun: generalSettings.interpreterAutoRun,
			defaultPromptContext: generalSettings.defaultPromptContext
		},
		property_types: generalSettings.propertyTypes,
		reader_settings: {
			fontSize: generalSettings.readerSettings.fontSize,
			lineHeight: generalSettings.readerSettings.lineHeight,
			maxWidth: generalSettings.readerSettings.maxWidth,
			theme: generalSettings.readerSettings.theme,
			themeMode: generalSettings.readerSettings.themeMode
		},
		stats: generalSettings.stats
	});
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

// Make storage accessible from console — use `window.debugStorage()` to see all sync storage, or `window.debugStorage(key)` to see a specific key
window.debugStorage = (key?: string) => {
	if (key) {
		return browser.storage.sync.get(key).then(data => {
			console.log(`Sync storage contents for key "${key}":`, data);
			return data;
		});
	}
	return browser.storage.sync.get(null).then(data => {
		console.log('Sync storage contents:', data);
		return data;
	});
};
