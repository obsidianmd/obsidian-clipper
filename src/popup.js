import TurndownService from 'turndown';
import { gfm, tables, strikethrough } from 'turndown-plugin-gfm';
import { Readability } from '@mozilla/readability';

document.addEventListener('DOMContentLoaded', function() {
	const vaultDropdown = document.getElementById('vault-dropdown');
	const templateSelect = document.getElementById('template-select');
	
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
		} else {
			// If no templates are found, add the Default template
			const defaultOption = document.createElement('option');
			defaultOption.value = 'Default';
			defaultOption.textContent = 'Default';
			defaultOption.selected = true;
			templateSelect.appendChild(defaultOption);
		}
	});

	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		const url = tabs[0].url;

		if (url.startsWith('chrome-extension://') || url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('file://')) {
			showError('This page cannot be clipped.');
			return;
		}

		chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
			if (response && response.content) {
				const parser = new DOMParser();
				const doc = parser.parseFromString(response.content, 'text/html');
				const { title: rawTitle } = new Readability(doc).parse();
				const title = rawTitle.replace(/"/g, "'");
				const fileName = getFileName(title);

				document.getElementById('file-name-field').value = fileName;
			} else {
				showError('Unable to retrieve page content. Try reloading the page.');
			}
		});
	});
});

document.getElementById('clip-button').addEventListener('click', function() {
	chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
		chrome.tabs.sendMessage(tabs[0].id, {action: "getPageContent"}, function(response) {
			if (response && response.content) {
				chrome.storage.sync.get(['folderName', 'tags', 'templates'], (data) => {
					const fileName = document.getElementById('file-name-field').value;
					const selectedVault = document.getElementById('vault-dropdown').value;
					const selectedTemplate = document.getElementById('template-select').value;
					const template = data.templates.find(t => t.name === selectedTemplate) || data.templates[0];
					processContent(response.content, tabs[0].url, selectedVault, data.folderName, data.tags, fileName, template);
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
	const errorMessage = document.getElementById('error-message');
	const clipper = document.querySelector('.clipper');

	errorMessage.textContent = message;
	errorMessage.style.display = 'block';
	clipper.style.display = 'none';
}

function processContent(content, url, vaultName = "", folderName = "Clippings/", tags = "clippings", fileName, template) {
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

	const { title: rawTitle, byline, content: readableContent } = new Readability(doc).parse();

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

	const markdownBody = turndownService.turndown(readableContent);

	const today = convertDate(new Date());

	var author = byline || getMetaContent(doc, "name", "author") || getMetaContent(doc, "property", "author") || getMetaContent(doc, "property", "og:site_name");

	var authorBrackets = author ? `"[[${author}]]"` : "";

	var timeElement = doc.querySelector("time");
	var publishedDate = timeElement ? timeElement.getAttribute("datetime") : "";
	var published = '';
	if (publishedDate && publishedDate.trim() !== "") {
		var date = new Date(publishedDate);
		var year = date.getFullYear();
		var month = (date.getMonth() + 1).toString().padStart(2, '0');
		var day = date.getDate().toString().padStart(2, '0');
		published = `"${year}-${month}-${day}"`;
	}

	const frontmatter = template.fields.reduce((acc, field) => {
		let value = field.value;
		if (field.name === 'title') value = `"${rawTitle.replace(/"/g, "'")}"`;
		if (field.name === 'source') value = url;
		if (field.name === 'created') value = `"${today}"`;
		if (field.name === 'author') value = authorBrackets;
		if (field.name === 'published') value = published;
		if (field.name === 'tags') value = `[${tags}]`;
		return acc + `${field.name}: ${value}\n`;
	}, '---\n') + '---\n';

	const fileContent = frontmatter + markdownBody;

	saveToObsidian(fileContent, fileName, folderName, vaultName);
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