import browser from './browser-polyfill';

export interface ModelConfig {
	id: string;
	name: string;
	provider?: string;
	baseUrl: string;
	apiKey?: string;
	enabled: boolean;
}

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	silentOpen: boolean;
	openaiApiKey?: string;
	anthropicApiKey?: string;
	interpreterModel?: string;
	models: ModelConfig[];
	interpreterEnabled: boolean;
	interpreterAutoRun: boolean;
	defaultPromptContext: string;
}

export let generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	silentOpen: false,
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
	defaultPromptContext: '{{fullHtml|strip_tags:("script,h1,h2,h3,h4,h5,h6,meta,a,ol,ul,li,p,em,strong,i,b,img,video,audio,math,tablecite,strong,td,th,tr,caption,u")|strip_attr:("alt,src,href,id,content,property,name,datetime,title")}}'
};

export function setLocalStorage(key: string, value: any): Promise<void> {
	return browser.storage.local.set({ [key]: value });
}

export function getLocalStorage(key: string): Promise<any> {
	return browser.storage.local.get(key).then((result: {[key: string]: any}) => result[key]);
}

export async function loadSettings(): Promise<Settings> {
	const data = await browser.storage.sync.get(['general_settings', 'vaults', 'interpreter_settings']);

	generalSettings = {
		vaults: data.vaults || [],
		showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? true,
		betaFeatures: data.general_settings?.betaFeatures ?? false,
		silentOpen: data.general_settings?.silentOpen ?? false,
		openaiApiKey: data.interpreter_settings?.openaiApiKey || '',
		anthropicApiKey: data.interpreter_settings?.anthropicApiKey || '',
		interpreterModel: data.interpreter_settings?.interpreterModel || 'gpt-4o-mini',
		models: data.interpreter_settings?.models || generalSettings.models,
		interpreterEnabled: data.interpreter_settings?.interpreterEnabled ?? false,
		interpreterAutoRun: data.interpreter_settings?.interpreterAutoRun ?? false,
		defaultPromptContext: data.interpreter_settings?.defaultPromptContext || generalSettings.defaultPromptContext
	};
	
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
			silentOpen: generalSettings.silentOpen
		},
		interpreter_settings: {
			openaiApiKey: generalSettings.openaiApiKey,
			anthropicApiKey: generalSettings.anthropicApiKey,
			interpreterModel: generalSettings.interpreterModel,
			models: generalSettings.models,
			interpreterEnabled: generalSettings.interpreterEnabled,
			interpreterAutoRun: generalSettings.interpreterAutoRun,
			defaultPromptContext: generalSettings.defaultPromptContext
		}
	});
}
