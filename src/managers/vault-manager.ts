import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import { initializeIcons } from '../icons/icons';

interface GeneralSettings {
	showVariablesButton?: boolean;
	vaults?: string[];
}

export let vaults: string[] = [];

export async function loadGeneralSettings(): Promise<GeneralSettings> {
	const data = await chrome.storage.sync.get(['general_settings', 'vaults']);
	console.log('Loaded general settings:', data.general_settings);
	console.log('Loaded vaults:', data.vaults);

	vaults = data.vaults || [];
	
	// Merge the general settings with vaults
	const settings: GeneralSettings = {
		...data.general_settings,
		vaults: vaults
	};
	
	return settings;
}

export async function saveGeneralSettings(settings?: Partial<GeneralSettings>): Promise<void> {
	const currentSettings = await loadGeneralSettings();
	const updatedSettings = { ...currentSettings, ...settings };
	
	// Save general settings
	await chrome.storage.sync.set({ general_settings: updatedSettings });
	
	// Save vaults separately
	await chrome.storage.sync.set({ vaults: updatedSettings.vaults });
	
	console.log('Saved general settings:', updatedSettings);
}

export function updateVaultList(): void {
	const vaultList = document.getElementById('vault-list') as HTMLUListElement;
	vaultList.innerHTML = '';
	vaults.forEach((vault, index) => {
		const li = document.createElement('li');
			li.innerHTML = `
				<div class="drag-handle">
					<i data-lucide="grip-vertical"></i>
				</div>
				<span>${vault}</span>
				<button type="button" class="remove-vault-btn clickable-icon" aria-label="Remove vault">
					<i data-lucide="trash-2"></i>
				</button>
			`;
			li.dataset.index = index.toString();
			li.draggable = true;
			li.addEventListener('dragstart', handleDragStart);
			li.addEventListener('dragover', handleDragOver);
			li.addEventListener('drop', handleDrop);
			li.addEventListener('dragend', handleDragEnd);
			const removeBtn = li.querySelector('.remove-vault-btn') as HTMLButtonElement;
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				removeVault(index);
			});
			vaultList.appendChild(li);
	});

	initializeIcons(vaultList);
}

export function addVault(vault: string): void {
	vaults.push(vault);
	saveGeneralSettings({ vaults: vaults });
	updateVaultList();
}

export function removeVault(index: number): void {
	vaults.splice(index, 1);
	saveGeneralSettings({ vaults: vaults });
	updateVaultList();
}

export function getVaults(): string[] {
	return vaults;
}
