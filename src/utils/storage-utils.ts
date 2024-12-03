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

interface LegacyStorageData extends StorageData {
	openaiApiKey?: string;
	anthropicApiKey?: string;
	openaiModel?: string;
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
}

async function migrateModelsAndProviders(data: LegacyStorageData, defaultSettings: Settings): Promise<{ models: ModelConfig[], providers: Provider[] }> {
	debugLog('Settings', 'Starting migration check with data:', data);
	
	// Start with default providers
	let providers = data.interpreter_settings?.providers || defaultSettings.providers;
	let models = data.interpreter_settings?.models || defaultSettings.models;

	// Check for legacy keys in both locations
	const hasLegacyKeys = data.anthropicApiKey || 
		data.openaiApiKey || 
		data.interpreter_settings?.anthropicApiKey || 
		data.interpreter_settings?.openaiApiKey;

	debugLog('Settings', 'Legacy keys check:', {
		topLevelAnthropicKey: data.anthropicApiKey,
		topLevelOpenAIKey: data.openaiApiKey,
		interpreterAnthropicKey: data.interpreter_settings?.anthropicApiKey,
		interpreterOpenAIKey: data.interpreter_settings?.openaiApiKey,
		hasLegacyKeys
	});

	if (hasLegacyKeys) {
		debugLog('Settings', 'Detected legacy API keys, running migration');
		let needsSave = false;

		// Migrate OpenAI API key - check all possible locations
		const openaiApiKey = data.openaiApiKey || data.interpreter_settings?.openaiApiKey || '';
		if (openaiApiKey) {
			const openaiProvider = providers.find(p => p.id === 'openai');
			debugLog('Settings', 'OpenAI migration:', { openaiApiKey, openaiProvider });
			if (openaiProvider) {
				openaiProvider.apiKey = openaiApiKey;
				needsSave = true;
				debugLog('Settings', 'Migrated OpenAI API key');
			}
		}

		// Migrate Anthropic API key - check all possible locations
		const anthropicApiKey = data.anthropicApiKey || data.interpreter_settings?.anthropicApiKey || '';
		if (anthropicApiKey) {
			const anthropicProvider = providers.find(p => p.id === 'anthropic');
			debugLog('Settings', 'Anthropic migration:', { anthropicApiKey, anthropicProvider });
			if (anthropicProvider) {
				anthropicProvider.apiKey = anthropicApiKey;
				needsSave = true;
				debugLog('Settings', 'Migrated Anthropic API key');
			}
		}

		// Clean up old keys if needed
		if (needsSave) {
			try {
				debugLog('Settings', 'Starting migration cleanup...');

				// First save the updated interpreter settings
				const updatedInterpreterSettings = {
					...data.interpreter_settings,
					providers,
				};

				debugLog('Settings', 'Saving updated interpreter settings:', updatedInterpreterSettings);
				await browser.storage.sync.set({ 
					interpreter_settings: updatedInterpreterSettings
				});

				// Then clear out the old keys by setting them to null (undefined doesn't work in Chrome storage)
				debugLog('Settings', 'Clearing legacy keys...');
				await browser.storage.sync.remove(['anthropicApiKey', 'openaiApiKey', 'openaiModel']);

				// Verify the cleanup
				const verifyData = await browser.storage.sync.get(null);
				debugLog('Settings', 'Storage after cleanup:', verifyData);

			} catch (error) {
				console.error('Error during migration cleanup:', error);
				debugLog('Settings', 'Migration error:', error);
			}
		} else {
			debugLog('Settings', 'No changes needed during migration');
		}

		// Update any OpenAI or Anthropic models to use the correct provider IDs
		models = models.map(model => {
			const legacyModel = model as LegacyModelConfig;
			
			// Create a new ModelConfig object
			const updatedModel: ModelConfig = {
				id: legacyModel.id,
				providerId: '',
				providerModelId: legacyModel.id,
				name: legacyModel.name,
				enabled: legacyModel.enabled
			};
			
			// Update legacy OpenAI models
			if (legacyModel.provider === 'OpenAI' || legacyModel.name.toLowerCase().includes('gpt')) {
				updatedModel.providerId = 'openai';
				updatedModel.providerModelId = legacyModel.id;
			}
			
			// Update legacy Anthropic models
			if (legacyModel.provider === 'Anthropic' || legacyModel.name.toLowerCase().includes('claude')) {
				updatedModel.providerId = 'anthropic';
				updatedModel.providerModelId = legacyModel.id;
			}

			return updatedModel;
		});
	}

	// Handle any remaining custom providers from models
	if (models?.length) {
		const customProviders = new Map<string, Provider>();

		// First pass: collect all unique providers from existing models
		models.forEach((model) => {
			const legacyModel = model as LegacyModelConfig;
			if (legacyModel.provider && 
				!customProviders.has(legacyModel.provider) && 
				!providers.some(p => p.name === legacyModel.provider) &&
				legacyModel.provider !== 'OpenAI' && 
				legacyModel.provider !== 'Anthropic') {
				
				// Create a new provider from the model's provider info
				const newProvider: Provider = {
					id: legacyModel.provider.toLowerCase().replace(/\s+/g, '-'),
					name: legacyModel.provider,
					baseUrl: legacyModel.baseUrl || '',
					apiKey: legacyModel.apiKey || ''
				};
				customProviders.set(legacyModel.provider, newProvider);
			}
		});

		// Add custom providers to our providers list
		providers = [
			...providers,
			...Array.from(customProviders.values())
		];

		// Second pass: ensure all models have proper provider references
		models = models.map((model) => {
			const legacyModel = model as LegacyModelConfig;
			
			// Skip if already processed in the OpenAI/Anthropic pass
			if (model.providerId === 'openai' || model.providerId === 'anthropic') {
				return model as ModelConfig;
			}

			let providerId: string = '';
			if (legacyModel.provider) {
				const customProvider = customProviders.get(legacyModel.provider);
				providerId = customProvider?.id || legacyModel.provider.toLowerCase().replace(/\s+/g, '-');
			}

			const updatedModel: ModelConfig = {
				id: legacyModel.id,
				providerId,
				providerModelId: legacyModel.id,
				name: legacyModel.name,
				enabled: legacyModel.enabled
			};

			return updatedModel;
		});
	}

	return { 
		models: models as ModelConfig[], 
		providers 
	};
}

export async function loadSettings(): Promise<Settings> {
	const data = await browser.storage.sync.get([
		'general_settings', 
		'vaults', 
		'highlighter_settings', 
		'interpreter_settings',
		'property_types',
		'stats',
		// Also get legacy keys to check if migration is needed
		'anthropicApiKey',
		'openaiApiKey',
		'openaiModel'
	]) as LegacyStorageData;

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

	// Migrate models and providers if needed
	const { models, providers } = await migrateModelsAndProviders(data, defaultSettings);

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
