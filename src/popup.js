import TurndownService from 'turndown';
import { gfm, tables, strikethrough } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';
import dayjs from 'dayjs';

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
	const templateProperties = document.querySelector('.metadata-properties');
	const vaultContainer = document.getElementById('vault-container');
	const templateContainer = document.getElementById('template-container');
	
	// Load vaults from storage and populate dropdown
	chrome.storage.sync.get(['vaults'], (data) => {
		if (data.vaults && data.vaults.length > 0) {
			data.vaults.forEach(vault => {
				const option = document.createElement('option');
				option.value = vault;
				option.textContent = vault;
				vaultDropdown.appendChild(option);
			});
			vaultContainer.style.display = 'block'; // Show vault dropdown if custom vaults exist
		}
	});

	// Load templates from storage and populate dropdown
	chrome.storage.sync.get(['templates'], (data) => {
		templateSelect.innerHTML = ''; // Clear existing options
		
		if (data.templates && data.templates.length > 1) {
			data.templates.forEach(template => {
				const option = document.createElement('option');
				option.value = template.name;
				option.textContent = template.name;
				templateSelect.appendChild(option);

				if (template.name === 'Default') {
					option.selected = true;
				}
			});
			templateContainer.style.display = 'block';
			updateTemplateProperties(data.templates[0]);
		} else {
			// If only Default template exists, use it without showing the dropdown
			updateTemplateProperties(data.templates[0]);
		}
	});

	// Add event listener for template selection change
	templateSelect.addEventListener('change', function() {
		chrome.storage.sync.get(['templates'], (data) => {
			const selectedTemplate = data.templates.find(t => t.name === this.value);
			if (selectedTemplate) {
				updateTemplateProperties(selectedTemplate);
				templateContainer.style.display = 'block'; // Show template select if multiple templates exist
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
				updateTemplateProperties(matchingTemplate);
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
		'{{image}}': image
	};

	updateTemplatePropertiesWithVariables();
	updateFileNameField();
}

function updateTemplateProperties(template) {
	const templateProperties = document.querySelector('.metadata-properties');
	templateProperties.innerHTML = '';

	template.properties.forEach(property => {
		const propertyDiv = document.createElement('div');
		propertyDiv.className = 'metadata-property';
		propertyDiv.innerHTML = `
			<label for="${property.name}">${property.name}</label>
			<input id="${property.name}" type="text" value="${property.value}" />
		`;
		templateProperties.appendChild(propertyDiv);
	});

	updateTemplatePropertiesWithVariables();
	updateFileNameField();
}

function updateTemplatePropertiesWithVariables() {
	const templateProperties = document.querySelector('.metadata-properties');
	const inputs = templateProperties.querySelectorAll('input');

	inputs.forEach(input => {
		let value = input.value;
		Object.keys(currentVariables).forEach(variable => {
			value = value.replace(new RegExp(variable, 'g'), currentVariables[variable]);
		});
		input.value = value;
	});
}

function updateFileNameField() {
	chrome.storage.sync.get(['templates'], (data) => {
		const selectedTemplateName = document.getElementById('template-select').value;
		const selectedTemplate = data.templates.find(t => t.name === selectedTemplateName) || data.templates[0];
		
		if (selectedTemplate.behavior === 'create' && selectedTemplate.fileNameFormat) {
			let fileName = selectedTemplate.fileNameFormat;
			Object.keys(currentVariables).forEach(variable => {
				fileName = fileName.replace(new RegExp(variable, 'g'), currentVariables[variable]);
			});
			document.getElementById('file-name-field').value = getFileName(fileName);
		}
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

	let markdown = turndownService.turndown(readableContent);

	// Add a heading with the page title at the top of the content
	markdown = `# ${currentTitle}\n\n${markdown}`;

	return markdown;
}

document.getElementById('clip-button').addEventListener('click', function() {
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
			if (response && response.content) {
				chrome.storage.sync.get(['templates'], (data) => {
					const selectedVault = document.getElementById('vault-dropdown').value;
					const selectedTemplate = document.getElementById('template-select').value;
					const template = data.templates.find(t => t.name === selectedTemplate) || data.templates[0];
					
					const markdownBody = createMarkdownContent(response.content, tabs[0].url);
					
					let fileContent;
					let fileName;
					if (template.behavior === 'create') {
						const frontmatter = template.properties.reduce((acc, property) => {
							let value = property.value;
							Object.keys(currentVariables).forEach(variable => {
								value = value.replace(new RegExp(variable, 'g'), currentVariables[variable]);
							});
							return acc + `${property.name}: ${value}\n`;
						}, '---\n') + '---\n';
						fileContent = frontmatter + markdownBody;
						fileName = document.getElementById('file-name-field').value;
					} else {
						fileContent = markdownBody;
						fileName = ''; // Not used for append behaviors
					}

					saveToObsidian(fileContent, fileName, template.folderName, selectedVault, template.behavior, template.specificNoteName, template.dailyNoteFormat);
				});
			} else {
				showError('Unable to retrieve page content. Try reloading the page.');
			}
		});
	});
});

function saveToObsidian(fileContent, fileName, folder, vault, behavior, specificNoteName, dailyNoteFormat) {
	let obsidianUrl;
	let content = fileContent;

	if (behavior === 'append-specific' || behavior === 'append-daily') {
		let appendFileName;
		if (behavior === 'append-specific') {
			appendFileName = specificNoteName;
		} else {
			appendFileName = dayjs().format(dailyNoteFormat);
		}
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(folder + appendFileName)}&append=true`;
		
		// Add newlines at the beginning to separate from existing content
		content = '\n\n' + content;
	} else {
		obsidianUrl = `obsidian://new?file=${encodeURIComponent(folder + fileName)}`;
	}

	obsidianUrl += `&content=${encodeURIComponent(content)}`;

	const vaultParam = vault ? `&vault=${encodeURIComponent(vault)}` : '';
	obsidianUrl += vaultParam;

	chrome.tabs.create({ url: obsidianUrl }, function(tab) {
		setTimeout(() => chrome.tabs.remove(tab.id), 500);
	});
}

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
	return dayjs(date).format('YYYY-MM-DD');
}

function getMetaContent(doc, attr, value) {
	var element = doc.querySelector(`meta[${attr}='${value}']`);
	return element ? element.getAttribute("content").trim() : "";
}
