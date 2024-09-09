import { Template } from '../types/types';
import { loadTemplates, updateTemplateList, showTemplateEditor, saveTemplateSettings, createDefaultTemplate, templates, getTemplates } from '../managers/template-manager';
import { loadGeneralSettings, updateVaultList, saveGeneralSettings, addVault } from '../managers/general-settings';
import { initializeSidebar, initializeToggles } from '../utils/ui-utils';
import { initializeDragAndDrop } from '../utils/drag-and-drop';
import { initializeAutoSave } from '../utils/auto-save';
import { exportTemplate, importTemplate } from '../utils/import-export';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';
import { resetUnsavedChanges } from '../managers/template-manager';
import { initializeDropZone } from '../utils/import-export';
import { getCommands } from '../utils/hotkeys';

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input') as HTMLInputElement;
	const newTemplateBtn = document.getElementById('new-template-btn') as HTMLButtonElement;
	const exportTemplateBtn = document.getElementById('export-template-btn') as HTMLButtonElement;
	const importTemplateBtn = document.getElementById('import-template-btn') as HTMLButtonElement;
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn') as HTMLButtonElement;

	function initializeSettings(): void {
		loadGeneralSettings().then((settings) => {
			updateVaultList();

			const showVariablesToggle = document.getElementById('show-variables-toggle') as HTMLInputElement;
			if (showVariablesToggle) {
				showVariablesToggle.checked = settings.showVariablesButton || false;
				console.log('Initial state of showVariablesButton:', showVariablesToggle.checked);
				
				showVariablesToggle.addEventListener('change', () => {
					saveGeneralSettings({ showVariablesButton: showVariablesToggle.checked });
				});
			}

			// Initialize toggles after loading settings
			initializeToggles();
		});

		loadTemplates().then(() => {
			initializeTemplateListeners();
		});
		initializeSidebar();
		initializeAutoSave();
		initializeDragAndDrop();
		initializeDropZone();
		initializeKeyboardShortcuts();

		exportTemplateBtn.addEventListener('click', exportTemplate);
		importTemplateBtn.addEventListener('click', importTemplate);
		resetDefaultTemplateBtn.addEventListener('click', resetDefaultTemplate);

		createIcons({ icons });
	}

	function initializeTemplateListeners(): void {
		const templateList = document.getElementById('template-list');
		if (templateList) {
			templateList.addEventListener('click', (event) => {
				const target = event.target as HTMLElement;
				const listItem = target.closest('li');
				if (listItem && listItem.dataset.id) {
					const currentTemplates = getTemplates();
					const selectedTemplate = currentTemplates.find((t: Template) => t.id === listItem.dataset.id);
					if (selectedTemplate) {
						resetUnsavedChanges();
						showTemplateEditor(selectedTemplate);
					}
				}
			});
		} else {
			console.error('Template list not found');
		}

		if (newTemplateBtn) {
			newTemplateBtn.addEventListener('click', () => {
				showTemplateEditor(null);
			});
		}
	}

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
	} else {
		console.error('Vault input not found');
	}

	initializeSettings();
});

function resetDefaultTemplate(): void {
	const defaultTemplate = createDefaultTemplate();
	const currentTemplates = getTemplates();
	const defaultIndex = currentTemplates.findIndex((t: Template) => t.name === 'Default');
	
	if (defaultIndex !== -1) {
		currentTemplates[defaultIndex] = defaultTemplate;
	} else {
		currentTemplates.unshift(defaultTemplate);
	}

	saveTemplateSettings().then(() => {
		updateTemplateList();
		showTemplateEditor(defaultTemplate);
	}).catch(error => {
		console.error('Failed to reset default template:', error);
		alert('Failed to reset default template. Please try again.');
	});
}

function initializeKeyboardShortcuts() {
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
