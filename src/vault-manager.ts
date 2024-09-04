import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from './drag-and-drop';
import { initializeIcons } from './icons';

export let vaults: string[] = [];

export function loadGeneralSettings(): void {
	chrome.storage.sync.get(['vaults'], (data) => {
		vaults = data.vaults || [];
		updateVaultList();
	});
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
	saveGeneralSettings();
	updateVaultList();
}

export function removeVault(index: number): void {
	if (confirm(`Are you sure you want to remove the vault "${vaults[index]}"?`)) {
		vaults.splice(index, 1);
		saveGeneralSettings();
		updateVaultList();
	}
}

export function getVaults(): string[] {
	return vaults;
}

export function saveGeneralSettings(): Promise<void> {
	return new Promise((resolve, reject) => {
		chrome.storage.sync.set({ vaults }, () => {
			if (chrome.runtime.lastError) {
				console.error('Error saving vaults:', chrome.runtime.lastError);
				reject(chrome.runtime.lastError);
			} else {
				console.log('General settings saved');
				resolve();
			}
		});
	});
}
