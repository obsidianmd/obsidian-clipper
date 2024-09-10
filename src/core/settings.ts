import { Template } from '../types/types';
import { loadTemplates, createDefaultTemplate, templates, getTemplates, findTemplateById, saveTemplateSettings } from '../managers/template-manager';
import { updateTemplateList, showTemplateEditor, resetUnsavedChanges } from '../managers/template-ui';
import { initializeGeneralSettings, addVault } from '../managers/general-settings';
import { initializeSidebar } from '../utils/ui-utils';
import { initializeDragAndDrop } from '../utils/drag-and-drop';
import { initializeAutoSave } from '../utils/auto-save';
import { exportTemplate, importTemplate, initializeDropZone } from '../utils/import-export';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';

function updateUrl(section: string, templateId?: string): void {
	let url = `${window.location.pathname}?section=${section}`;
	if (templateId) {
		url += `&template=${templateId}`;
	}
	window.history.pushState({}, '', url);
}

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input') as HTMLInputElement;
	const newTemplateBtn = document.getElementById('new-template-btn') as HTMLButtonElement;
	const exportTemplateBtn = document.getElementById('export-template-btn') as HTMLButtonElement;
	const importTemplateBtn = document.getElementById('import-template-btn') as HTMLButtonElement;
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn') as HTMLButtonElement;

	function initializeSettings(): void {
		initializeGeneralSettings();
		loadTemplates().then(() => {
			initializeTemplateListeners();
			handleUrlParameters();
		});
		initializeSidebar();
		initializeAutoSave();
		initializeDragAndDrop();
		initializeDropZone();

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
						updateUrl('templates', selectedTemplate.id);
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

	function handleUrlParameters(): void {
		const urlParams = new URLSearchParams(window.location.search);
		const section = urlParams.get('section');
		const templateId = urlParams.get('template');

		if (section === 'general') {
			showGeneralSettings();
		} else if (templateId) {
			const template = findTemplateById(templateId);
			if (template) {
				showTemplateEditor(template);
			} else {
				console.error(`Template with id ${templateId} not found`);
				showGeneralSettings();
			}
		} else {
			showGeneralSettings();
		}
	}

	function showGeneralSettings(): void {
		const generalSection = document.getElementById('general-section');
		const templatesSection = document.getElementById('templates-section');
		if (generalSection) {
			generalSection.style.display = 'block';
			generalSection.classList.add('active');
		}
		if (templatesSection) {
			templatesSection.style.display = 'none';
			templatesSection.classList.remove('active');
		}
		updateUrl('general');

		// Update sidebar active state
		document.querySelectorAll('.sidebar li').forEach(item => item.classList.remove('active'));
		const generalItem = document.querySelector('.sidebar li[data-section="general"]');
		if (generalItem) generalItem.classList.add('active');
	}

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

	function initializeSidebar(): void {
		const sidebar = document.querySelector('.sidebar');
		if (sidebar) {
			sidebar.addEventListener('click', (event) => {
				const target = event.target as HTMLElement;
				if (target.dataset.section === 'general') {
					showGeneralSettings();
				}
			});
		}
	}

	const dropZone = document.getElementById('drop-zone');
	if (dropZone) {
		initializeDropZone();
	}

	const templateForm = document.getElementById('template-settings-form');
	if (templateForm) {
		initializeAutoSave();
	}

	initializeSettings();
});

export { updateUrl };
