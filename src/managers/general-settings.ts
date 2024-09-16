import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import { initializeIcons } from '../icons/icons';
import { getCommands } from '../utils/hotkeys';
import { initializeToggles } from '../utils/ui-utils';
import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { detectBrowser } from '../utils/browser-detection';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { initializeLLMSettings } from '../utils/llm-utils';

export function updateVaultList(): void {
	const vaultList = document.getElementById('vault-list') as HTMLUListElement;
	if (!vaultList) return;

	vaultList.innerHTML = '';
	generalSettings.vaults.forEach((vault, index) => {
		const li = document.createElement('li');
		li.dataset.index = index.toString();
		li.draggable = true;

		const dragHandle = createElementWithClass('div', 'drag-handle');
		dragHandle.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'grip-vertical' }));
		li.appendChild(dragHandle);

		const span = document.createElement('span');
		span.textContent = vault;
		li.appendChild(span);

		const removeBtn = createElementWithClass('button', 'remove-vault-btn clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('aria-label', 'Remove vault');
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		li.appendChild(removeBtn);

		li.addEventListener('dragstart', handleDragStart);
		li.addEventListener('dragover', handleDragOver);
		li.addEventListener('drop', handleDrop);
		li.addEventListener('dragend', handleDragEnd);
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
	saveSettings();
	updateVaultList();
}

export function removeVault(index: number): void {
	generalSettings.vaults.splice(index, 1);
	saveSettings();
	updateVaultList();
}

export async function setShortcutInstructions() {
	const shortcutInstructionsElement = document.querySelector('.shortcut-instructions');
	if (shortcutInstructionsElement) {
		const browser = await detectBrowser();
		let instructions = '';
		switch (browser) {
			case 'chrome':
				instructions = 'To change key assignments, go to <code>chrome://extensions/shortcuts</code>';
				break;
			case 'brave':
				instructions = 'To change key assignments, go to <code>brave://extensions/shortcuts</code>';
				break;
			case 'firefox':
				instructions = 'To change key assignments, go to <code>about:addons</code>, click the gear icon, and select "Manage Extension Shortcuts".';
				break;
			case 'edge':
				instructions = 'To change key assignments, go to <code>edge://extensions/shortcuts</code>';
				break;
			default:
				instructions = 'To change key assignments, please refer to your browser\'s extension settings.';
		}
		shortcutInstructionsElement.textContent = 'Keyboard shortcuts give you quick access to clipper features. ';
		const codeElement = document.createElement('code');
		codeElement.textContent = instructions.replace(/<\/?code>/g, '');
		shortcutInstructionsElement.appendChild(codeElement);
	}
}

export function initializeGeneralSettings(): void {
	loadSettings().then(() => {
		updateVaultList();
		initializeShowMoreActionsToggle();
		initializeBetaFeaturesToggle();
		initializeSilentOpenToggle();
		initializeVaultInput();
		initializeKeyboardShortcuts();
		initializeToggles();
		setShortcutInstructions();
		initializeAutoSave();
	});
}

function initializeAutoSave(): void {
	const generalSettingsForm = document.getElementById('general-settings-form');
	if (generalSettingsForm) {
		generalSettingsForm.addEventListener('input', debounce(saveSettingsFromForm, 500));
	}
}

function saveSettingsFromForm(): void {
	const showMoreActionsToggle = document.getElementById('show-more-actions-toggle') as HTMLInputElement;
	const betaFeaturesToggle = document.getElementById('beta-features-toggle') as HTMLInputElement;

	const updatedSettings = {
		showMoreActionsButton: showMoreActionsToggle.checked,
		betaFeatures: betaFeaturesToggle.checked
	};

	saveSettings(updatedSettings);
}

function debounce(func: Function, delay: number): (...args: any[]) => void {
	let timeoutId: NodeJS.Timeout;
	return (...args: any[]) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

function initializeShowMoreActionsToggle(): void {
	const showMoreActionsToggle = document.getElementById('show-more-actions-toggle') as HTMLInputElement;
	if (showMoreActionsToggle) {
		showMoreActionsToggle.checked = generalSettings.showMoreActionsButton;
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
			const shortcutItem = createElementWithClass('div', 'shortcut-item');
			
			const descriptionSpan = document.createElement('span');
			descriptionSpan.textContent = command.description;
			shortcutItem.appendChild(descriptionSpan);

			const hotkeySpan = createElementWithClass('span', 'setting-hotkey');
			hotkeySpan.textContent = command.shortcut || 'Not set';
			shortcutItem.appendChild(hotkeySpan);

			shortcutsList.appendChild(shortcutItem);
		});
	});
}

function initializeBetaFeaturesToggle(): void {
	const betaFeaturesToggle = document.getElementById('beta-features-toggle') as HTMLInputElement;
	if (betaFeaturesToggle) {
		betaFeaturesToggle.checked = generalSettings.betaFeatures;
	}
}

function initializeSilentOpenToggle(): void {
	const silentOpenToggle = document.getElementById('silent-open-toggle') as HTMLInputElement;
	if (silentOpenToggle) {
		silentOpenToggle.checked = generalSettings.silentOpen;
		silentOpenToggle.addEventListener('change', () => {
			saveGeneralSettings({ silentOpen: silentOpenToggle.checked });
		});
	}
}