import TurndownService from 'turndown';
import { gfm, tables, strikethrough } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';

let currentUrl = '';
let currentTitle = '';
let currentVariables = {};

// Add this function at the beginning of the file
function findMatchingTemplate(url, templates) {
	return templates.find(template => 
		template.urlPatterns && template.urlPatterns.some(pattern => url.startsWith(pattern))
	);
}

document.addEventListener('DOMContentLoaded', function() {
	const vaultDropdown = document.getElementById('vault-dropdown');
	const templateSelect = document.getElementById('template-select');
	const templateFields = document.querySelector('.metadata-properties');
	
	// Load vaults from storage and populate dropdown
	chrome.storage.sync.get(['vaults'], (data) => {
		if (data.vaults && data.vaults.length > 0) {
			data.vaults.forEach(vault => {
				const option = document.createElement('option');
				option.value = vault;
				option.textContent = vault;
				vaultDropdown.appendChild(option);
			});
		} else {
			const option = document.createElement('option');
			option.value = '';
			option.textContent = 'Save to my open vault';
			vaultDropdown.appendChild(option);
		}
	});

	// Load templates from storage and populate dropdown
	chrome.storage.sync.get(['templates'], (data) => {
		templateSelect.innerHTML = ''; // Clear existing options
		
		if (data.templates && data.templates.length > 0) {
			data.templates.forEach(template => {
				const option = document.createElement('option');
				option.value = template.name;
				option.textContent = template.name;
				templateSelect.appendChild(option);
				
				// Select the Default template
				if (template.name === 'Default') {
					option.selected = true;
				}
			});
			updateTemplateFields(data.templates[0]);
		} else {
			// If no templates are found, add the Default template
			const defaultOption = document.createElement('option');
			defaultOption.value = 'Default';
			defaultOption.textContent = 'Default';
			defaultOption.selected = true;
			templateSelect.appendChild(defaultOption);
		}
	});

	// Add event listener for template selection change
	templateSelect.addEventListener('change', function() {
		chrome.storage.sync.get(['templates'], (data) => {
			const selectedTemplate = data.templates.find(t => t.name === this.value);
			if (selectedTemplate) {
				updateTemplateFields(selectedTemplate);
			}
		});
	});

	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		currentUrl = tabs[0].url;

		if (currentUrl.startsWith('chrome-extension://') || currentUrl.startsWith('chrome://') || currentUrl.startsWith('about:') || currentUrl.startsWith('file://')) {
			showError('This page cannot be clipped.');
			return;
		}

		// Load templates and find matching template
		chrome.storage.sync.get(['templates'], (data) => {
			const templates = data.templates || [];
			const matchingTemplate = findMatchingTemplate(currentUrl, templates);
			
			if (matchingTemplate) {
				const templateSelect = document.getElementById('template-select');
				templateSelect.value = matchingTemplate.name;
				updateTemplateFields(matchingTemplate);
			}

			chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
				if (response && response.content) {
					initializePageContent(response.content);
				} else {
					showError('Unable to retrieve page content. Try reloading the page.');
				}
			});
		});
	});
});

function initializePageContent(content) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');
	const { title: rawTitle, byline, content: readableContent } = new Readability(doc).parse();
	
	currentTitle = rawTitle.replace(/"/g, "'");
	const fileName = getFileName(currentTitle);
	document.getElementById('file-name-field').value = fileName;

	const author = byline || getMetaContent(doc, "name", "author") || getMetaContent(doc, "property", "author") || getMetaContent(doc, "name", "twitter:creator") || getMetaContent(doc, "property", "og:site_name");
	const authorBrackets = author ? `"[[${author}]]"` : "";

	const description = getMetaContent(doc, "name", "description") || getMetaContent(doc, "property", "description") || getMetaContent(doc, "property", "og:description");
	const image = getMetaContent(doc, "property", "og:image") || getMetaContent(doc, "name", "twitter:image");

	const timeElement = doc.querySelector("time");
	const publishedDate = timeElement ? timeElement.getAttribute("datetime") : "";
	const published = publishedDate && publishedDate.trim() !== "" ? `${convertDate(new Date(publishedDate))}` : "";

	currentVariables = {
		'{{title}}': currentTitle,
		'{{url}}': currentUrl,
		'{{published}}': published,
		'{{authorLink}}': authorBrackets,
		'{{today}}': convertDate(new Date()),
		'{{description}}': description,
		'{{domain}}': currentUrl.split('://')[1].split('/')[0],
		'{{image}}': image,
		'{{tags}}': ''
	};

	updateTemplateFieldsWithVariables();
}

function updateTemplateFields(template) {
	const templateFields = document.querySelector('.metadata-properties');
	templateFields.innerHTML = '';

	template.fields.forEach(field => {
		const fieldDiv = document.createElement('div');
		fieldDiv.className = 'metadata-property';
		fieldDiv.innerHTML = `
			<label for="${field.name}">${field.name}</label>
			<input id="${field.name}" type="text" value="${field.value}" />
		`;
		templateFields.appendChild(fieldDiv);
	});

	updateTemplateFieldsWithVariables();
}

function updateTemplateFieldsWithVariables() {
	const templateFields = document.querySelector('.metadata-properties');
	const inputs = templateFields.querySelectorAll('input');

	inputs.forEach(input => {
		let value = input.value;
		Object.keys(currentVariables).forEach(variable => {
			value = value.replace(new RegExp(variable, 'g'), currentVariables[variable]);
		});
		input.value = value;
	});
}

function createMarkdownContent(content, url) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(content, 'text/html');

	const baseUrl = new URL(url);
	const images = doc.querySelectorAll('img');
	images.forEach(img => {
		const src = img.getAttribute('src');
		if (src && !src.startsWith('http')) {
			img.setAttribute('src', new URL(src, baseUrl).href);
		}
	});

	const { content: readableContent } = new Readability(doc).parse();

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
		replacement: function (content, node, options) {
			content = content.trim();
			let prefix = options.bulletListMarker + ' ';
			let parent = node.parentNode;
			if (parent.nodeName === 'OL') {
				let start = parent.getAttribute('start');
				let index = Array.prototype.indexOf.call(parent.children, node) + 1;
				prefix = (start ? Number(start) + index - 1 : index) + '. ';
			}
			return prefix + content + '\n';
		}
	});

	return turndownService.turndown(readableContent);
}

document.getElementById('clip-button').addEventListener('click', function() {
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
			if (response && response.content) {
				chrome.storage.sync.get(['folderName', 'tags', 'templates'], (data) => {
					const fileName = document.getElementById('file-name-field').value;
					const selectedVault = document.getElementById('vault-dropdown').value;
					const selectedTemplate = document.getElementById('template-select').value;
					const template = data.templates.find(t => t.name === selectedTemplate) || data.templates[0];
					
					const markdownBody = createMarkdownContent(response.content, tabs[0].url);
					
					const frontmatter = template.fields.reduce((acc, field) => {
						let value = field.value;
						Object.keys(currentVariables).forEach(variable => {
							value = value.replace(new RegExp(variable, 'g'), currentVariables[variable]);
						});
						return acc + `${field.name}: ${value}\n`;
					}, '---\n') + '---\n';

					const fileContent = frontmatter + markdownBody;
					saveToObsidian(fileContent, fileName, template.folderName, selectedVault);
				});
			} else {
				showError('Unable to retrieve page content. Try reloading the page.');
			}
		});
	});
});

document.getElementById('open-settings').addEventListener('click', function() {
	chrome.runtime.openOptionsPage();
});

function showError(message) {
	const errorMessage = document.querySelector('.error-message');
	const clipper = document.querySelector('.clipper');

	errorMessage.textContent = message;
	errorMessage.style.display = 'block';
	clipper.style.display = 'none';
}

function getFileName(fileName) {
	var userAgent = window.navigator.userAgent,
		platform = window.navigator.platform,
		windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];

	if (windowsPlatforms.indexOf(platform) !== -1) {
		fileName = fileName.replace(':', '').replace(/[/\\?%*|"<>]/g, '-');
	} else {
		fileName = fileName.replace(':', '').replace(/\//g, '-').replace(/\\/g, '-');
	}
	return fileName;
}

function convertDate(date) {
	var yyyy = date.getFullYear().toString();
	var mm = (date.getMonth()+1).toString().padStart(2, '0');
	var dd = date.getDate().toString().padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}

function getMetaContent(doc, attr, value) {
	var element = doc.querySelector(`meta[${attr}='${value}']`);
	return element ? element.getAttribute("content").trim() : "";
}

function saveToObsidian(fileContent, fileName, folder, vault) {
	const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
	const obsidianUrl = `obsidian://new?file=${encodeURIComponent(folder + fileName)}&content=${encodeURIComponent(fileContent)}${vaultParam}`;
	
	chrome.tabs.create({ url: obsidianUrl }, function(tab) {
		setTimeout(() => chrome.tabs.remove(tab.id), 500);
	});
}
