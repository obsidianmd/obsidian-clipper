import dayjs from 'dayjs';
import { Template, Property } from '../types/types';
import { generateFrontmatter, saveToObsidian } from '../utils/obsidian-note-creator';
import { sanitizeFileName } from '../utils/string-utils';
import { extractPageContent, initializePageContent, replaceVariables } from '../utils/content-extractor';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { decompressFromUTF16 } from 'lz-string';
import { findMatchingTemplate, matchPattern } from '../utils/triggers';
import { getLocalStorage, setLocalStorage, loadGeneralSettings, generalSettings, GeneralSettings } from '../utils/storage-utils';
import { formatVariables, unescapeValue } from '../utils/string-utils';
import { loadTemplates, createDefaultTemplate } from '../managers/template-manager';
import browser from '../utils/browser-polyfill';
import { detectBrowser, addBrowserClassToHtml } from '../utils/browser-detection';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';

let currentTemplate: Template | null = null;
let templates: Template[] = [];
let currentVariables: { [key: string]: string } = {};

let loadedSettings: GeneralSettings;

async function ensureContentScriptLoaded() {
	const tabs = await browser.tabs.query({active: true, currentWindow: true});
	if (tabs[0]?.id) {
		try {
			await browser.runtime.sendMessage({ action: "ensureContentScriptLoaded", tabId: tabs[0].id });
		} catch (error) {
			console.error('Error ensuring content script is loaded:', error);
			throw error;
		}
	}
}

browser.runtime.onMessage.addListener((request: any, sender: browser.Runtime.MessageSender, sendResponse: (response?: any) => void) => {
	if (request.action === "triggerQuickClip") {
		handleClip().then(() => {
			sendResponse({success: true});
		}).catch((error) => {
			console.error('Error in handleClip:', error);
			sendResponse({success: false, error: error.message});
		});
		return true;
	}
});

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

	if (!vaultDropdown || !noteContentField) {
		showError('Some required fields are missing. Please try reloading the extension.');
		return;
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
		await saveToObsidian(fileContent, noteName, path, selectedVault, currentTemplate.behavior);
		setTimeout(() => window.close(), 50);
	} catch (error) {
		console.error('Error in handleClip:', error);
		showError('Failed to save to Obsidian. Please try again.');
		throw error; // Re-throw the error so it can be caught by the caller
	}
}

document.addEventListener('DOMContentLoaded', async function() {
	try {
		await ensureContentScriptLoaded();
		
		initializeIcons();

		await addBrowserClassToHtml();

		loadedSettings = await loadGeneralSettings();
		console.log('General settings:', loadedSettings);

		await loadTemplates();

		const vaultContainer = document.getElementById('vault-container') as HTMLElement;
		const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement;
		const templateContainer = document.getElementById('template-container') as HTMLElement;
		const templateDropdown = document.getElementById('template-select') as HTMLSelectElement;

		updateVaultDropdown(loadedSettings.vaults);

		function updateVaultDropdown(vaults: string[]) {
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

		// Load templates from sync storage and populate dropdown
		browser.storage.sync.get(['template_list']).then(async (data: { template_list?: string[] }) => {
			const templateIds = data.template_list || [];
			const loadedTemplates = await Promise.all(templateIds.map(async id => {
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

			populateTemplateDropdown();

			// After templates are loaded, match template based on URL
			const tabs = await browser.tabs.query({active: true, currentWindow: true});
			const currentTab = tabs[0];
			if (!currentTab.url || currentTab.url.startsWith('chrome-extension://') || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('about:') || currentTab.url.startsWith('file://')) {
				showError('This page cannot be clipped.');
				return;
			}

			const currentUrl = currentTab.url;

			if (currentTab.id) {
				try {
					let extractedData = null;
					let retryCount = 0;
					const maxRetries = 10;
					const retryDelay = 250; //ms

					while (!extractedData && retryCount < maxRetries) {
						extractedData = await extractPageContent(currentTab.id);
						if (!extractedData) {
							retryCount++;
							await new Promise(resolve => setTimeout(resolve, retryDelay));
						}
					}

					if (extractedData) {
						const initializedContent = await initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent, currentUrl, extractedData.schemaOrgData, extractedData.fullHtml);
						if (initializedContent) {
							currentTemplate = findMatchingTemplate(currentUrl, templates, extractedData.schemaOrgData) || templates[0];

							if (currentTemplate) {
								templateDropdown.value = currentTemplate.name;
							}

							await initializeTemplateFields(currentTemplate, initializedContent.currentVariables, initializedContent.noteName, extractedData.schemaOrgData);

							document.querySelector('.clipper')?.classList.remove('hidden');
						} else {
							showError('Unable to initialize page content.');
						}
					} else {
						showError('Unable to get page content.');
					}
				} catch (error: unknown) {
					console.error('Error in popup initialization:', error);
					if (error instanceof Error) {
						showError(`An error occurred: ${error.message}`);
					} else {
						showError('An unexpected error occurred');
					}
				}
			}

			// Only show template selector if there are multiple templates
			if (templates.length > 1) {
				templateContainer.style.display = 'block';
			} else {
				templateContainer.classList.add('hidden');
			}
		});

		function populateTemplateDropdown() {
			templateDropdown.innerHTML = '';
			
			templates.forEach((template: Template) => {
				const option = document.createElement('option');
				option.value = template.name;
				option.textContent = template.name;
				templateDropdown.appendChild(option);
			});
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

		// Template selection change
		templateDropdown.addEventListener('change', async function(this: HTMLSelectElement) {
			currentTemplate = templates.find((t: Template) => t.name === this.value) || null;
			if (currentTemplate) {
				const tabs = await browser.tabs.query({active: true, currentWindow: true});
				const currentTab = tabs[0];
				if (currentTab?.id) {
					try {
						const extractedData = await extractPageContent(currentTab.id);
						if (extractedData) {
							const initializedContent = await initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent, currentTab.url!, extractedData.schemaOrgData, extractedData.fullHtml);
							if (initializedContent) {
								await initializeTemplateFields(currentTemplate, initializedContent.currentVariables, initializedContent.noteName, extractedData.schemaOrgData);
								setupMetadataToggle();
							} else {
								logError('Unable to initialize page content.');
							}
						} else {
							logError('Unable to retrieve page content. Try reloading the page.');
						}
					} catch (error) {
						logError('Error initializing template fields:', error);
					}
				} else {
					logError('No active tab found');
				}
			} else {
				logError('Selected template not found');
			}
		});

		const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement;
		
		function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
			textarea.style.minHeight = '2rem';
			textarea.style.minHeight = textarea.scrollHeight + 'px';
		}

		function handleNoteNameInput() {
			noteNameField.value = sanitizeFileName(noteNameField.value);
			adjustTextareaHeight(noteNameField);
		}

		noteNameField.addEventListener('input', handleNoteNameInput);
		noteNameField.addEventListener('keydown', function(e) {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
			}
		});

		// Initial height adjustment
		adjustTextareaHeight(noteNameField);

		async function initializeTemplateFields(template: Template | null, variables: { [key: string]: string }, noteName?: string, schemaOrgData?: any) {
			if (!template) {
				logError('No template selected');
				return;
			}

			currentVariables = variables;
			const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
			templateProperties.innerHTML = '';

			const tabs = await browser.tabs.query({active: true, currentWindow: true});
			const currentTab = tabs[0];
			const tabId = currentTab?.id;
			const currentUrl = currentTab?.url || '';

			if (!tabId) {
				logError('No active tab found');
				return;
			}

			if (!Array.isArray(template.properties)) {
				logError('Template properties are not an array');
				return;
			}

			for (const property of template.properties) {
				const propertyDiv = createElementWithClass('div', 'metadata-property');
				let value = await replaceVariables(tabId, unescapeValue(property.value), variables, currentUrl);

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
						value = dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : value;
						break;
					case 'datetime':
						value = dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : value;
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
				let formattedNoteName = await replaceVariables(tabId, template.noteNameFormat, variables, currentUrl);
				noteNameField.value = sanitizeFileName(formattedNoteName);
				noteNameField.setAttribute('data-template-value', template.noteNameFormat);
				adjustTextareaHeight(noteNameField);
			}

			const pathField = document.getElementById('path-name-field') as HTMLInputElement;
			const pathContainer = document.querySelector('.vault-path-container') as HTMLElement;
			
			if (pathField && pathContainer) {
				const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';
				
				if (isDailyNote) {
					pathField.style.display = 'none';
				} else {
					pathContainer.style.display = 'flex';
					let formattedPath = await replaceVariables(tabId, template.path, variables, currentUrl);
					pathField.value = formattedPath;
					pathField.setAttribute('data-template-value', template.path);
				}
			}

			const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
			if (noteContentField) {
				if (template.noteContentFormat) {
					let content = await replaceVariables(tabId, template.noteContentFormat, variables, currentUrl);
					noteContentField.value = content;
					noteContentField.setAttribute('data-template-value', template.noteContentFormat);
				} else {
					noteContentField.value = '';
					noteContentField.setAttribute('data-template-value', '');
				}
			}

			if (Object.keys(variables).length > 0) {
				if (template.triggers && template.triggers.length > 0) {
					const matchingPattern = template.triggers.find(pattern => 
						matchPattern(pattern, currentUrl, schemaOrgData)
					);
					if (matchingPattern) {
						console.log(`Matched template trigger: ${matchingPattern}`);
					}
				} else {
					console.log('No template triggers defined for this template');
				}
			}

			initializeIcons();
			setupMetadataToggle();

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
		}

		async function initializeUI() {
			const clipButton = document.getElementById('clip-button');
			if (clipButton) {
				clipButton.addEventListener('click', handleClip);
				clipButton.focus();
			}

			// On Firefox Mobile close the popup when the settings button is clicked
			// because otherwise the settings page is opened in the background
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
			if (showMoreActionsButton) {
				showMoreActionsButton.style.display = loadedSettings.showMoreActionsButton ? 'flex' : 'none';
				
				showMoreActionsButton.addEventListener('click', function() {
					if (currentTemplate && Object.keys(currentVariables).length > 0) {
						const formattedVariables = formatVariables(currentVariables);
						variablesPanel.innerHTML = `
							<div class="variables-header">
								<h3>Page variables</h3>
								<span class="close-panel clickable-icon" aria-label="Close">
									<i data-lucide="x"></i>
								</span>
							</div>
							<div class="variable-list">${formattedVariables}</div>
						`;
						variablesPanel.classList.add('show');
						initializeIcons();

						// Add click event listeners to variable keys and chevrons
						const variableItems = variablesPanel.querySelectorAll('.variable-item');
						variableItems.forEach(item => {
							const key = item.querySelector('.variable-key') as HTMLElement;
							const chevron = item.querySelector('.chevron-icon') as HTMLElement;
							const valueElement = item.querySelector('.variable-value') as HTMLElement;

							if (valueElement.scrollWidth > valueElement.clientWidth) {
								item.classList.add('has-overflow');
							}

							key.addEventListener('click', function() {
								const variableName = this.getAttribute('data-variable');
								if (variableName) {
									navigator.clipboard.writeText(variableName).then(() => {
										const originalText = this.textContent;
										this.textContent = 'Copied!';
										setTimeout(() => {
											this.textContent = originalText;
										}, 1000);
									}).catch(err => {
										console.error('Failed to copy text: ', err);
									});
								}
							});

							chevron.addEventListener('click', function() {
								item.classList.toggle('is-collapsed');
								const chevronIcon = this.querySelector('i');
								if (chevronIcon) {
									chevronIcon.setAttribute('data-lucide', item.classList.contains('is-collapsed') ? 'chevron-right' : 'chevron-down');
									initializeIcons();
								}
							});
						});

						const closePanel = variablesPanel.querySelector('.close-panel') as HTMLElement;
						closePanel.addEventListener('click', function() {
							variablesPanel.classList.remove('show');
						});
					} else {
						console.log('No variables available to display');
					}
				});
			}
		}

		// Call this function after loading templates and settings
		initializeUI();

		const variablesPanel = document.createElement('div');
		variablesPanel.className = 'variables-panel';
		document.body.appendChild(variablesPanel);

		function escapeHtml(unsafe: string): string {
			return unsafe
				.replace(/&/g, "&amp;")
				.replace(/</g, "&lt;")
				.replace(/>/g, "&gt;")
				.replace(/"/g, "&quot;")
				.replace(/'/g, "&#039;");
		}
	} catch (error) {
		console.error('Error initializing popup:', error);
		showError('Failed to initialize the extension. Please try reloading the page.');
	}
});