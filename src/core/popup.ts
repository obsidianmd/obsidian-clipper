import dayjs from 'dayjs';
import { Template, Property, PromptVariable } from '../types/types';
import { generateFrontmatter, saveToObsidian } from '../utils/obsidian-note-creator';
import { extractPageContent, initializePageContent, replaceVariables } from '../utils/content-extractor';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { decompressFromUTF16 } from 'lz-string';
import { findMatchingTemplate, matchPattern } from '../utils/triggers';
import { getLocalStorage, setLocalStorage, loadSettings, generalSettings, Settings } from '../utils/storage-utils';
import { escapeHtml, formatVariables, unescapeValue } from '../utils/string-utils';
import { loadTemplates, createDefaultTemplate } from '../managers/template-manager';
import browser from '../utils/browser-polyfill';
import { detectBrowser, addBrowserClassToHtml } from '../utils/browser-detection';
import { createElementWithClass } from '../utils/dom-utils';
import { initializeInterpreter, handleInterpreterUI, collectPromptVariables } from '../utils/interpreter';
import { adjustNoteNameHeight } from '../utils/ui-utils';
import { debugLog } from '../utils/debug';
import { showVariables, initializeVariablesPanel, updateVariablesPanel } from '../managers/inspect-variables';
import { ensureContentScriptLoaded } from '../utils/content-script-utils';
import { isBlankPage, isValidUrl } from '../utils/active-tab-manager';

let loadedSettings: Settings;
let currentTemplate: Template | null = null;
let templates: Template[] = [];
let currentVariables: { [key: string]: string } = {};
let currentTabId: number | undefined;

const isSidePanel = window.location.pathname.includes('side-panel.html');

async function initializeExtension(tabId: number) {
	try {
		await addBrowserClassToHtml();
		loadedSettings = await loadSettings();
		debugLog('Settings', 'General settings:', loadedSettings);

		templates = await loadTemplates();
		debugLog('Templates', 'Loaded templates:', templates);

		if (templates.length === 0) {
			console.error('No templates loaded');
			return false;
		}

		currentTemplate = templates[0]; // Set the first template as default
		debugLog('Templates', 'Current template set to:', currentTemplate);

		const tab = await browser.tabs.get(tabId);
		if (!tab.url || isBlankPage(tab.url)) {
			return false;
		}
		if (!isValidUrl(tab.url)) {
			return false;
		}
		await ensureContentScriptLoaded(tabId);
		await refreshFields(tabId);

		await loadAndSetupTemplates();

		// Setup message listeners
		setupMessageListeners();

		return true;
	} catch (error) {
		console.error('Error initializing extension:', error);
		return false;
	}
}

async function loadAndSetupTemplates() {
	const data = await browser.storage.sync.get(['template_list']);
	const templateIds = data.template_list || [];
	const loadedTemplates = await Promise.all(templateIds.map(async (id: string) => {
		try {
			const result = await browser.storage.sync.get(`template_${id}`);
			const compressedChunks = result[`template_${id}`];
			if (compressedChunks) {
				const decompressedData = decompressFromUTF16(compressedChunks.join(''));
				const template = JSON.parse(decompressedData);
				if (template && Array.isArray(template.properties)) {
					return template;
				}
			}
		} catch (error) {
			console.error(`Error parsing template ${id}:`, error);
		}
		return null;
	}));

	templates = loadedTemplates.filter((t): t is Template => t !== null);

	if (templates.length === 0) {
		currentTemplate = createDefaultTemplate();
		templates = [currentTemplate];
	} else {
		currentTemplate = templates[0];
	}
}

function setupMessageListeners() {
	browser.runtime.onMessage.addListener((request: any, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void) => {
		console.log('Received message:', request);
		if (request.action === "triggerQuickClip") {
			handleClip().then(() => {
				sendResponse({success: true});
			}).catch((error) => {
				console.error('Error in handleClip:', error);
				sendResponse({success: false, error: error.message});
			});
			return true;
		} else if (request.action === "tabUrlChanged") {
			if (request.tabId === currentTabId) {
				if (currentTabId !== undefined) {
					refreshFields(currentTabId);
				}
			}
		} else if (request.action === "activeTabChanged") {
			currentTabId = request.tabId;
			if (request.isValidUrl) {
				if (currentTabId !== undefined) {
					refreshFields(currentTabId); // Force template check when URL changes
				}
			} else if (request.isBlankPage) {
				showError('This page cannot be clipped.');
			} else {
				showError('This page cannot be clipped. Only http and https URLs are supported.');
			}
		}
	});
}

document.addEventListener('DOMContentLoaded', async function() {
	initializeIcons();
	const refreshButton = document.getElementById('refresh-pane');
	if (refreshButton) {
		refreshButton.addEventListener('click', (e) => {
			e.preventDefault();
			refreshPopup();
		});
	}

	const tabs = await browser.tabs.query({active: true, currentWindow: true});
	const currentTab = tabs[0];
	currentTabId = currentTab?.id;

	if (currentTabId) {
		try {		
			const initialized = await initializeExtension(currentTabId);
			if (!initialized) {
				showError('This page cannot be clipped.');
				return;
			}

			// DOM-dependent initializations
			updateVaultDropdown(loadedSettings.vaults);
			populateTemplateDropdown();
			setupEventListeners(currentTabId);
			await initializeUI();
			setupMetadataToggle();

			// Initial content load
			await refreshFields(currentTabId);

			const showMoreActionsButton = document.getElementById('show-variables');
			if (showMoreActionsButton) {
					showMoreActionsButton.addEventListener('click', (e) => {
						e.preventDefault();
						showVariables();
					});
			}
		} catch (error) {
			console.error('Error initializing popup:', error);
			showError('Please try reloading the page.');
		}
	} else {
		showError('Please try reloading the page.');
	}
});

function setupEventListeners(tabId: number) {
	const templateDropdown = document.getElementById('template-select') as HTMLSelectElement;
	if (templateDropdown) {
		templateDropdown.addEventListener('change', async function(this: HTMLSelectElement) {
			console.log('Template changed to:', this.value, tabId);
			currentTemplate = templates.find((t: Template) => t.name === this.value) || null;
			if (currentTemplate) {
				// Pass false to refreshFields to prevent checking for a matching template
				await refreshFields(tabId, false);
			} else {
				logError('Selected template not found');
			}
		});
	}

	const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement;
	if (noteNameField) {
		noteNameField.addEventListener('input', () => adjustNoteNameHeight(noteNameField));
		noteNameField.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
			}
		});
	}
}

async function initializeUI() {
	const clipButton = document.getElementById('clip-btn');
	if (clipButton) {
		clipButton.addEventListener('click', handleClip);
		clipButton.focus();
	} else {
		console.warn('Clip button not found');
	}

	const settingsButton = document.getElementById('open-settings');
	if (settingsButton) {
		settingsButton.addEventListener('click', async function() {
			browser.runtime.openOptionsPage();
			
			const browserType = await detectBrowser();
			if (browserType === 'firefox-mobile') {
				setTimeout(() => window.close(), 50);
			}
		});
	}

	const showMoreActionsButton = document.getElementById('show-variables') as HTMLElement;
	const variablesPanel = document.createElement('div');
	variablesPanel.className = 'variables-panel';
	document.body.appendChild(variablesPanel);

	if (showMoreActionsButton) {
		showMoreActionsButton.addEventListener('click', async (e) => {
			e.preventDefault();
			// Initialize the variables panel with the latest data
			initializeVariablesPanel(variablesPanel, currentTemplate, currentVariables);
			await showVariables();
		});
	}

	if (isSidePanel) {
		browser.runtime.sendMessage({ action: "sidePanelOpened" });
		
		window.addEventListener('unload', () => {
			browser.runtime.sendMessage({ action: "sidePanelClosed" });
		});
	}
}

function showError(message: string): void {
	const errorMessage = document.querySelector('.error-message') as HTMLElement;
	const clipper = document.querySelector('.clipper') as HTMLElement;

	if (errorMessage && clipper) {
		errorMessage.textContent = message;
		errorMessage.style.display = 'flex';
		clipper.style.display = 'none';

		// Ensure the settings icon is still visible when showing an error
		const settingsIcon = document.getElementById('open-settings') as HTMLElement;
		if (settingsIcon) {
			settingsIcon.style.display = 'flex';
		}
	}
}

function logError(message: string, error?: any): void {
	console.error(message, error);
	showError(message);
}

async function handleClip() {
	if (!currentTemplate) return;

	const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement;
	const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
	const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
	const pathField = document.getElementById('path-name-field') as HTMLInputElement;
	const interpretBtn = document.getElementById('interpret-btn') as HTMLButtonElement;

	if (!vaultDropdown || !noteContentField) {
		showError('Some required fields are missing. Please try reloading the extension.');
		return;
	}

	// Check if interpreter is enabled, the button exists, and there are prompt variables
	const promptVariables = collectPromptVariables(currentTemplate);
	if (generalSettings.interpreterEnabled && interpretBtn && promptVariables.length > 0) {
		if (interpretBtn.classList.contains('processing')) {
			try {
				await waitForInterpreter(interpretBtn);
			} catch (error) {
				console.error('Interpreter processing failed:', error);
				showError('Interpreter processing failed. Please try again.');
				return;
			}
		} else if (interpretBtn.textContent?.toLowerCase() !== 'done') {
			interpretBtn.click(); // Trigger processing
			try {
				await waitForInterpreter(interpretBtn);
			} catch (error) {
				console.error('Interpreter processing failed:', error);
				showError('Interpreter processing failed. Please try again.');
				return;
			}
		}
	}

	const selectedVault = currentTemplate.vault || vaultDropdown.value;
	const noteContent = noteContentField.value;
	const isDailyNote = currentTemplate.behavior === 'append-daily' || currentTemplate.behavior === 'prepend-daily';

	let noteName = '';
	let path = '';

	if (!isDailyNote) {
		if (!noteNameField || !pathField) {
			showError('Note name or path field is missing. Please try reloading the extension.');
			return;
		}
		noteName = noteNameField.value;
		path = pathField.value;
	}

	const properties = Array.from(document.querySelectorAll('.metadata-property input')).map(input => ({
		name: input.id,
		value: (input as HTMLInputElement).value,
		type: input.getAttribute('data-type') || 'text'
	}));

	let fileContent: string;
	const frontmatter = await generateFrontmatter(properties as Property[]);
	fileContent = frontmatter + noteContent;

	try {
		if (currentTemplate.behavior === 'create') {
			const updatedProperties = Array.from(document.querySelectorAll('.metadata-property input')).map(input => ({
				name: input.id,
				value: (input as HTMLInputElement).value,
				type: input.getAttribute('data-type') || 'text'
			}));
			const frontmatter = await generateFrontmatter(updatedProperties as Property[]);
			fileContent = frontmatter + noteContentField.value;
		} else {
			fileContent = noteContentField.value;
		}

		await saveToObsidian(fileContent, noteName, path, selectedVault, currentTemplate.behavior);
		
		// Only close the window if it's not running in side panel mode
		if (!isSidePanel) {
			setTimeout(() => window.close(), 1500);
		}
	} catch (error) {
		console.error('Error in handleClip:', error);
		showError('Failed to save to Obsidian. Please try again.');
		throw error;
	}
}

function waitForInterpreter(interpretBtn: HTMLButtonElement): Promise<void> {
	return new Promise((resolve, reject) => {
		const checkProcessing = () => {
			if (!interpretBtn.classList.contains('processing')) {
				if (interpretBtn.textContent?.toLowerCase() === 'done') {
					resolve();
				} else if (interpretBtn.textContent?.toLowerCase() === 'error') {
					reject(new Error('Interpreter processing failed'));
				} else {
					setTimeout(checkProcessing, 100); // Check every 100ms
				}
			} else {
				setTimeout(checkProcessing, 100); // Check every 100ms
			}
		};
		checkProcessing();
	});
}

async function refreshFields(tabId: number, checkTemplateTriggers: boolean = true) {
	if (templates.length === 0) {
		console.warn('No templates available');
		showError('No templates available. Please add a template in the settings.');
		return;
	}

	try {
		const tab = await browser.tabs.get(tabId);
		if (!tab.url || isBlankPage(tab.url)) {
			showError('This page cannot be clipped. Please navigate to a web page.');
			return;
		}
		if (!isValidUrl(tab.url)) {
			showError('This page cannot be clipped. Only http and https URLs are supported.');
			return;
		}

		const extractedData = await extractPageContent(tabId);
		if (extractedData) {
			const currentUrl = tab.url;

			// Only check for the correct template if checkTemplateTriggers is true
			if (checkTemplateTriggers) {
				const matchedTemplate = findMatchingTemplate(currentUrl, templates, extractedData.schemaOrgData);
				if (matchedTemplate) {
					currentTemplate = matchedTemplate;
				} else {
					// If no matching template is found, use the first template
					currentTemplate = templates[0];
				}
				updateTemplateDropdown();
			}

			const initializedContent = await initializePageContent(
				extractedData.content,
				extractedData.selectedHtml,
				extractedData.extractedContent,
				currentUrl,
				extractedData.schemaOrgData,
				extractedData.fullHtml
			);
			if (initializedContent) {
				currentVariables = initializedContent.currentVariables;
				console.log('Updated currentVariables:', currentVariables);
				await initializeTemplateFields(
					tabId,
					currentTemplate,
					initializedContent.currentVariables,
					initializedContent.noteName,
					extractedData.schemaOrgData
				);
				setupMetadataToggle();

				// Update variables panel if it's open
				updateVariablesPanel(currentTemplate, currentVariables);
			} else {
				throw new Error('Unable to initialize page content.');
			}
		} else {
			throw new Error('Unable to extract page content.');
		}
	} catch (error) {
		console.error('Error refreshing fields:', error);
		const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
		showError(errorMessage);
	}
}

function updateTemplateDropdown() {
	const templateDropdown = document.getElementById('template-select') as HTMLSelectElement;
	if (templateDropdown && currentTemplate) {
		templateDropdown.value = currentTemplate.name;
	}
}

function populateTemplateDropdown() {
	const templateDropdown = document.getElementById('template-select') as HTMLSelectElement;
	if (templateDropdown && currentTemplate) {
		templateDropdown.innerHTML = '';
		templates.forEach((template: Template) => {
			const option = document.createElement('option');
			option.value = template.name;
			option.textContent = template.name;
			templateDropdown.appendChild(option);
		});
		templateDropdown.value = currentTemplate.name;
	}
}

async function initializeTemplateFields(currentTabId: number, template: Template | null, variables: { [key: string]: string }, noteName?: string, schemaOrgData?: any) {
	if (!template) {
		logError('No template selected');
		return;
	}

	currentVariables = variables;
	const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
	templateProperties.innerHTML = '';

	if (!Array.isArray(template.properties)) {
		logError('Template properties are not an array');
		return;
	}

	for (const property of template.properties) {
		const propertyDiv = createElementWithClass('div', 'metadata-property');
		let value = await replaceVariables(currentTabId!, unescapeValue(property.value), variables, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '');

		// Apply type-specific parsing
		switch (property.type) {
			case 'number':
				const numericValue = value.replace(/[^\d.-]/g, '');
				value = numericValue ? parseFloat(numericValue).toString() : value;
				break;
			case 'checkbox':
				value = (value.toLowerCase() === 'true' || value === '1').toString();
				break;
			case 'date':
				// Don't override user-specified date format
				if (!property.value.includes('|date:')) {
					value = dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : value;
				}
				break;
			case 'datetime':
				// Don't override user-specified datetime format
				if (!property.value.includes('|date:')) {
					value = dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DDTHH:mm:ssZ') : value;
				}
				break;
		}

		propertyDiv.innerHTML = `
			<span class="metadata-property-icon"><i data-lucide="${getPropertyTypeIcon(property.type)}"></i></span>
			<label for="${property.name}">${property.name}</label>
			<input id="${property.name}" type="text" value="${escapeHtml(value)}" data-type="${property.type}" data-template-value="${escapeHtml(property.value)}" />
		`;
		templateProperties.appendChild(propertyDiv);
	}
	
	const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement;
	if (noteNameField) {
		let formattedNoteName = await replaceVariables(currentTabId!, template.noteNameFormat, variables, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '');
		noteNameField.setAttribute('data-template-value', template.noteNameFormat);
		noteNameField.value = formattedNoteName;
		adjustNoteNameHeight(noteNameField);
	}

	const pathField = document.getElementById('path-name-field') as HTMLInputElement;
	const pathContainer = document.querySelector('.vault-path-container') as HTMLElement;
	
	if (pathField && pathContainer) {
		const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';
		
		if (isDailyNote) {
			pathField.style.display = 'none';
		} else {
			pathContainer.style.display = 'flex';
			let formattedPath = await replaceVariables(currentTabId!, template.path, variables, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '');
			pathField.value = formattedPath;
			pathField.setAttribute('data-template-value', template.path);
		}
	}

	const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
	if (noteContentField) {
		if (template.noteContentFormat) {
			let content = await replaceVariables(currentTabId!, template.noteContentFormat, variables, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '');
			noteContentField.value = content;
			noteContentField.setAttribute('data-template-value', template.noteContentFormat);
		} else {
			noteContentField.value = '';
			noteContentField.setAttribute('data-template-value', '');
		}
	}

	initializeIcons();

	const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement;
	if (vaultDropdown) {
		if (template.vault) {
			vaultDropdown.value = template.vault;
		} else {
			// Try to get the previously selected vault
			getLocalStorage('lastSelectedVault').then((lastSelectedVault) => {
				if (lastSelectedVault && loadedSettings.vaults.includes(lastSelectedVault)) {
					vaultDropdown.value = lastSelectedVault;
				} else if (loadedSettings.vaults.length > 0) {
					vaultDropdown.value = loadedSettings.vaults[0];
				}
			});
		}

		vaultDropdown.addEventListener('change', () => {
			setLocalStorage('lastSelectedVault', vaultDropdown.value);
		});
	}

	if (template) {
		if (generalSettings.interpreterEnabled) {
			await initializeInterpreter(template, variables, currentTabId!, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '');

			// Check if there are any prompt variables
			const promptVariables = collectPromptVariables(template);

			// If auto-run is enabled and there are prompt variables, use interpreter
			if (generalSettings.interpreterAutoRun && promptVariables.length > 0) {
				try {
					const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
					const selectedModelId = modelSelect?.value || generalSettings.interpreterModel || 'gpt-4o-mini';
					const modelConfig = generalSettings.models.find(m => m.id === selectedModelId);
					if (!modelConfig) {
						throw new Error(`Model configuration not found for ${selectedModelId}`);
					}
					await handleInterpreterUI(template, variables, currentTabId!, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '', modelConfig);
				} catch (error) {
					console.error('Error auto-processing with interpreter:', error);
				}
			}
		}

		const replacedTemplate = await getReplacedTemplate(template, variables, currentTabId!, currentTabId ? await browser.tabs.get(currentTabId).then(tab => tab.url || '') : '');
		debugLog('Variables', 'Current template with replaced variables:', JSON.stringify(replacedTemplate, null, 2));
	}
}

function setupMetadataToggle() {
	const metadataHeader = document.querySelector('.metadata-properties-header') as HTMLElement;
	const metadataProperties = document.querySelector('.metadata-properties') as HTMLElement;
	
	if (metadataHeader && metadataProperties) {
		metadataHeader.removeEventListener('click', toggleMetadataProperties);
		metadataHeader.addEventListener('click', toggleMetadataProperties);

		// Set initial state
		getLocalStorage('propertiesCollapsed').then((isCollapsed) => {
			updateMetadataToggleState(isCollapsed);
		});
	}
}

function toggleMetadataProperties() {
	const metadataProperties = document.querySelector('.metadata-properties') as HTMLElement;
	const metadataHeader = document.querySelector('.metadata-properties-header') as HTMLElement;
	
	if (metadataProperties && metadataHeader) {
		const isCollapsed = metadataProperties.classList.toggle('collapsed');
		metadataHeader.classList.toggle('collapsed');
		setLocalStorage('propertiesCollapsed', isCollapsed);
	}
}

function updateMetadataToggleState(isCollapsed: boolean) {
	const metadataProperties = document.querySelector('.metadata-properties') as HTMLElement;
	const metadataHeader = document.querySelector('.metadata-properties-header') as HTMLElement;
	
	if (metadataProperties && metadataHeader) {
		if (isCollapsed) {
			metadataProperties.classList.add('collapsed');
			metadataHeader.classList.add('collapsed');
		} else {
			metadataProperties.classList.remove('collapsed');
			metadataHeader.classList.remove('collapsed');
		}
	}
}

async function getReplacedTemplate(template: Template, variables: { [key: string]: string }, tabId: number, currentUrl: string): Promise<any> {
	const replacedTemplate: any = {
		schemaVersion: "0.1.0",
		name: template.name,
		behavior: template.behavior,
		noteNameFormat: await replaceVariables(tabId, template.noteNameFormat, variables, currentUrl),
		path: template.path,
		noteContentFormat: await replaceVariables(tabId, template.noteContentFormat, variables, currentUrl),
		properties: [],
		triggers: template.triggers
	};

	if (template.context) {
		replacedTemplate.context = await replaceVariables(tabId, template.context, variables, currentUrl);
	}

	for (const prop of template.properties) {
		const replacedProp: Property = {
			id: prop.id, // Include the id property
			name: prop.name,
			value: await replaceVariables(tabId, prop.value, variables, currentUrl),
			type: prop.type
		};
		replacedTemplate.properties.push(replacedProp);
	}

	return replacedTemplate;
}

function updateVaultDropdown(vaults: string[]) {
	const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement | null;
	const vaultContainer = document.getElementById('vault-container');

	if (!vaultDropdown || !vaultContainer) return;

	vaultDropdown.innerHTML = '';
	
	vaults.forEach(vault => {
		const option = document.createElement('option');
		option.value = vault;
		option.textContent = vault;
		vaultDropdown.appendChild(option);
	});

	// Only show vault selector if one is defined
	if (vaults.length > 0) {
		vaultContainer.style.display = 'block';
		vaultDropdown.value = vaults[0];
	} else {
		vaultContainer.style.display = 'none';
	}
}

function refreshPopup() {
	window.location.reload();
}
