import { Template } from '../types/types';
import { loadTemplates, createDefaultTemplate, templates, getTemplates, findTemplateById, saveTemplateSettings } from '../managers/template-manager';
import { updateTemplateList, showTemplateEditor, resetUnsavedChanges, initializeAddPropertyButton } from '../managers/template-ui';
import { initializeGeneralSettings } from '../managers/general-settings';
import { initializeDragAndDrop, handleTemplateDrag } from '../utils/drag-and-drop';
import { initializeAutoSave } from '../utils/auto-save';
import { exportTemplate, importTemplate, initializeDropZone } from '../utils/import-export';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';
import { showGeneralSettings } from '../managers/general-settings-ui';
import { updateUrl } from '../utils/routing';
import browser from '../utils/browser-polyfill';

// Add this type declaration
interface NavigatorExtended extends Navigator {
	brave?: {
		isBrave: () => Promise<boolean>;
	};
}

document.addEventListener('DOMContentLoaded', async () => {
	const newTemplateBtn = document.getElementById('new-template-btn') as HTMLButtonElement;
	const exportTemplateBtn = document.getElementById('export-template-btn') as HTMLButtonElement;
	const importTemplateBtn = document.getElementById('import-template-btn') as HTMLButtonElement;
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn') as HTMLButtonElement;

	async function initializeSettings(): Promise<void> {
		await initializeGeneralSettings();
		const loadedTemplates = await loadTemplates();
		updateTemplateList(loadedTemplates);
		initializeTemplateListeners();
		await handleUrlParameters();
		initializeSidebar();
		initializeAutoSave();
		setShortcutInstructions(); // Add this line

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

	async function handleUrlParameters(): Promise<void> {
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
		const sidebarItems = document.querySelectorAll('.sidebar li[data-section]');
		const sections = document.querySelectorAll('.settings-section');
		const sidebar = document.querySelector('.sidebar');
		if (sidebar) {
			sidebar.addEventListener('click', (event) => {
				const target = event.target as HTMLElement;
				if (target.dataset.section === 'general') {
					showGeneralSettings();
				}
			});
		}
	
		sidebarItems.forEach(item => {
			item.addEventListener('click', () => {
				const sectionId = (item as HTMLElement).dataset.section;
				sidebarItems.forEach(i => i.classList.remove('active'));
				item.classList.add('active');
				document.querySelectorAll('#template-list li').forEach(templateItem => templateItem.classList.remove('active'));
				const templateEditor = document.getElementById('template-editor');
				if (templateEditor) {
					templateEditor.style.display = 'none';
				}
				sections.forEach(section => {
					if (section.id === `${sectionId}-section`) {
						(section as HTMLElement).style.display = 'block';
						section.classList.add('active');
					} else {
						(section as HTMLElement).style.display = 'none';
						section.classList.remove('active');
					}
				});
			});
		});
	}

	const templateForm = document.getElementById('template-settings-form');
	if (templateForm) {
		initializeAutoSave();
		initializeDragAndDrop();
		initializeDropZone();
		initializeAddPropertyButton();
		handleTemplateDrag();
	}

	await initializeSettings();
});

async function detectBrowser(): Promise<'chrome' | 'firefox' | 'brave' | 'edge' | 'other'> {
	const userAgent = navigator.userAgent.toLowerCase();
	
	if (userAgent.indexOf("firefox") > -1) {
		return 'firefox';
	} else if (userAgent.indexOf("edg/") > -1) {
		return 'edge';
	} else if (userAgent.indexOf("chrome") > -1) {
		// Check for Brave
		const nav = navigator as NavigatorExtended;
		if (nav.brave && await nav.brave.isBrave()) {
			return 'brave';
		}
		return 'chrome';
	} else {
		return 'other';
	}
}

async function setShortcutInstructions() {
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
		shortcutInstructionsElement.innerHTML = `Keyboard shortcuts give you quick access to clipper features. ${instructions}`;
	}
}