import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';
import dayjs from 'dayjs';

import { Template, Property } from './types';

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

	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		if (tabs[0].url) {
			currentUrl = tabs[0].url;
		}

		if (currentUrl.startsWith('chrome-extension://') || currentUrl.startsWith('chrome://') || currentUrl.startsWith('about:') || currentUrl.startsWith('file://')) {
			showError('This page cannot be clipped.');
			return;
		}

		// Load templates and find matching template
		chrome.storage.sync.get(['templates'], (data: { templates?: Template[] }) => {
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
				chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
					if (response && response.content) {
						initializePageContent(response.content, response.selectedHtml, response.extractedContent);
					} else {
						showError('Unable to retrieve page content. Try reloading the page.');
					}
				});
			}
		});
	});

	async function initializePageContent(content: string, selectedHtml: string, extractedContent: ExtractedContent) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');
		const readabilityArticle = new Readability(doc).parse();
		if (!readabilityArticle) {
			console.error('Failed to parse content with Readability');
			return;
		}
		const { title: rawTitle, byline, excerpt, lang } = readabilityArticle;
		
		currentTitle = rawTitle.replace(/"/g, "'");
		const noteName = getFileName(currentTitle);
		const noteNameField = document.getElementById('note-name-field') as HTMLInputElement;
		if (noteNameField) noteNameField.value = noteName;

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

		await updateTemplatePropertiesWithVariables();
		await updateFileNameField(template);
		await updatePathField(template);
		await updateNoteContentField(template);
	}

	async function updateTemplatePropertiesWithVariables() {
		const templateProperties = document.querySelector('.metadata-properties') as HTMLElement;
		const inputs = Array.from(templateProperties.querySelectorAll('input'));

		for (const input of inputs) {
			let value = input.value;
			for (const [variable, replacement] of Object.entries(currentVariables)) {
				value = value.replace(new RegExp(variable, 'g'), replacement);
			}

			value = await replaceSelectorsWithContent(value);

			// Apply type-specific parsing
			const propertyType = input.getAttribute('data-type');
			switch (propertyType) {
				case 'number':
					const numericValue = value.replace(/[^\d.-]/g, '');
					value = numericValue ? parseFloat(numericValue).toString() : '';
					break;
				case 'checkbox':
					value = (value.toLowerCase() === 'true' || value === '1').toString();
					break;
				case 'date':
					value = dayjs(value).format('YYYY-MM-DD');
					break;
				case 'datetime':
					value = dayjs(value).format('YYYY-MM-DD HH:mm:ss');
					break;
			}

			input.value = value;
		}
	}

	async function extractContentBySelector(selector: string): Promise<string> {
		return new Promise((resolve) => {
			chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
				if (tabs[0].id) {
					chrome.tabs.sendMessage(tabs[0].id, {action: "extractContent", selector: selector}, function(response) {
						resolve(response ? response.content : '');
					});
				} else {
					resolve('');
				}
			});
		});
	}

	async function replaceSelectorsWithContent(text: string): Promise<string> {
		const selectorRegex = /{{selector:(.*?)}}/g;
		const matches = text.match(selectorRegex);
		
		if (matches) {
			for (const match of matches) {
				const selector = match.match(/{{selector:(.*?)}}/)![1];
				const content = await extractContentBySelector(selector);
				text = text.replace(match, content);
			}
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

	async function replaceVariablesAndSelectors(text: string): Promise<string> {
		// Replace variables
		for (const [variable, replacement] of Object.entries(currentVariables)) {
			text = text.replace(new RegExp(variable, 'g'), replacement);
		}
		
		// Handle custom selectors
		text = await replaceSelectorsWithContent(text);
		
		return text;
	}

	function createMarkdownContent(content: string, url: string, selectedHtml: string): string {
		const parser = new DOMParser();
		const doc = parser.parseFromString(content, 'text/html');

		const baseUrl = new URL(url);

		function makeUrlAbsolute(element: Element, attributeName: string) {
			const attributeValue = element.getAttribute(attributeName);
			if (attributeValue && !attributeValue.startsWith('http') && !attributeValue.startsWith('data:') && !attributeValue.startsWith('#') && !attributeValue.startsWith('mailto:')) {
				element.setAttribute(attributeName, new URL(attributeValue, baseUrl).href);
			}
		}

		let markdownContent: string;

		if (selectedHtml) {
			// If there's selected HTML, use it directly
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = selectedHtml;
			
			// Handle relative URLs for both images and links in the selection
			tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src'));
			tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href'));
			
			markdownContent = tempDiv.innerHTML;
		} else {
			// If no selection, use Readability
			const readabilityArticle = new Readability(doc).parse();
			if (!readabilityArticle) {
				console.error('Failed to parse content with Readability');
				return '';
			}
			const { content: readableContent } = readabilityArticle;
			
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = readableContent;
			
			// Handle relative URLs for both images and links in the full content
			tempDiv.querySelectorAll('img').forEach(img => makeUrlAbsolute(img, 'src'));
			tempDiv.querySelectorAll('a').forEach(link => makeUrlAbsolute(link, 'href'));
			
			markdownContent = tempDiv.innerHTML;
		}

		const turndownService = new TurndownService({
			headingStyle: 'atx',
			hr: '---',
			bulletListMarker: '-',
			codeBlockStyle: 'fenced',
			emDelimiter: '*',
		});

		turndownService.use(gfm);

		// Custom rule to handle bullet lists without extra spaces
		turndownService.addRule('listItem', {
			filter: 'li',
			replacement: function (content: string, node: Node, options: TurndownService.Options) {
				content = content.trim();
				let prefix = options.bulletListMarker + ' ';
				let parent = node.parentNode;
				if (parent instanceof HTMLOListElement) {
					let start = parent.getAttribute('start');
					let index = Array.from(parent.children).indexOf(node as HTMLElement) + 1;
					prefix = (start ? Number(start) + index - 1 : index) + '. ';
				}
				return prefix + content + '\n';
			}
		});

		let markdown = turndownService.turndown(markdownContent);

		// Remove the title from the beginning of the content if it exists
		const titleMatch = markdown.match(/^# .+\n+/);
		if (titleMatch) {
			markdown = markdown.slice(titleMatch[0].length);
		}

		return markdown.trim();
	}

	document.getElementById('clip-button')!.addEventListener('click', async function() {
		chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
			chrome.tabs.sendMessage(tabs[0].id!, {action: "getPageContent"}, async function(response) {
				if (response && response.content) {
					chrome.storage.sync.get(['templates'], async (data) => {
						const selectedVault = (document.getElementById('vault-dropdown') as HTMLSelectElement).value;
						const selectedTemplate = (document.getElementById('template-select') as HTMLSelectElement).value;
						const template = data.templates.find((t: Template) => t.name === selectedTemplate) || data.templates[0];
						
						// Initialize popup content with the selected HTML
						await initializePageContent(response.content, response.selectedHtml, response.extractedContent);
						
						// Use the current value of the textarea instead of regenerating the content
						let noteContent = (document.getElementById('note-content-field') as HTMLTextAreaElement).value;
						
						// Handle custom selectors in note content
						noteContent = await replaceSelectorsWithContent(noteContent);

						let fileContent: string;
						let noteName: string;
						if (template.behavior === 'create') {
							const frontmatter = await generateFrontmatter(template.properties);
							fileContent = frontmatter + noteContent;
							noteName = await replaceVariablesAndSelectors((document.getElementById('note-name-field') as HTMLInputElement).value);
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

	async function generateFrontmatter(properties: Property[]): Promise<string> {
		let frontmatter = '---\n';
		for (const property of properties) {
			let value = property.value;
			// Replace variables
			Object.keys(currentVariables).forEach(variable => {
				value = value.replace(new RegExp(variable, 'g'), currentVariables[variable]);
			});
			// Handle custom selectors
			value = await replaceSelectorsWithContent(value);

			frontmatter += `${property.name}:`;

			// Format the value based on the property type
			switch (property.type) {
				case 'multitext':
					frontmatter += '\n';
					const items = value.split(',').map(item => item.trim());
					items.forEach(item => {
						frontmatter += `  - ${item}\n`;
					});
					break;
				case 'number':
					const numericValue = value.replace(/[^\d.-]/g, '');
					frontmatter += numericValue ? ` ${parseFloat(numericValue)}\n` : '\n';
					break;
				case 'checkbox':
					frontmatter += ` ${value.toLowerCase() === 'true' || value === '1'}\n`;
					break;
				case 'date':
					frontmatter += ` "${dayjs(value).format('YYYY-MM-DD')}"\n`;
					break;
				case 'datetime':
					frontmatter += ` "${dayjs(value).format('YYYY-MM-DD HH:mm:ss')}"\n`;
					break;
				default: // Text
					frontmatter += ` "${value}"\n`;
			}
		}
		frontmatter += '---\n\n';
		return frontmatter;
	}

	function saveToObsidian(fileContent: string, noteName: string, path: string, vault: string, behavior: string, specificNoteName?: string, dailyNoteFormat?: string) {
		let obsidianUrl: string;
		let content = fileContent;

		// Ensure path ends with a slash
		if (path && !path.endsWith('/')) {
			path += '/';
		}

		if (behavior === 'append-specific' || behavior === 'append-daily') {
			let appendFileName: string;
			if (behavior === 'append-specific') {
				appendFileName = specificNoteName!;
			} else {
				appendFileName = dayjs().format(dailyNoteFormat!);
			}
			obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + appendFileName)}&append=true`;
			
			// Add newlines at the beginning to separate from existing content
			content = '\n\n' + content;
		} else {
			obsidianUrl = `obsidian://new?file=${encodeURIComponent(path + noteName)}`;
		}

		obsidianUrl += `&content=${encodeURIComponent(content)}`;

		const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
		obsidianUrl += vaultParam;

		chrome.tabs.create({ url: obsidianUrl }, function(tab) {
			setTimeout(() => chrome.tabs.remove(tab!.id!), 500);
		});
	}

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

	function getFileName(noteName: string): string {
		const isWindows = navigator.platform.indexOf('Win') > -1;
		if (isWindows) {
			noteName = noteName.replace(':', '').replace(/[/\\?%*|"<>]/g, '-');
		} else {
			noteName = noteName.replace(':', '').replace(/[/\\]/g, '-');
		}
		return noteName;
	}

	function convertDate(date: Date): string {
		return dayjs(date).format('YYYY-MM-DD');
	}

	function getMetaContent(doc: Document, attr: string, value: string): string {
		var element = doc.querySelector(`meta[${attr}='${value}']`);
		return element ? element.getAttribute("content")!.trim() : "";
	}
});
