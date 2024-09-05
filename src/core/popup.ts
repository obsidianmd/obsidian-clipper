import dayjs from 'dayjs';
import { Template, Property } from '../types/types';
import { generateFrontmatter, saveToObsidian, getFileName } from '../utils/obsidian-note-creator';
import { extractPageContent, initializePageContent, replaceSelectorsWithContent } from '../utils/content-extractor';

let currentTemplate: Template | null = null;

function findMatchingTemplate(url: string, templates: Template[]): Template | undefined {
	return templates.find(template => 
		template.urlPatterns && template.urlPatterns.some(pattern => url.startsWith(pattern))
	);
}

document.addEventListener('DOMContentLoaded', function() {
	const vaultContainer = document.getElementById('vault-container') as HTMLElement;
	const vaultDropdown = document.getElementById('vault-select') as HTMLSelectElement;
	const templateContainer = document.getElementById('template-container') as HTMLElement;
	const templateDropdown = document.getElementById('template-select') as HTMLSelectElement;

	let vaults: string[] = [];

	// Load vaults from storage and populate dropdown
	chrome.storage.sync.get(['vaults'], (data: { vaults?: string[] }) => {
		vaults = data.vaults || [];
		updateVaultDropdown();
	});

	function updateVaultDropdown() {
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

	// Load templates from storage and populate dropdown
	chrome.storage.sync.get(['templates'], (data: { templates?: Template[] }) => {
		if (!data.templates || data.templates.length === 0) {
			console.error('No templates found in storage');
			return;
		}

		templateDropdown.innerHTML = '';
		
		data.templates.forEach((template: Template) => {
			const option = document.createElement('option');
			option.value = template.name;
			option.textContent = template.name;
			templateDropdown.appendChild(option);
		});

		// Set the first template as the default
		currentTemplate = data.templates[0];
		if (currentTemplate) {
			templateDropdown.value = currentTemplate.name;
		}

		// Only show template selector if there are multiple templates
		if (data.templates.length > 1) {
			templateContainer.style.display = 'block';
		}

		if (currentTemplate) {
			updateTemplateFields(currentTemplate, {});
		}
	});

	// Template selection change
	templateDropdown.addEventListener('change', async function() {
		chrome.storage.sync.get(['templates'], async (data: { templates?: Template[] }) => {
			currentTemplate = data.templates?.find((t: Template) => t.name === this.value) || null;
			if (currentTemplate) {
				const tabs = await chrome.tabs.query({active: true, currentWindow: true});
				if (tabs[0].id) {
					const extractedData = await extractPageContent(tabs[0].id);
					if (extractedData) {
						const initializedContent = await initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent, tabs[0].url!);
						if (initializedContent) {
							await updateTemplateFields(currentTemplate, initializedContent.currentVariables);
							populateFields(initializedContent, currentTemplate);
						} else {
							showError('Unable to initialize page content.');
						}
					} else {
						showError('Unable to retrieve page content. Try reloading the page.');
					}
				}
			}
		});
	});

	// Match template based on URL
	chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
		if (!tabs[0].url || tabs[0].url.startsWith('chrome-extension://') || tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('about:') || tabs[0].url.startsWith('file://')) {
			showError('This page cannot be clipped.');
			return;
		}

		const currentUrl = tabs[0].url;

		// Load templates and find matching template
		chrome.storage.sync.get(['templates'], async (data: { templates?: Template[] }) => {
			const templates: Template[] = data.templates || [];
			currentTemplate = findMatchingTemplate(currentUrl, templates) || templates[0];

			// Update the template dropdown to reflect the matched template
			if (currentTemplate) {
				templateDropdown.value = currentTemplate.name;
			}

			if (tabs[0].id) {
				const extractedData = await extractPageContent(tabs[0].id);
				if (extractedData) {
					const initializedContent = await initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent, currentUrl);
					if (initializedContent && currentTemplate) {
						await updateTemplateFields(currentTemplate, initializedContent.currentVariables);
						populateFields(initializedContent, currentTemplate);
					} else {
						showError('Unable to initialize page content.');
					}
				} else {
					showError('Unable to retrieve page content. Try reloading the page.');
				}
			}
		});
	});

	async function updateTemplateFields(template: Template, currentVariables: { [key: string]: string }) {
		const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
		templateProperties.innerHTML = '';

		const tabs = await chrome.tabs.query({active: true, currentWindow: true});
		const tabId = tabs[0].id!;

		for (const property of template.properties) {
			const propertyDiv = document.createElement('div');
			propertyDiv.className = 'metadata-property';
			let value = property.value;

			// Replace variables
			for (const [variable, replacement] of Object.entries(currentVariables)) {
				value = value.replace(new RegExp(variable, 'g'), replacement as string);
			}

			// Handle custom selectors
			value = await replaceSelectorsWithContent(tabId, value);

			propertyDiv.innerHTML = `
				<label for="${property.name}">${property.name}</label>
				<input id="${property.name}" type="text" value="${value}" data-type="${property.type}" />
			`;
			templateProperties.appendChild(propertyDiv);
		}

		await updateFileNameField(template);
		await updatePathField(template);
		await updateNoteContentField(template);
	}

	async function populateFields(initializedContent: any, template: Template) {
		const { noteName, currentVariables } = initializedContent;

		const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
		if (noteNameField) noteNameField.value = noteName;

		const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
		const inputs = Array.from(templateProperties.querySelectorAll('input'));

		const tabs = await chrome.tabs.query({active: true, currentWindow: true});
		const tabId = tabs[0].id!;

		for (const input of inputs) {
			const propertyName = input.id;
			let value = template.properties.find(p => p.name === propertyName)?.value || '';

			// Replace variables
			for (const [variable, replacement] of Object.entries(currentVariables)) {
				value = value.replace(new RegExp(variable, 'g'), replacement as string);
			}

			// Handle custom selectors
			value = await replaceSelectorsWithContent(tabId, value);

			input.value = applyPropertyTypeFormatting(value, input.getAttribute('data-type'));
		}

		const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
		if (noteContentField && template.noteContentFormat) {
			let content = template.noteContentFormat;

			// Replace variables in note content
			for (const [variable, replacement] of Object.entries(currentVariables)) {
				content = content.replace(new RegExp(variable, 'g'), replacement as string);
			}

			// Handle custom selectors in note content
			content = await replaceSelectorsWithContent(tabId, content);

			noteContentField.value = content;
		}
	}

	function applyPropertyTypeFormatting(value: string, propertyType: string | null): string {
		switch (propertyType) {
			case 'number':
				const numericValue = value.replace(/[^\d.-]/g, '');
				return numericValue ? parseFloat(numericValue).toString() : value;
			case 'checkbox':
				return (value.toLowerCase() === 'true' || value === '1').toString();
			case 'date':
				return dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : value;
			case 'datetime':
				return dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : value;
			default:
				return value;
		}
	}

	async function updateFileNameField(template: Template) {
		if (template.behavior === 'create' && template.noteNameFormat) {
			const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
			if (noteNameField) {
				noteNameField.value = getFileName(template.noteNameFormat);
			}
		}
	}

	async function updatePathField(template: Template) {
		const pathField = document.getElementById('path-name-field') as HTMLInputElement;
		if (pathField) {
			pathField.value = template.path;
		}
	}

	async function updateNoteContentField(template: Template) {
		const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
		if (noteContentField && template && template.noteContentFormat) {
			noteContentField.value = template.noteContentFormat;
		}
	}

	document.getElementById('clip-button')!.addEventListener('click', async function() {
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
			const frontmatter = await generateFrontmatter(properties as Property[]);
			fileContent = frontmatter + noteContent;
		} else {
			fileContent = noteContent;
		}

		saveToObsidian(fileContent, noteName, path, selectedVault, currentTemplate.behavior, currentTemplate.specificNoteName, currentTemplate.dailyNoteFormat);
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
	}
});
