import browser from './browser-polyfill';
import { Settings, ModelConfig, PropertyType, HistoryEntry, Provider, Rating } from '../types/types';
import { debugLog } from './debug';
import { cleanupApiUrl } from '../ai-sdk/provider-factory';

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

const CURRENT_MIGRATION_VERSION = 2;

/**
 * Map of provider display names (lowercase) to their models.dev presetId
 * Used to backfill presetId for providers created before we started saving it
 * All keys are lowercase for case-insensitive matching
 */
const PROVIDER_NAME_TO_PRESET_ID: Record<string, string> = {
	'anthropic': 'anthropic',
	'openai': 'openai',
	'google': 'google',
	'google gemini': 'google', // Legacy name mapping
	'gemini': 'google', // Alias for Google Gemini
	'azure openai': 'azure',
	'azure': 'azure',
	'deepseek': 'deepseek',
	'perplexity': 'perplexity',
	'xai': 'xai',
	'openrouter': 'openrouter',
	'hugging face': 'huggingface',
	'huggingface': 'huggingface',
	'meta': 'meta',
	'mistral': 'mistral',
	'cohere': 'cohere',
};

/**
 * Backfill presetId for providers that are missing it
 * This runs on every load to ensure providers always have presetId set
 */
function backfillProviderPresetIds(providers: Provider[]): Provider[] {
	return providers.map(provider => {
		if (!provider.presetId && provider.name) {
			const inferredPresetId = PROVIDER_NAME_TO_PRESET_ID[provider.name.toLowerCase()];
			if (inferredPresetId) {
				return { ...provider, presetId: inferredPresetId };
			}
		}
		return provider;
	});
}

/**
 * Migrate provider IDs that have been renamed
 * All migrations run in version 2:
 *   - azure-openai → azure
 *   - google-gemini → google
 *   - Backfill presetId from provider name for existing providers
 *   - Migrate Ollama providers to Custom (Ollama removed as preset)
 */
function migrateProviders(providers: Provider[]): Provider[] {
	return providers.map(provider => {
		let migrated = { ...provider };
		
		// Migrate azure-openai to azure
		if (provider.id === 'azure-openai' || provider.presetId === 'azure-openai') {
			migrated = {
				...migrated,
				id: provider.id === 'azure-openai' ? 'azure' : provider.id,
				presetId: provider.presetId === 'azure-openai' ? 'azure' : provider.presetId
			};
		}
		
		// Migrate google-gemini to google
		if (provider.id === 'google-gemini' || provider.presetId === 'google-gemini') {
			migrated = {
				...migrated,
				id: provider.id === 'google-gemini' ? 'google' : provider.id,
				presetId: provider.presetId === 'google-gemini' ? 'google' : provider.presetId
			};
		}
		
		// Migrate Ollama providers to Custom
		// Ollama is no longer a preset - users should use Custom with their Ollama URL
		if (provider.presetId === 'ollama' || provider.name === 'Ollama' || provider.name?.toLowerCase().includes('ollama')) {
			// Ensure the base URL is set to Ollama's OpenAI-compatible endpoint
			const rawUrl = migrated.baseUrl || 'http://127.0.0.1:11434';
			// Clean up old API paths and ensure /v1/chat/completions format
			const baseUrl = `${cleanupApiUrl(rawUrl)}/v1/chat/completions`;
			
			migrated = {
				...migrated,
				name: migrated.name || 'Ollama (Local)',
				baseUrl: baseUrl,
				presetId: undefined, // Remove preset association - now a custom provider
				apiKeyRequired: false
			};
			debugLog('Migration', `Migrated Ollama provider "${provider.name}" to Custom with URL "${baseUrl}"`);
		}
		
		// Backfill presetId from provider name if not set
		if (!migrated.presetId && migrated.name) {
			const inferredPresetId = PROVIDER_NAME_TO_PRESET_ID[migrated.name];
			if (inferredPresetId) {
				migrated.presetId = inferredPresetId;
			}
		}
		
		return migrated;
	});
}

/**
 * Migrate model configurations that reference renamed providers
 */
function migrateModels(models: ModelConfig[]): ModelConfig[] {
	return models.map(model => {
		let migrated = { ...model };
		
		// Migrate azure-openai to azure
		if (model.providerId === 'azure-openai') {
			migrated.providerId = 'azure';
		}
		
		// Migrate google-gemini to google
		if (model.providerId === 'google-gemini') {
			migrated.providerId = 'google';
		}
		
		return migrated;
	});
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

	// Validate and sanitize data to prevent corruption
	const sanitizedVaults = Array.isArray(data.vaults) ? data.vaults.filter(v => typeof v === 'string') : [];
	let sanitizedModels = Array.isArray(data.interpreter_settings?.models) 
		? data.interpreter_settings.models.filter(m => m && typeof m === 'object' && typeof m.id === 'string') 
		: [];
	let sanitizedProviders = Array.isArray(data.interpreter_settings?.providers) 
		? data.interpreter_settings.providers.filter(p => p && typeof p === 'object' && typeof p.id === 'string') 
		: [];

	// Run migrations if needed (check BEFORE updating version)
	const needsMigration = !data.migrationVersion || data.migrationVersion < CURRENT_MIGRATION_VERSION;
	if (needsMigration) {
		sanitizedProviders = migrateProviders(sanitizedProviders);
		sanitizedModels = migrateModels(sanitizedModels);
		debugLog('Settings', 'Migrated providers and models to version', CURRENT_MIGRATION_VERSION);
		
		// Persist migrated data and update version atomically to prevent data loss
		await browser.storage.sync.set({
			interpreter_settings: {
				...data.interpreter_settings,
				providers: sanitizedProviders,
				models: sanitizedModels
			},
			migrationVersion: CURRENT_MIGRATION_VERSION
		});
		debugLog('Settings', `Persisted migrations and updated version to ${CURRENT_MIGRATION_VERSION}`);
	}
	
	// Always backfill presetId for providers that are missing it
	// This handles cases where migration ran but wasn't persisted, or providers created before presetId was added
	sanitizedProviders = backfillProviderPresetIds(sanitizedProviders);

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
			highlightBehavior: generalSettings.highlightBehavior
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
