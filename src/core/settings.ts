import { Template } from '../types/types';
import { loadTemplates, updateTemplateList, showTemplateEditor, saveTemplateSettings, createDefaultTemplate, templates, getTemplates } from '../managers/template-manager';
import { loadGeneralSettings, updateVaultList, saveGeneralSettings, addVault } from '../managers/vault-manager';
import { initializeSidebar } from '../utils/ui-utils';
import { initializeDragAndDrop } from '../utils/drag-and-drop';
import { initializeAutoSave } from '../utils/auto-save';
import { exportTemplate, importTemplate } from '../utils/import-export';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input') as HTMLInputElement;
	const newTemplateBtn = document.getElementById('new-template-btn') as HTMLButtonElement;
	const exportTemplateBtn = document.getElementById('export-template-btn') as HTMLButtonElement;
	const importTemplateBtn = document.getElementById('import-template-btn') as HTMLButtonElement;
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn') as HTMLButtonElement;

	function initializeSettings(): void {
		loadGeneralSettings();
		loadTemplates().then(() => {
			initializeTemplateListeners();
		});
		initializeSidebar();
		initializeAutoSave();
		initializeDragAndDrop();

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
