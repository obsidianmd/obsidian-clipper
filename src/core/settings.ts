import { 
	deleteTemplate,
	duplicateTemplate,
	findTemplateById, 
	getEditingTemplateIndex, 
	loadTemplates, 
	saveTemplateSettings, 
	templates,
	cleanupTemplateStorage,
	rebuildTemplateList
} from '../managers/template-manager';
import { updateTemplateList, showTemplateEditor, initializeAddPropertyButton } from '../managers/template-ui';
import { initializeGeneralSettings } from '../managers/general-settings';
import { showSettingsSection, initializeSidebar } from '../managers/settings-section-ui';
import { initializeReaderSettings } from '../managers/reader-settings';
import { initializeAutoSave } from '../utils/auto-save';
import { handleTemplateDrag, initializeDragAndDrop } from '../utils/drag-and-drop';
import { exportTemplate, showTemplateImportModal, copyTemplateToClipboard } from '../utils/import-export';
import { createIcons } from 'lucide';
import { icons } from '../icons/icons';
import { updateUrl, getUrlParameters } from '../utils/routing';
import { addBrowserClassToHtml } from '../utils/browser-detection';
import { initializeMenu } from '../managers/menu';
import { addMenuItemListener } from '../managers/menu';
import { translatePage, getCurrentLanguage, setLanguage, getAvailableLanguages, getMessage, setupLanguageAndDirection } from '../utils/i18n';
import { generalSettings, saveSettings } from '../utils/storage-utils';
import { testConnection } from '../utils/hoarder-api';

declare global {
	interface Window {
		cleanupTemplateStorage: () => Promise<void>;
		rebuildTemplateList: () => Promise<void>;
	}
}

window.cleanupTemplateStorage = cleanupTemplateStorage;
window.rebuildTemplateList = rebuildTemplateList;

document.addEventListener('DOMContentLoaded', async () => {
	const newTemplateBtn = document.getElementById('new-template-btn') as HTMLButtonElement;

	async function initializeSettings(): Promise<void> {
		await translatePage();
		
		await initializeGeneralSettings();
		await initializeReaderSettings();
		const loadedTemplates = await loadTemplates();
		updateTemplateList(loadedTemplates);
		initializeTemplateListeners();
		await handleUrlParameters();
		initializeSidebar();
		initializeAutoSave();
		initializeMenu('more-actions-btn', 'template-actions-menu');

		createIcons({ icons });

		// Initialize language selector
		const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
		if (languageSelect) {
			await initializeLanguageSelector(languageSelect);
		}

		// Hoarder settings
		const hoarderServerUrl = document.getElementById('hoarder-server-url') as HTMLInputElement;
		const hoarderApiKey = document.getElementById('hoarder-api-key') as HTMLInputElement;
		const hoarderEnabledToggle = document.getElementById('hoarder-enabled-toggle') as HTMLInputElement;
		const hoarderConnectionStatus = document.getElementById('hoarder-connection-status');

		async function updateHoarderConnectionStatus() {
			if (!hoarderConnectionStatus) return;
			
			try {
				const { ok, user } = await testConnection();
				if (ok && user) {
					hoarderConnectionStatus.innerHTML = `
						<div class="connection-status success">
							<span class="status-icon">✓</span>
							Connected as ${user.email}
						</div>
					`;
					hoarderConnectionStatus.classList.remove('error');
					hoarderConnectionStatus.classList.add('success');
				} else {
					hoarderConnectionStatus.innerHTML = `
						<div class="connection-status error">
							<span class="status-icon">✗</span>
							Not connected
						</div>
					`;
					hoarderConnectionStatus.classList.remove('success');
					hoarderConnectionStatus.classList.add('error');
				}
			} catch (error) {
				hoarderConnectionStatus.innerHTML = `
					<div class="connection-status error">
						<span class="status-icon">✗</span>
						Connection error
					</div>
				`;
				hoarderConnectionStatus.classList.remove('success');
				hoarderConnectionStatus.classList.add('error');
			}
		}

		if (hoarderServerUrl) {
			hoarderServerUrl.value = generalSettings.hoarderServerUrl;
			hoarderServerUrl.addEventListener('change', async () => {
				await saveSettings({ hoarderServerUrl: hoarderServerUrl.value });
				await updateHoarderConnectionStatus();
			});
		}

		if (hoarderApiKey) {
			hoarderApiKey.value = generalSettings.hoarderApiKey;
			hoarderApiKey.addEventListener('change', async () => {
				await saveSettings({ hoarderApiKey: hoarderApiKey.value });
				await updateHoarderConnectionStatus();
			});
		}

		if (hoarderEnabledToggle) {
			hoarderEnabledToggle.checked = generalSettings.hoarderEnabled;
			hoarderEnabledToggle.addEventListener('change', async () => {
				await saveSettings({ hoarderEnabled: hoarderEnabledToggle.checked });
				if (hoarderEnabledToggle.checked) {
					await updateHoarderConnectionStatus();
				}
			});
		}

		// Initial connection status check
		if (generalSettings.hoarderEnabled) {
			updateHoarderConnectionStatus();
		}
	}

	async function initializeLanguageSelector(languageSelect: HTMLSelectElement): Promise<void> {
		try {
			await setupLanguageAndDirection();
			await translatePage();
			
			// Populate language options
			const languages = getAvailableLanguages();
			const currentLanguage = await getCurrentLanguage();
			
			languageSelect.innerHTML = languages.map((lang: { code: string; name: string }) => {
				const displayName = lang.code === '' ? getMessage('systemDefault') : lang.name;
				return `<option value="${lang.code}" ${lang.code === currentLanguage ? 'selected' : ''}>${displayName}</option>`;
			}).join('');

			// Add change listener
			languageSelect.addEventListener('change', async () => {
				try {
					await setLanguage(languageSelect.value);
					window.location.reload(); // Force reload the current page
				} catch (error) {
					console.error('Failed to change language:', error);
				}
			});
		} catch (error) {
			console.error('Failed to initialize language selector:', error);
		}
	}

	function initializeTemplateListeners(): void {
		if (newTemplateBtn) {
			newTemplateBtn.addEventListener('click', () => {
				showTemplateEditor(null);
			});
		}

		addMenuItemListener('#duplicate-template-btn', 'template-actions-menu', duplicateCurrentTemplate);
		addMenuItemListener('#delete-template-btn', 'template-actions-menu', deleteCurrentTemplate);
		addMenuItemListener('.export-template-btn', 'template-actions-menu', exportTemplate);
		addMenuItemListener('.import-template-btn', 'template-actions-menu', showTemplateImportModal);
		addMenuItemListener('#copy-template-json-btn', 'template-actions-menu', copyCurrentTemplateToClipboard);
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
				alert(getMessage('failedToDuplicateTemplate'));
			});
		}
	}

	async function deleteCurrentTemplate(): Promise<void> {
		const editingTemplateIndex = getEditingTemplateIndex();
		if (editingTemplateIndex !== -1) {
			const currentTemplate = templates[editingTemplateIndex];
			if (confirm(getMessage('confirmDeleteTemplate', [currentTemplate.name]))) {
				const success = await deleteTemplate(currentTemplate.id);
				if (success) {
					// Reload templates after deletion
					await loadTemplates();
					updateTemplateList();
					if (templates.length > 0) {
						showTemplateEditor(templates[0]);
					} else {
						showSettingsSection('general');
					}
				} else {
					alert(getMessage('failedToDeleteTemplate'));
				}
			}
		}
	}

	async function handleUrlParameters(): Promise<void> {
		const { section, templateId } = getUrlParameters();

		if (section === 'general' || section === 'interpreter' || section === 'properties' || section === 'highlighter' || section === 'reader') {
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

	function copyCurrentTemplateToClipboard(): void {
		const editingTemplateIndex = getEditingTemplateIndex();
		if (editingTemplateIndex !== -1) {
			const currentTemplate = templates[editingTemplateIndex];
			copyTemplateToClipboard(currentTemplate);
		}
	}

	const templateForm = document.getElementById('template-settings-form');
	if (templateForm) {
		initializeAddPropertyButton();
		initializeDragAndDrop();
		handleTemplateDrag();
	}

	await addBrowserClassToHtml();
	await initializeSettings();
});
