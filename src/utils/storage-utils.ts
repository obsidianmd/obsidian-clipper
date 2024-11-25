import browser from './browser-polyfill';

export interface ModelConfig {
	id: string;
	name: string;
	provider?: string;
	baseUrl: string;
	apiKey?: string;
	enabled: boolean;
}

export interface PropertyType {
	name: string;
	type: string;
	defaultValue?: string;
}

export interface HistoryEntry {
	datetime: string;
	url: string;
	action: keyof Settings['stats'];
	title?: string;
	vault?: string;
	path?: string;
}

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	legacyMode: boolean;
	silentOpen: boolean;
	highlighterEnabled: boolean;
	alwaysShowHighlights: boolean;
	highlightBehavior: string;
	openaiApiKey?: string;
	anthropicApiKey?: string;
	interpreterModel?: string;
	models: ModelConfig[];
	interpreterEnabled: boolean;
	interpreterAutoRun: boolean;
	defaultPromptContext: string;
	propertyTypes: PropertyType[];
	stats: {
		addToObsidian: number;
		saveFile: number;
		copyToClipboard: number;
		share: number;
	};
	history: HistoryEntry[];
}

export let generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	legacyMode: false,
	silentOpen: false,
	highlighterEnabled: true,
	alwaysShowHighlights: false,
	highlightBehavior: 'highlight-inline',
	showMoreActionsButton: false,
	openaiApiKey: '',
	anthropicApiKey: '',
	interpreterModel: 'gpt-4o-mini',
	models: [
		{ id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1/chat/completions', enabled: true },
		{ id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1/chat/completions', enabled: true },
		{ id: 'gpt-o1-mini', name: 'GPT-o1 Mini', provider: 'OpenAI', baseUrl: 'https://api.openai.com/v1/chat/completions', enabled: true },
		{ id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', enabled: true },
		{ id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', enabled: true },
		{ id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1/messages', enabled: true }
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
		models?: ModelConfig[];
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

	const defaultSettings: Settings = {
		vaults: [],
		showMoreActionsButton: false,
		betaFeatures: false,
		legacyMode: false,
		silentOpen: false,
		highlighterEnabled: true,
		alwaysShowHighlights: true,
		highlightBehavior: 'highlight-inline',
		openaiApiKey: '',
		anthropicApiKey: '',
		interpreterModel: 'gpt-4o-mini',
		models: generalSettings.models,
		interpreterEnabled: false,
		interpreterAutoRun: false,
		defaultPromptContext: generalSettings.defaultPromptContext,
		propertyTypes: [],
		stats: {
			addToObsidian: 0,
			saveFile: 0,
			copyToClipboard: 0,
			share: 0
		},
		history: []
	};

	const loadedSettings: Settings = {
		vaults: data.vaults || defaultSettings.vaults,
		showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? defaultSettings.showMoreActionsButton,
		betaFeatures: data.general_settings?.betaFeatures ?? defaultSettings.betaFeatures,
		legacyMode: data.general_settings?.legacyMode ?? defaultSettings.legacyMode,
		silentOpen: data.general_settings?.silentOpen ?? defaultSettings.silentOpen,
		highlighterEnabled: data.highlighter_settings?.highlighterEnabled ?? defaultSettings.highlighterEnabled,
		alwaysShowHighlights: data.highlighter_settings?.alwaysShowHighlights ?? defaultSettings.alwaysShowHighlights,
		highlightBehavior: data.highlighter_settings?.highlightBehavior ?? defaultSettings.highlightBehavior,
		openaiApiKey: data.interpreter_settings?.openaiApiKey || defaultSettings.openaiApiKey,
		anthropicApiKey: data.interpreter_settings?.anthropicApiKey || defaultSettings.anthropicApiKey,
		interpreterModel: data.interpreter_settings?.interpreterModel || defaultSettings.interpreterModel,
		models: data.interpreter_settings?.models || defaultSettings.models,
		interpreterEnabled: data.interpreter_settings?.interpreterEnabled ?? defaultSettings.interpreterEnabled,
		interpreterAutoRun: data.interpreter_settings?.interpreterAutoRun ?? defaultSettings.interpreterAutoRun,
		defaultPromptContext: data.interpreter_settings?.defaultPromptContext || defaultSettings.defaultPromptContext,
		propertyTypes: data.property_types || defaultSettings.propertyTypes,
		stats: data.stats || defaultSettings.stats,
		history: history
	};

	generalSettings = loadedSettings;
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
			openaiApiKey: generalSettings.openaiApiKey,
			anthropicApiKey: generalSettings.anthropicApiKey,
			interpreterModel: generalSettings.interpreterModel,
			models: generalSettings.models,
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
