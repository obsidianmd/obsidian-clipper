import browser from './browser-polyfill';

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	silentOpen: boolean;
	openaiApiKey?: string;
	openaiModel?: string;
	anthropicApiKey?: string;
	interpreterEnabled: boolean;
	interpreterAutoRun: boolean;
}

export let generalSettings: Settings = {
	vaults: [],
	betaFeatures: false,
	silentOpen: false
	showMoreActionsButton: false,
	openaiApiKey: '',
	openaiModel: 'gpt-4o-mini',
	anthropicApiKey: '',
	interpreterEnabled: false,
	interpreterAutoRun: false
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
		showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? true,
		vaults: data.vaults || [],
		betaFeatures: data.general_settings?.betaFeatures ?? false,
		silentOpen: data.general_settings?.silentOpen ?? false
		openaiApiKey: data.interpreter_settings?.openaiApiKey || '',
		openaiModel: data.interpreter_settings?.openaiModel || 'gpt-4o-mini',
		anthropicApiKey: data.interpreter_settings?.anthropicApiKey || '',
		interpreterEnabled: data.interpreter_settings?.interpreterEnabled ?? false,
		interpreterAutoRun: data.interpreter_settings?.interpreterAutoRun ?? false
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
			openaiModel: generalSettings.openaiModel,
			anthropicApiKey: generalSettings.anthropicApiKey,
			interpreterEnabled: generalSettings.interpreterEnabled,
			interpreterAutoRun: generalSettings.interpreterAutoRun
		}
	});
}
