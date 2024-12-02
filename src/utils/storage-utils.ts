import browser from './browser-polyfill';
import { Settings, ModelConfig, PropertyType, HistoryEntry, Provider } from '../types/types';
import { debugLog } from './debug';

export type { Settings, ModelConfig, PropertyType, HistoryEntry, Provider };

export let generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	legacyMode: false,
	silentOpen: false,
	highlighterEnabled: true,
	alwaysShowHighlights: false,
	highlightBehavior: 'highlight-inline',
	showMoreActionsButton: false,
	interpreterModel: 'gpt-4o-mini',
	models: [
		{ id: 'gpt-4o-mini', providerId: 'openai', providerModelId: 'gpt-4o-mini', name: 'GPT-4o Mini', enabled: true },
		{ id: 'gpt-4o', providerId: 'openai', providerModelId: 'gpt-4o', name: 'GPT-4o', enabled: true },
		{ id: 'claude-3-5-sonnet-20240620', providerId: 'anthropic', providerModelId: 'claude-3-sonnet-20240620', name: 'Claude 3.5 Sonnet', enabled: true },
		{ id: 'claude-3-haiku-20240307', providerId: 'anthropic', providerModelId: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', enabled: true },
	],
	providers: [
		{
			id: 'openai',
			name: 'OpenAI',
			baseUrl: 'https://api.openai.com/v1/chat/completions',
			apiKey: ''
		},
		{
			id: 'anthropic',
			name: 'Anthropic',
			baseUrl: 'https://api.anthropic.com/v1/messages',
			apiKey: ''
		}
	],
	interpreterEnabled: false,
	interpreterAutoRun: false,
	defaultPromptContext: '',
	propertyTypes: [],
	stats: {
		addToObsidian: 0,
		saveFile: 0,
		copyToClipboard: 0,
		share: 0
	},
	history: []
};

export function setLocalStorage(key: string, value: any): Promise<void> {
	return browser.storage.local.set({ [key]: value });
}

export function getLocalStorage(key: string): Promise<any> {
	return browser.storage.local.get(key).then((result: {[key: string]: any}) => result[key]);
}

// Add interface for old model format
interface LegacyModelConfig {
	id: string;
	name: string;
	provider?: string;
	providerId?: string;
	baseUrl?: string;
	apiKey?: string;
	enabled: boolean;
	providerModelId?: string;
}

// Update the StorageData interface
interface StorageData {
	general_settings?: {
		showMoreActionsButton?: boolean;
		betaFeatures?: boolean;
		legacyMode?: boolean;
		silentOpen?: boolean;
	};
	vaults?: string[];
	highlighter_settings?: {
		highlighterEnabled?: boolean;
		alwaysShowHighlights?: boolean;
		highlightBehavior?: string;
	};
	interpreter_settings?: {
		openaiApiKey?: string;
		anthropicApiKey?: string;
		interpreterModel?: string;
		models?: LegacyModelConfig[];
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
}

function migrateModelsAndProviders(data: StorageData, defaultSettings: Settings): { models: ModelConfig[], providers: Provider[] } {
	// Start with default providers
	let providers = defaultSettings.providers;
	let models = defaultSettings.models;

	// If we have existing models, we need to ensure their providers exist
	if (data.interpreter_settings?.models) {
		const existingModels = data.interpreter_settings.models as LegacyModelConfig[];
		const customProviders = new Map<string, Provider>();

		// First pass: collect all unique providers from existing models
		existingModels.forEach((model: LegacyModelConfig) => {
			if (model.provider && !customProviders.has(model.provider) && 
				!providers.some(p => p.name === model.provider)) {
				// Create a new provider from the model's provider info
				const newProvider: Provider = {
					id: model.provider.toLowerCase().replace(/\s+/g, '-'),
					name: model.provider,
					baseUrl: model.baseUrl || '',
					apiKey: model.apiKey || ''
				};
				customProviders.set(model.provider, newProvider);
			}
		});

		// Add all custom providers to our providers list
		providers = [
			...providers,
			...Array.from(customProviders.values())
		];

		// Second pass: update models to reference providers
		models = existingModels.map((model: LegacyModelConfig) => {
			let providerId: string;

			// Determine the provider ID
			if (model.provider === 'OpenAI') {
				providerId = 'openai';
			} else if (model.provider === 'Anthropic') {
				providerId = 'anthropic';
			} else if (model.provider) {
				// Find the custom provider we created
				const customProvider = customProviders.get(model.provider);
				providerId = customProvider?.id || model.provider.toLowerCase().replace(/\s+/g, '-');
			} else {
				providerId = model.providerId || ''; // Use existing providerId if available
			}

			// For modelId, use either existing modelId or the id field
			const providerModelId = model.providerModelId || model.id;

			return {
				id: model.id,
				providerId,
				providerModelId,
				name: model.name,
				enabled: model.enabled
			};
		});
	}

	return { models, providers };
}

export async function loadSettings(): Promise<Settings> {
	const data = await browser.storage.sync.get([
		'general_settings', 
		'vaults', 
		'highlighter_settings', 
		'interpreter_settings', 
		'property_types',
		'stats'
	]) as StorageData;

	const localData = await browser.storage.local.get('history');
	const history = (localData.history || []) as HistoryEntry[];

	// Load default settings first
	const defaultSettings: Settings = {
		vaults: [],
		showMoreActionsButton: false,
		betaFeatures: false,
		legacyMode: false,
		silentOpen: false,
		highlighterEnabled: true,
		alwaysShowHighlights: true,
		highlightBehavior: 'highlight-inline',
		interpreterModel: 'gpt-4o-mini',
		models: [],
		providers: [],
		interpreterEnabled: false,
		interpreterAutoRun: false,
		defaultPromptContext: '',
		propertyTypes: [],
		stats: {
			addToObsidian: 0,
			saveFile: 0,
			copyToClipboard: 0,
			share: 0
		},
		history: []
	};

	// First load stored providers or use defaults
	const providers = data.interpreter_settings?.providers || generalSettings.providers;
	debugLog('Settings', 'Loaded providers:', providers);

	// Then load stored models or use defaults, ensuring they match ModelConfig type
	const storedModels = data.interpreter_settings?.models || generalSettings.models;
	const models: ModelConfig[] = storedModels.map((model: LegacyModelConfig) => ({
		id: model.id,
		providerId: model.providerId || model.provider?.toLowerCase().replace(/\s+/g, '-') || '',
		providerModelId: model.providerModelId || model.id,
		name: model.name,
		enabled: model.enabled
	}));
	debugLog('Settings', 'Loaded models:', models);

	// Load user settings
	const loadedSettings: Settings = {
		vaults: data.vaults || defaultSettings.vaults,
			showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? defaultSettings.showMoreActionsButton,
			betaFeatures: data.general_settings?.betaFeatures ?? defaultSettings.betaFeatures,
			legacyMode: data.general_settings?.legacyMode ?? defaultSettings.legacyMode,
			silentOpen: data.general_settings?.silentOpen ?? defaultSettings.silentOpen,
			highlighterEnabled: data.highlighter_settings?.highlighterEnabled ?? defaultSettings.highlighterEnabled,
			alwaysShowHighlights: data.highlighter_settings?.alwaysShowHighlights ?? defaultSettings.alwaysShowHighlights,
			highlightBehavior: data.highlighter_settings?.highlightBehavior ?? defaultSettings.highlightBehavior,
			interpreterModel: data.interpreter_settings?.interpreterModel || defaultSettings.interpreterModel,
			models,
			providers,
			interpreterEnabled: data.interpreter_settings?.interpreterEnabled ?? defaultSettings.interpreterEnabled,
			interpreterAutoRun: data.interpreter_settings?.interpreterAutoRun ?? defaultSettings.interpreterAutoRun,
			defaultPromptContext: data.interpreter_settings?.defaultPromptContext || defaultSettings.defaultPromptContext,
			propertyTypes: data.property_types || defaultSettings.propertyTypes,
			stats: data.stats || defaultSettings.stats,
			history: history
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
			silentOpen: generalSettings.silentOpen
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
	path?: string
): Promise<void> {
	const settings = await loadSettings();
	settings.stats[action]++;
	await saveSettings(settings);

	// Get the current tab's URL and title
	const tabs = await browser.tabs.query({ active: true, currentWindow: true });
	if (tabs[0]?.url) {
		await addHistoryEntry(action, tabs[0].url, tabs[0].title, vault, path);
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
