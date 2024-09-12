import browser from './browser-polyfill';

export interface GeneralSettings {
	showMoreActionsButton: boolean;
	vaults: string[];
	betaFeatures: boolean;
}

export let generalSettings: GeneralSettings = {
	showMoreActionsButton: true,
	vaults: [],
	betaFeatures: false
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
		betaFeatures: data.general_settings?.betaFeatures ?? false
	};
	
	return generalSettings;
}

export async function saveGeneralSettings(settings?: Partial<GeneralSettings>): Promise<void> {
	generalSettings = { ...generalSettings, ...settings };
	
	await browser.storage.sync.set({ 
		general_settings: {
			showMoreActionsButton: generalSettings.showMoreActionsButton,
			betaFeatures: generalSettings.betaFeatures
		},
		vaults: generalSettings.vaults 
	});
}