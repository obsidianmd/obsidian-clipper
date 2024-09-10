interface GeneralSettings {
	showMoreActionsButton: boolean;
	vaults: string[];
}

export let generalSettings: GeneralSettings = {
	showMoreActionsButton: true,
	vaults: []
};

export function setLocalStorage(key: string, value: any): Promise<void> {
	return new Promise((resolve) => {
		chrome.storage.local.set({ [key]: value }, () => {
			resolve();
		});
	});
}

export function getLocalStorage(key: string): Promise<any> {
	return new Promise((resolve) => {
		chrome.storage.local.get(key, (result) => {
			resolve(result[key]);
		});
	});
}

export async function loadGeneralSettings(): Promise<GeneralSettings> {
	const data = await chrome.storage.sync.get(['general_settings', 'vaults']);
	console.log('Loaded general settings:', data.general_settings);
	console.log('Loaded vaults:', data.vaults);

	generalSettings = {
		showMoreActionsButton: data.general_settings?.showMoreActionsButton ?? true,
		vaults: data.vaults || []
	};
	
	return generalSettings;
}

export async function saveGeneralSettings(settings?: Partial<GeneralSettings>): Promise<void> {
	generalSettings = { ...generalSettings, ...settings };
	
	await chrome.storage.sync.set({ 
		general_settings: { showMoreActionsButton: generalSettings.showMoreActionsButton },
		vaults: generalSettings.vaults 
	});
	
	console.log('Saved general settings:', generalSettings);
}