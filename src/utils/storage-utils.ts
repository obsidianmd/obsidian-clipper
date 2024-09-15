import browser from './browser-polyfill';

export interface GeneralSettings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	silentOpen: boolean;
	openaiApiKey?: string;
	openaiModel?: string;
}

export let generalSettings: GeneralSettings = {
	vaults: [],
	betaFeatures: false,
	silentOpen: false
	showMoreActionsButton: false,
	openaiApiKey: '',
	openaiModel: 'gpt-3.5-turbo'
};

export function setLocalStorage(key: string, value: any): Promise<void> {
	return browser.storage.local.set({ [key]: value });
}

export function getLocalStorage(key: string): Promise<any> {
	return browser.storage.local.get(key).then((result: {[key: string]: any}) => result[key]);
}

export async function loadGeneralSettings(): Promise<GeneralSettings> {
	const data = await browser.storage.sync.get(['general_settings', 'vaults']);

	generalSettings = {
		showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? true,
		vaults: data.vaults || [],
		betaFeatures: data.general_settings?.betaFeatures ?? false,
		silentOpen: data.general_settings?.silentOpen ?? false
	};
	
	return generalSettings;
}

export async function saveGeneralSettings(settings?: Partial<GeneralSettings>): Promise<void> {
	if (settings) {
		generalSettings = { ...generalSettings, ...settings };
	}
	await browser.storage.sync.set({ 
		general_settings: {
			showMoreActionsButton: generalSettings.showMoreActionsButton,
			betaFeatures: generalSettings.betaFeatures,
			silentOpen: generalSettings.silentOpen
			openaiApiKey: generalSettings.openaiApiKey,
			openaiModel: generalSettings.openaiModel
		},
		vaults: generalSettings.vaults 
	});
}
