import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';
import dayjs from 'dayjs';

import { Template, Property } from '../types/types';
import { generateFrontmatter, saveToObsidian, getFileName } from '../utils/obsidian-note-creator';
import { createMarkdownContent, extractReadabilityContent } from '../utils/markdown-converter';
import { extractPageContent, getMetaContent, replaceSelectorsWithContent } from '../utils/content-extractor';

interface ExtractedContent {
	[key: string]: string;
}

let currentUrl: string = '';
let currentTitle: string = '';
let currentVariables: { [key: string]: string } = {};
let currentTemplate: Template | null = null;

function findMatchingTemplate(url: string, templates: Template[]): Template | undefined {
	return templates.find(template => 
		template.urlPatterns && template.urlPatterns.some(pattern => url.startsWith(pattern))
	);
}

document.addEventListener('DOMContentLoaded', function() {
	const vaultDropdown = document.getElementById('vault-dropdown') as HTMLSelectElement;
	const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
	const vaultContainer = document.getElementById('vault-container') as HTMLElement;
	const templateContainer = document.getElementById('template-container') as HTMLElement;
	
	let currentTemplate: Template | null = null;
	let vaults: string[] = [];

	// Load vaults from storage
	chrome.storage.sync.get(['vaults'], (data: { vaults?: string[] }) => {
		vaults = data.vaults || [];
		updateVaultDropdown();
	});

	// Load templates from storage and populate dropdown
	chrome.storage.sync.get(['templates'], (data: { templates?: Template[] }) => {
		if (!data.templates || data.templates.length === 0) {
			console.error('No templates found in storage');
			return;
		}

		templateSelect.innerHTML = '';
		
		data.templates.forEach((template: Template) => {
			const option = document.createElement('option');
			option.value = template.name;
			option.textContent = template.name;
			templateSelect.appendChild(option);
		});

		// Set the first template as the default
		currentTemplate = data.templates[0];
		if (currentTemplate) {
			templateSelect.value = currentTemplate.name;
		}

		if (data.templates.length > 1) {
			templateContainer.style.display = 'block';
		}

		if (currentTemplate) {
			updateTemplateProperties(currentTemplate);
		}
	});

	function updateVaultDropdown() {
		vaultDropdown.innerHTML = '';
		
		vaults.forEach(vault => {
			const option = document.createElement('option');
			option.value = vault;
			option.textContent = vault;
			vaultDropdown.appendChild(option);
		});

		if (vaults.length > 0) {
			vaultContainer.style.display = 'block';
			vaultDropdown.value = vaults[0]; // Set first vault as default
		} else {
			vaultContainer.style.display = 'none';
		}
	}

	// Add event listener for template selection change
	templateSelect.addEventListener('change', function() {
		chrome.storage.sync.get(['templates'], (data: { templates?: Template[] }) => {
			currentTemplate = data.templates?.find((t: Template) => t.name === this.value) || null;
			if (currentTemplate) {
				updateTemplateProperties(currentTemplate);
			}
		});
	});

	chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
		if (tabs[0].url) {
			currentUrl = tabs[0].url;
		}

		if (currentUrl.startsWith('chrome-extension://') || currentUrl.startsWith('chrome://') || currentUrl.startsWith('about:') || currentUrl.startsWith('file://')) {
			showError('This page cannot be clipped.');
			return;
		}

		// Load templates and find matching template
		chrome.storage.sync.get(['templates'], async (data: { templates?: Template[] }) => {
			const templates: Template[] = data.templates || [];
			const matchingTemplate = findMatchingTemplate(currentUrl, templates);
			
			if (matchingTemplate) {
				currentTemplate = matchingTemplate;
				templateSelect.value = currentTemplate.name;
			} else {
				currentTemplate = templates[0]; // Use the first template as default
			}

			if (currentTemplate) {
				updateTemplateProperties(currentTemplate);
			}

			if (tabs[0].id) {
				const extractedData = await extractPageContent(tabs[0].id);
				if (extractedData) {
					initializePageContent(extractedData.content, extractedData.selectedHtml, extractedData.extractedContent);
				} else {
					showError('Unable to retrieve page content. Try reloading the page.');
				}
			}
		});
	});

	async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent) {
		const readabilityArticle = extractReadabilityContent(content);
		if (!readabilityArticle) {
			console.error('Failed to parse content with Readability');
			return;
		}
		const { title: rawTitle, byline, excerpt, lang } = readabilityArticle;
		
		currentTitle = rawTitle.replace(/"/g, "'");
		const noteName = getFileName(currentTitle);
		const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
		if (noteNameField) noteNameField.value = noteName;

		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');

		const author = byline || getMetaContent(doc, "name", "author") || getMetaContent(doc, "property", "author") || getMetaContent(doc, "name", "twitter:creator") || getMetaContent(doc, "property", "og:site_name");

		const description = excerpt || getMetaContent(doc, "name", "description") || getMetaContent(doc, "property", "description") || getMetaContent(doc, "property", "og:description");
		const image = getMetaContent(doc, "property", "og:image") || getMetaContent(doc, "name", "twitter:image");
		const language = lang;

		const timeElement = doc.querySelector("time");
		const publishedDate = timeElement?.getAttribute("datetime");
		const published = publishedDate ? `${convertDate(new Date(publishedDate))}` : "";

		const markdownBody = createMarkdownContent(content, currentUrl, selectedHtml);

		currentVariables = {
			'{{title}}': currentTitle,
			'{{url}}': currentUrl,
			'{{published}}': published,
			'{{author}}': author ?? '',
			'{{today}}': convertDate(new Date()),
			'{{description}}': description ?? '',
			'{{domain}}': new URL(currentUrl).hostname,
			'{{image}}': image ?? '',
			'{{language}}': language ?? '',
			'{{content}}': markdownBody
		};

		// Add extracted content to variables
		Object.assign(currentVariables, Object.fromEntries(
			Object.entries(extractedContent).map(([key, value]) => [`{{${key}}}`, value])
		));

		// Add all meta tags to variables
		doc.querySelectorAll('meta').forEach(meta => {
			const name = meta.getAttribute('name');
			const property = meta.getAttribute('property');
			const content = meta.getAttribute('content');

			if (name && content) {
				currentVariables[`{{meta:name:${name}}}`] = content;
			}
			if (property && content) {
				currentVariables[`{{meta:property:${property}}}`] = content;
			}
		});

		await updateTemplatePropertiesWithVariables();
		if (currentTemplate) {
			await updateFileNameField(currentTemplate);
			await updateNoteContentField(currentTemplate);
		}
	}

	async function updateTemplateProperties(template: Template) {
		const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
		templateProperties.innerHTML = '';

		for (const property of template.properties) {
			const propertyDiv = document.createElement('div');
			propertyDiv.className = 'metadata-property';
			propertyDiv.innerHTML = `
				<label for="${property.name}">${property.name}</label>
				<input id="${property.name}" type="text" value="${property.value}" data-type="${property.type}" />
			`;
			templateProperties.appendChild(propertyDiv);
		}

		// Add event listeners to capture user edits
		const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
		if (noteNameField) {
			noteNameField.addEventListener('input', function() {
				currentVariables['{{title}}'] = this.value;
			});
		}

		templateProperties.addEventListener('input', function(event) {
			const target = event.target as HTMLInputElement;
			if (target.tagName === 'INPUT') {
				const propertyName = target.id;
				currentVariables[`{{${propertyName}}}`] = target.value;
			}
		});

		const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
		if (noteContentField) {
			noteContentField.addEventListener('input', function() {
				currentVariables['{{content}}'] = this.value;
			});
		}

		await updateTemplatePropertiesWithVariables();
		await updateFileNameField(template);
		await updatePathField(template);
		await updateNoteContentField(template);
	}

	async function updateTemplatePropertiesWithVariables() {
		const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
		const inputs = Array.from(templateProperties.querySelectorAll('input'));

		const tabs = await chrome.tabs.query({active: true, currentWindow: true});
		const tabId = tabs[0].id!;

		for (const input of inputs) {
			let value = input.value;
			for (const [variable, replacement] of Object.entries(currentVariables)) {
				value = value.replace(new RegExp(variable, 'g'), replacement);
			}

			value = await replaceSelectorsWithContent(tabId, value);

			// Apply type-specific parsing
			const propertyType = input.getAttribute('data-type');
			switch (propertyType) {
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

			input.value = value;
		}
	}

	async function replaceVariablesAndSelectors(text: string): Promise<string> {
		// Replace variables
		for (const [variable, replacement] of Object.entries(currentVariables)) {
			text = text.replace(new RegExp(variable, 'g'), replacement);
		}
		
		// Handle custom selectors
		const tabs = await chrome.tabs.query({active: true, currentWindow: true});
		if (tabs[0].id) {
			text = await replaceSelectorsWithContent(tabs[0].id, text);
		}
		
		return text;
	}

	async function updateFileNameField(template: Template) {
		if (template.behavior === 'create' && template.noteNameFormat) {
			let noteName = template.noteNameFormat;
			noteName = await replaceVariablesAndSelectors(noteName);
			const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
			if (noteNameField) {
				noteNameField.value = getFileName(noteName);
			}
		}
	}

	async function updatePathField(template: Template) {
		const pathField = document.getElementById('path-name-field') as HTMLInputElement;
		if (pathField) {
			let path = template.path;
			path = await replaceVariablesAndSelectors(path);
			pathField.value = path;
		}
	}

	async function updateNoteContentField(template: Template) {
		const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
		if (noteContentField && template && template.noteContentFormat) {
			let content = template.noteContentFormat;
			content = await replaceVariablesAndSelectors(content);
			noteContentField.value = content;
			
			noteContentField.addEventListener('input', function() {
				currentVariables['{{content}}'] = this.value;
			});
		}
	}

	document.getElementById('clip-button')!.addEventListener('click', async function() {
		chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
			chrome.tabs.sendMessage(tabs[0].id!, {action: "getPageContent"}, async function(response) {
				if (response && response.content) {
					chrome.storage.sync.get(['templates'], async (data) => {
						const selectedVault = (document.getElementById('vault-dropdown') as HTMLSelectElement).value;
						const selectedTemplate = (document.getElementById('template-select') as HTMLSelectElement).value;
						const template = data.templates.find((t: Template) => t.name === selectedTemplate) || data.templates[0];
						
						// Use the current values from the UI
						let noteContent = (document.getElementById('note-content-field') as HTMLTextAreaElement).value;
						let noteName = (document.getElementById('note-name-field') as HTMLInputElement).value;
						
						// Handle custom selectors in note content
						noteContent = await replaceSelectorsWithContent(tabs[0].id!, noteContent);

						let fileContent: string;
						if (template.behavior === 'create') {
							const frontmatter = await generateFrontmatter(template.properties, currentVariables, (text: string) => replaceSelectorsWithContent(tabs[0].id!, text));
							fileContent = frontmatter + noteContent;
						} else {
							fileContent = noteContent;
							noteName = '';
						}

						let path = await replaceVariablesAndSelectors(template.path);

						saveToObsidian(fileContent, noteName, path, selectedVault, template.behavior, template.specificNoteName, template.dailyNoteFormat);
					});
				} else {
					showError('Unable to retrieve page content. Try reloading the page.');
				}
			});
		});
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

	function convertDate(date: Date): string {
		return dayjs(date).format('YYYY-MM-DD');
	}
});
