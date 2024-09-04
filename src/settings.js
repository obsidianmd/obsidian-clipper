import { loadTemplates, updateTemplateList, showTemplateEditor, saveTemplateSettings, createDefaultTemplate, templates, getTemplates } from './template-manager.js';
import { loadGeneralSettings, updateVaultList, saveGeneralSettings, addVault } from './vault-manager.js';
import { initializeSidebar } from './ui-utils.js';
import { initializeDragAndDrop } from './drag-and-drop.js';
import { initializeAutoSave } from './auto-save.js';
import { exportTemplate, importTemplate } from './import-export.js';
import { createIcons } from 'lucide';
import { icons } from './icons.js';

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input');
	const newTemplateBtn = document.getElementById('new-template-btn');
	const exportTemplateBtn = document.getElementById('export-template-btn');
	const importTemplateBtn = document.getElementById('import-template-btn');
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn');

	function initializeSettings() {
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

	function initializeTemplateListeners() {
		const templateList = document.getElementById('template-list');
		if (templateList) {
			templateList.addEventListener('click', (event) => {
				if (event.target.closest('li')) {
					const currentTemplates = getTemplates();
					const selectedTemplate = currentTemplates.find(t => t.id === event.target.closest('li').dataset.id);
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

function resetDefaultTemplate() {
	const defaultTemplate = createDefaultTemplate();
	const currentTemplates = getTemplates();
	const defaultIndex = currentTemplates.findIndex(t => t.name === 'Default');
	
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