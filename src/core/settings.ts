import { Template } from '../types/types';
import { 
	loadTemplates, 
	createDefaultTemplate, 
	templates, 
	getTemplates, 
	findTemplateById, 
	saveTemplateSettings, 
	duplicateTemplate,
	getEditingTemplateIndex,
	deleteTemplate
} from '../managers/template-manager';
import { updateTemplateList, showTemplateEditor, resetUnsavedChanges, initializeAddPropertyButton } from '../managers/template-ui';
import { initializeGeneralSettings } from '../managers/general-settings';
import { showSettingsSection, initializeSidebar } from '../managers/settings-section-ui';
import { initializeInterpreterSettings } from '../managers/interpreter-settings';
import { initializeDragAndDrop, handleTemplateDrag } from '../utils/drag-and-drop';
import { initializeAutoSave } from '../utils/auto-save';
import { exportTemplate, importTemplate, initializeDropZone } from '../utils/import-export';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';
import { updateUrl, getUrlParameters } from '../utils/routing';
import browser from '../utils/browser-polyfill';
import { addBrowserClassToHtml } from '../utils/browser-detection';
import { initializeMenu, addMenuItemListener } from '../managers/menu';

document.addEventListener('DOMContentLoaded', async () => {
	const newTemplateBtn = document.getElementById('new-template-btn') as HTMLButtonElement;
	const exportTemplateBtn = document.getElementById('export-template-btn') as HTMLButtonElement;
	const importTemplateBtn = document.getElementById('import-template-btn') as HTMLButtonElement;
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn') as HTMLButtonElement;
	const duplicateTemplateBtn = document.getElementById('duplicate-template-btn') as HTMLElement;
	const deleteTemplateBtn = document.getElementById('delete-template-btn') as HTMLElement;
	const moreActionsBtn = document.getElementById('more-actions-btn') as HTMLButtonElement;
	const menu = document.querySelector('.menu-btn') as HTMLElement;

	async function initializeSettings(): Promise<void> {
		await initializeGeneralSettings();
		await initializeInterpreterSettings();
		const loadedTemplates = await loadTemplates();
		updateTemplateList(loadedTemplates);
		initializeTemplateListeners();
		await handleUrlParameters();
		initializeSidebar();
		initializeAutoSave();

		console.log('Initializing menu');
		initializeMenu('more-actions-btn', 'template-actions-menu');

		exportTemplateBtn.addEventListener('click', exportTemplate);
		importTemplateBtn.addEventListener('click', importTemplate);
		resetDefaultTemplateBtn.addEventListener('click', resetDefaultTemplate);

		createIcons({ icons });
	}

	function initializeTemplateListeners(): void {
		if (newTemplateBtn) {
			newTemplateBtn.addEventListener('click', () => {
				showTemplateEditor(null);
			});
		}

		addMenuItemListener('duplicate-template-btn', 'template-actions-menu', duplicateCurrentTemplate);
		addMenuItemListener('delete-template-btn', 'template-actions-menu', deleteCurrentTemplate);
	}

	function duplicateCurrentTemplate(): void {
		const editingTemplateIndex = getEditingTemplateIndex();
		if (editingTemplateIndex !== -1) {
			const currentTemplate = templates[editingTemplateIndex];
			const newTemplate = duplicateTemplate(currentTemplate.id);
			saveTemplateSettings().then(() => {
				updateTemplateList();
				showTemplateEditor(newTemplate);
				updateUrl('templates', newTemplate.id);
			}).catch(error => {
				console.error('Failed to duplicate template:', error);
				alert('Failed to duplicate template. Please try again.');
			});
		}
	}

	function deleteCurrentTemplate(): void {
		const editingTemplateIndex = getEditingTemplateIndex();
		if (editingTemplateIndex !== -1) {
			const currentTemplate = templates[editingTemplateIndex];
			if (confirm(`Are you sure you want to delete the template "${currentTemplate.name}"?`)) {
				deleteTemplate(currentTemplate.id);
				saveTemplateSettings().then(() => {
					updateTemplateList();
					if (templates.length > 0) {
						showTemplateEditor(templates[0]);
					} else {
						showSettingsSection('general');
					}
				}).catch(error => {
					console.error('Failed to delete template:', error);
					alert('Failed to delete template. Please try again.');
					showSettingsSection('general');
				});
			}
		}
	}

	async function handleUrlParameters(): Promise<void> {
		const { section, templateId } = getUrlParameters();

		if (section === 'general' || section === 'interpreter') {
			showSettingsSection(section);
		} else if (templateId) {
			const template = findTemplateById(templateId);
			if (template) {
				showTemplateEditor(template);
			} else {
				console.error(`Template with id ${templateId} not found`);
				showSettingsSection('general');
			}
		} else {
			showSettingsSection('general');
		}
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

	const templateForm = document.getElementById('template-settings-form');
	if (templateForm) {
		initializeDragAndDrop();
		initializeDropZone();
		initializeAddPropertyButton();
		handleTemplateDrag();
	}
	await addBrowserClassToHtml();
	await initializeSettings();
});
