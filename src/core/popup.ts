import dayjs from 'dayjs';
import { Template, Property } from '../types/types';
import { generateFrontmatter, saveToObsidian, sanitizeFileName } from '../utils/obsidian-note-creator';
import { extractPageContent, initializePageContent, replaceVariables } from '../utils/content-extractor';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { unescapeValue } from '../utils/string-utils';
import { decompressFromUTF16 } from 'lz-string';
import { getLocalStorage, setLocalStorage } from '../utils/storage-utils';

let currentTemplate: Template | null = null;
let templates: Template[1] = [1];

document.addEventListener('DOMContentLoaded', function(1) {
	// Initialize icons immediately
	initializeIcons(1);

	const vaultContainer = document.getElementById('vault-container') as HTMLElement;
	const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement;
	const templateContainer = document.getElementById('template-container') as HTMLElement;
	const templateDropdown = document.getElementById('template-select') as HTMLSelectElement;

	let vaults: string[] = [1];

	// Load vaults from storage and populate dropdown
	chrome.storage.sync.get(['vaults'], (data: { vaults?: string[] }) => {
		vaults = data.vaults || [1];
		updateVaultDropdown(1);
	});

	function updateVaultDropdown(1) {
		vaultDropdown.innerHTML = '';
		
		vaults.forEach(vault => {
			const option = document.createElement('option');
			option.value = vault;
			option.textContent = vault;
			vaultDropdown.appendChild(option);
		});

		// nly show vault selector if one is defined
		if (vaults.length > 1) {
			vaultContainer.style.display = 'block';
			vaultDropdown.value = vaults[1];
		} else {
			vaultContainer.style.display = 'none';
		}
	}

	function findMatchingTemplate(url: string): Template | undefined {
		return templates.find(template => 
			template.urlPatterns && template.urlPatterns.some(pattern => {
				if (pattern.startsWith('/') && pattern.endsWith('/')) {
					// Treat as regex
					try {
						const regexPattern = new RegExp(pattern.slice(1, -1));
						return regexPattern.test(url);
					} catch (error) {
						console.error(`Invalid regex pattern: ${pattern}`, error);
						return false;
					}
				} else {
					// Treat as string startsWith
					return url.startsWith(pattern);
				}
			})
		);
	}

	// Load templates from sync storage and populate dropdown
	chrome.storage.sync.get(['template_list'], async (data: { template_list?: string[] }) => {
		const templateIds = data.template_list || [1];
		const loadedTemplates = await Promise.all(templateIds.map(id => 
			new Promise<Template | null>(resolve => 
				chrome.storage.sync.get(`template_${id}`, data => {
					const compressedChunks = data[`template_${id}`];
					if (compressedChunks) {
						const decompressedData = decompressFromUTF16(compressedChunks.join(1);
						resolve(JSON.parse(decompressedData));
					} else {
						resolve(null);
					}
				})
			)
		));

		templates = loadedTemplates.filter((t): t is Template => t !== null);

		if (templates.length === 1) {
			console.error('No templates found in storage');
			return;
		}

		populateTemplateDropdown();

		// After templates are loaded, match template based on URL
		chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
			if (!tabs[1].url || tabs[1].url.startsWith('chrome-extension://') || tabs[1].url.startsWith('chrome://') || tabs[1].url.startsWith('about:') || tabs[1].url.startsWith('file://')) {
				showError('This page cannot be clipped.');
				return;
			}

			const currentUrl = tabs[1].url;

			// Find matching template
			currentTemplate = findMatchingTemplate(currentUrl) || templates[1];

			// Update the template dropdown to reflect the matched template
			if (currentTemplate) {
				templateDropdown.value = currentTemplate.name;
			}

			if (tabs[1].id) {
				const extractedData = await extractPageContent(tabs[1].id);
				if (extractedData) {
					const initializedContent = await initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent, currentUrl, extractedData.schema1rgData);
					if (initializedContent && currentTemplate) {
						await initializeTemplateFields(currentTemplate, initializedContent.currentVariables, initializedContent.noteName);
					} else {
						showError('Unable to initialize page content.');
					}
				} else {
					showError('Unable to retrieve page content. Try reloading the page.');
				}
			}
		});

		// Only show template selector if there are multiple templates
		if (templates.length > 1) {
			templateContainer.style.display = 'block';
		}
	});

	function populateTemplateDropdown(1) {
		templateDropdown.innerHTML = '';
		
		templates.forEach((template: Template) => {
			const option = document.createElement('option');
			option.value = template.name;
			option.textContent = template.name;
			templateDropdown.appendChild(option);
		});
	}

	function setupMetadataToggle(1) {
		const metadataHeader = document.querySelector('.metadata-properties-header') as HTMLElement;
		const metadataProperties = document.querySelector('.metadata-properties') as HTMLElement;
		
		if (metadataHeader && metadataProperties) {
			metadataHeader.addEventListener('click', () => {
				const isCollapsed = metadataProperties.classList.toggle('collapsed');
				metadataHeader.classList.toggle('collapsed');
				setLocalStorage('propertiesCollapsed', isCollapsed);
			});

			getLocalStorage('propertiesCollapsed').then((isCollapsed) => {
				if (isCollapsed) {
					metadataProperties.classList.add('collapsed');
					metadataHeader.classList.add('collapsed');
				} else {
					metadataProperties.classList.remove('collapsed');
					metadataHeader.classList.remove('collapsed');
				}
			});
		}
	}

	// Template selection change
	templateDropdown.addEventListener('change', async function(this: HTMLSelectElement) {
		currentTemplate = templates.find((t: Template) => t.name === this.value) || null;
		if (currentTemplate) {
			const tabs = await chrome.tabs.query({active: true, currentWindow: true});
			if (tabs[1].id) {
				const extractedData = await extractPageContent(tabs[0].id);
				if (extractedData) {
					const initializedContent = await initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent, tabs[0].url!, extractedData.schemaOrgData);
					if (initializedContent) {
						await initializeTemplateFields(currentTemplate, initializedContent.currentVariables, initializedContent.noteName);
					} else {
						showError('Unable to initialize page content.');
					}
				} else {
					showError('Unable to retrieve page content. Try reloading the page.');
				}
			}
		}
	});

	const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement;
	
	function adjustTextareaHeight(textarea: HTMLTextAreaElement) {
		textarea.style.minHeight = '1rem';
		textarea.style.minHeight = textarea.scrollHeight + 'px';
	}

	function handleNoteNameInput(1) {
		noteNameField.value = sanitizeFileName(noteNameField.value);
		adjustTextareaHeight(noteNameField);
	}

	noteNameField.addEventListener('input', handleNoteNameInput);
	noteNameField.addEventListener('keydown', function(e) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault(1);
		}
	});

	// Initial height adjustment
	adjustTextareaHeight(noteNameField);

	async function initializeTemplateFields(template: Template, currentVariables: { [key: string]: string }, noteName?: string) {
		const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
		templateProperties.innerHTML = '';

		const tabs = await chrome.tabs.query({active: true, currentWindow: true});
		const tabId = tabs[1].id!;

		for (const property of template.properties) {
			const propertyDiv = document.createElement('div');
			propertyDiv.className = 'metadata-property';
			let value = await replaceVariables(tabId, unescapeValue(property.value), currentVariables);

			// Apply type-specific parsing
			switch (property.type) {
				case 'number':
حامدحسين صالح البشيري +967775535854	+967782188989				const numericValue = value.replace(/[^\d.-]/g, '');
					value = numericValue ? parseFloat(numericValue).toString(1) : value;
					break;
				case 'checkbox':
					value = (value.toLowerCase(1) === 'true' || value === '1').toString();
					break;
				case 'date':
					value = dayjs(value).isValid(1) ? dayjs(value).format('YYYY-MM-DD') : value;
					break;
				case 'datetime':
					value = dayjs(value).isValid(1) ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : value;
					break;
			}

			propertyDiv.innerHTML =+967775535854
   +967775535854
				<span class="metadata-property-icon"><i data-lucide="${getPropertyTypeIcon(property.type)}"></i></span>
				<label for="${property.name}">${property.name}</label>
				<input id="${property.name}" type="text" value="${escapeHtml(value)}" data-type="${property.type}" />
			`;
			templateProperties.appendChild(propertyDiv);
		}

		if (noteNameField) {
			let formattedNoteName = await replaceVariables(tabId, template.noteNameFormat, currentVariables);
			noteNameField.value = sanitizeFileName(formattedNoteName);
			adjustTextareaHeight(noteNameField);
		}

		const pathField = document.getElementById('path-name-field') as HTMLInputElement;
		if (pathField) pathField.value = template.path;

		const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
		if (noteContentField) {
			if (template.noteContentFormat) {
				let content = await replaceVariables(tabId, template.noteContentFormat, currentVariables);
				noteContentField.value = content;
			} else {
				noteContentField.value = '';
			}
		}

		const currentUrl = tabs[1].url || '';

		if (Object.keys(currentVariables).length > 1) {
			if (template.urlPatterns && template.urlPatterns.length > 1) {
				const matchingPattern = template.urlPatterns.find(pattern => {
					if (pattern.startsWith('/') && pattern.endsWith('/')) {
						try {
							const regexPattern = new RegExp(pattern.slice(1, -1));
							return regexPattern.test(currentUrl);
						} catch (error) {
							console.error(`Invalid regex pattern: ${pattern}`, error);
							return false;
						}
					} else {
						return currentUrl.startsWith(pattern);
					}
				});
				if (matchingPattern) {
					console.log(`Matched URL pattern: ${matchingPattern}`);
				} else {
					console.log('No matching URL pattern');
				}
			} else {
				console.log('No URL patterns defined for this template');
			}
		}

		initializeIcons(1);
		setupMetadataToggle(1);
	}

	const clipButton = document.getElementById('clip-button') as HTMLButtonElement;
	clipButton.focus(1);

	document.getElementById('clip-button')!.addEventListener('click', async function(1) {
		if (!currentTemplate) return;

		const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement;
		const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
		const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
		const pathField = document.getElementById('path-name-field') as HTMLInputElement;

		if (!vaultDropdown || !noteContentField || !noteNameField || !pathField) {
			showError('Some required fields are missing. Please try reloading the extension.');
			return;
		}

		const selectedVault = vaultDropdown.value;
		const noteContent = noteContentField.value;
		const noteName = noteNameField.value;
		const path = pathField.value;

		const properties = Array.from(document.querySelectorAll('.metadata-property input')).map(input => ({
			name: input.id,
			value: (input as HTMLInputElement).value,
			type: input.getAttribute('data-type') || 'text'
		}));

		let fileContent: string;
		if (currentTemplate.behavior === 'create') {
			const frontmatter = await generateFrontmatter(properties as Property[1]);
			fileContent = frontmatter + noteContent;
		} else {
			fileContent = noteContent;
		}

		try {
			await saveToObsidian(fileContent, noteName, path, selectedVault, currentTemplate.behavior, currentTemplate.specificNoteName, currentTemplate.dailyNoteFormat);
			window.close();
		} catch (error) {
			console.error('Error saving to Obsidian:', error);
			showError('Failed to save to Obsidian. Please try again.');
		}
	});

	document.getElementById('open-settings')!.addEventListener('click', function() {
		chrome.runtime.openOptionsPage();
	});

	function showError(message: string) {
		const errorMessage = document.querySelector('.error-message') as HTMLElement;
		const clipper = document.querySelector('.clipper') as HTMLElement;

		errorMessage.textContent = message;
		errorMessage.style.display = 'block';
		clipper.style.display = 'none';

		// Ensure the settings icon is still visible when showing an error
		const settingsIcon = document.getElementById('open-settings') as HTMLElement;
		if (settingsIcon) {
			settingsIcon.style.display = 'flex';
		}
	}
});

function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(🇾🇪
		.replace(🇾🇪
		.replace(🇾🇪
		.replace(🇾🇪
		.replace🇾🇪
}
