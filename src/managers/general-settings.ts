import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import { initializeIcons } from '../icons/icons';
import { getCommands } from '../utils/hotkeys';
import { initializeToggles } from '../utils/ui-utils';

interface GeneralSettings {
	showVariablesButton: boolean;
	vaults: string[];
}

export let generalSettings: GeneralSettings = {
	showVariablesButton: false,
	vaults: []
};

export async function loadGeneralSettings(): Promise<GeneralSettings> {
	const data = await chrome.storage.sync.get(['general_settings', 'vaults']);
	console.log('Loaded general settings:', data.general_settings);
	console.log('Loaded vaults:', data.vaults);

	generalSettings = {
		...data.general_settings,
		vaults: data.vaults || [],
		showVariablesButton: data.general_settings?.showVariablesButton || false
	};
	
	return generalSettings;
}

export async function saveGeneralSettings(settings?: Partial<GeneralSettings>): Promise<void> {
	generalSettings = { ...generalSettings, ...settings };
	
	await chrome.storage.sync.set({ 
		general_settings: { showVariablesButton: generalSettings.showVariablesButton },
		vaults: generalSettings.vaults 
	});
	
	console.log('Saved general settings:', generalSettings);
}

export function updateVaultList(): void {
	const vaultList = document.getElementById('vault-list') as HTMLUListElement;
	if (!vaultList) return;

	vaultList.innerHTML = '';
	generalSettings.vaults.forEach((vault, index) => {
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
	generalSettings.vaults.push(vault);
	saveGeneralSettings();
	updateVaultList();
}

export function removeVault(index: number): void {
	generalSettings.vaults.splice(index, 1);
	saveGeneralSettings();
	updateVaultList();
}

export function initializeGeneralSettings(): void {
	loadGeneralSettings().then(() => {
		updateVaultList();
		initializeShowVariablesToggle();
		initializeVaultInput();
		initializeKeyboardShortcuts();
		initializeToggles();
	});
}

function initializeShowVariablesToggle(): void {
	const showVariablesToggle = document.getElementById('show-variables-toggle') as HTMLInputElement;
	if (showVariablesToggle) {
		showVariablesToggle.checked = generalSettings.showVariablesButton;
		showVariablesToggle.addEventListener('change', () => {
			saveGeneralSettings({ showVariablesButton: showVariablesToggle.checked });
		});
	}
}

function initializeVaultInput(): void {
	const vaultInput = document.getElementById('vault-input') as HTMLInputElement;
	if (vaultInput) {
		vaultInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const newVault = vaultInput.value.trim();
				if (newVault) {
					addVault(newVault);
					vaultInput.value = '';
				}
			}
		});
	}
}

function initializeKeyboardShortcuts(): void {
	const shortcutsList = document.getElementById('keyboard-shortcuts-list');
	if (!shortcutsList) return;

	getCommands().then(commands => {
		commands.forEach(command => {
			const shortcutItem = document.createElement('div');
			shortcutItem.className = 'shortcut-item';
			shortcutItem.innerHTML = `
				<span>${command.description}</span>
				<span class="setting-hotkey">${command.shortcut || 'Not set'}</span>
			`;
			shortcutsList.appendChild(shortcutItem);
		});
	});
}
