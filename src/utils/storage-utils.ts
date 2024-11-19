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
	defaultPromptContext: '{{fullHtml|strip_tags:("script,h1,h2,h3,h4,h5,h6,meta,a,ol,ul,li,p,em,strong,i,b,img,video,audio,math,tablecite,strong,td,th,tr,caption,u")|strip_attr:("alt,src,href,id,content,property,name,datetime,title")}}',
	propertyTypes: []
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
}

export async function loadSettings(): Promise<Settings> {
	const data = await browser.storage.sync.get(['general_settings', 'vaults', 'highlighter_settings', 'interpreter_settings', 'property_types']) as StorageData;

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
		propertyTypes: []
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
		propertyTypes: data.property_types || defaultSettings.propertyTypes
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
		property_types: generalSettings.propertyTypes
	});
}

export async function setLegacyMode(enabled: boolean): Promise<void> {
	await saveSettings({ legacyMode: enabled });
	console.log(`Legacy mode ${enabled ? 'enabled' : 'disabled'}`);
}
