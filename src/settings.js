import { createIcons, Trash2 } from 'lucide';

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input');
	const vaultList = document.getElementById('vault-list');
	const newTemplateBtn = document.getElementById('new-template-btn');
	const templateEditor = document.getElementById('template-editor');
	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name');
	const templateFields = document.getElementById('template-fields');
	const addFieldBtn = document.getElementById('add-field-btn');

	let templates = [];
	let editingTemplateIndex = -1;
	let vaults = [];

	function createDefaultTemplate() {
		return {
			name: 'Default',
			folderName: 'Clippings/',
			fields: [
				{ name: 'title', value: '{{title}}' },
				{ name: 'source', value: '{{url}}' },
				{ name: 'author', value: '{{authorLink}}' },
				{ name: 'published', value: '{{published}}' },
				{ name: 'created', value: '{{today}}' },
				{ name: 'description', value: '{{description}}' },
				{ name: 'tags', value: 'clippings' }
			],
			urlPatterns: []
		};
	}

	function loadGeneralSettings() {
		chrome.storage.sync.get(['vaults'], (data) => {
			vaults = data.vaults || [];
			updateVaultList();
		});
	}

	function updateVaultList() {
		vaultList.innerHTML = '';
		vaults.forEach((vault, index) => {
			const li = document.createElement('li');
			li.textContent = vault;
			li.dataset.index = index;
			const removeBtn = document.createElement('button');
			removeBtn.textContent = 'Remove';
			removeBtn.addEventListener('click', () => removeVault(index));
			li.appendChild(removeBtn);
			vaultList.appendChild(li);
		});
	}

	function addVault(vault) {
		if (vault && !vaults.includes(vault)) {
			vaults.push(vault);
			saveGeneralSettings();
		}
	}

	function removeVault(index) {
		vaults.splice(index, 1);
		saveGeneralSettings();
	}

	function saveGeneralSettings() {
		chrome.storage.sync.set({ vaults }, () => {
			console.log('General settings saved');
			updateVaultList();
		});
	}

	function loadTemplates() {
		chrome.storage.sync.get(['templates'], (data) => {
			templates = data.templates || [];
			if (templates.length === 0) {
				templates.push(createDefaultTemplate());
				chrome.storage.sync.set({ templates });
			}
			updateTemplateList();
			showTemplateEditor(templates[0]);
		});
	}

	function updateTemplateList() {
		const templateList = document.getElementById('template-list');
		templateList.innerHTML = '';
		templates.forEach((template, index) => {
			const li = document.createElement('li');
			li.innerHTML = `
				<span>${template.name}</span>
				<button type="button" class="delete-template-btn clickable-icon" aria-label="Delete template">
					<i data-lucide="trash-2"></i>
				</button>
			`;
			li.dataset.index = index;
			if (index === editingTemplateIndex) {
				li.classList.add('active');
			}
			if (index === 0) {
				li.querySelector('.delete-template-btn').style.display = 'none';
			}
			li.addEventListener('click', (e) => {
				if (!e.target.closest('.delete-template-btn')) {
					document.querySelectorAll('.sidebar li[data-section]').forEach(item => item.classList.remove('active'));
					document.querySelectorAll('#template-list li').forEach(item => item.classList.remove('active'));
					li.classList.add('active');
					showTemplateEditor(template);
					document.getElementById('templates-section').classList.add('active');
					document.getElementById('general-section').classList.remove('active');
				}
			});
			const deleteBtn = li.querySelector('.delete-template-btn');
			if (deleteBtn) {
				deleteBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					deleteTemplate(index);
				});
			}
			templateList.appendChild(li);
		});
		createIcons({
			icons: {
				Trash2
			}
		});
	}

	function deleteTemplate(index) {
		if (index > 0) {
			if (confirm(`Are you sure you want to delete the template "${templates[index].name}"?`)) {
				templates.splice(index, 1);

				if (editingTemplateIndex === index) {
					if (templates.length > 0) {
						const newIndex = Math.max(0, index - 1);
						showTemplateEditor(templates[newIndex]);
					} else {
						clearTemplateEditor();
					}
				} else if (editingTemplateIndex > index) {
					editingTemplateIndex--;
				}
				
				saveTemplateSettings();
				updateTemplateList();
			}
		} else {
			alert("You cannot delete the Default template.");
		}
	}

	function clearTemplateEditor() {
		editingTemplateIndex = -1;
		templateEditorTitle.textContent = 'New template';
		templateName.value = '';
		templateFields.innerHTML = '';
		document.getElementById('template-folder-name').value = 'Clippings/';
		document.getElementById('url-patterns').value = '';
		document.getElementById('template-editor').style.display = 'none';
	}

	function showTemplateEditor(template) {
		editingTemplateIndex = template ? templates.findIndex(t => t.name === template.name) : -1;
		templateEditorTitle.textContent = template ? 'Edit template' : 'New template';
		templateName.value = template ? template.name : '';
		templateFields.innerHTML = '';

		const folderNameInput = document.getElementById('template-folder-name');
		folderNameInput.value = template ? template.folderName : 'Clippings/';

		if (template) {
			template.fields.forEach(field => addFieldToEditor(field.name, field.value));
		} else {
			addFieldToEditor();
		}

		const urlPatternsTextarea = document.getElementById('url-patterns');
		urlPatternsTextarea.value = template && template.urlPatterns ? template.urlPatterns.join('\n') : '';

		document.getElementById('template-editor').style.display = 'block';

		// Update sidebar state
		document.querySelectorAll('.sidebar li[data-section]').forEach(item => item.classList.remove('active'));
		document.querySelectorAll('#template-list li').forEach(item => item.classList.remove('active'));
		if (editingTemplateIndex !== -1) {
			const activeTemplateItem = document.querySelector(`#template-list li[data-index="${editingTemplateIndex}"]`);
			if (activeTemplateItem) {
				activeTemplateItem.classList.add('active');
			}
		}

		document.getElementById('templates-section').classList.add('active');
		document.getElementById('general-section').classList.remove('active');
	}

	function addFieldToEditor(name = '', value = '') {
		const fieldDiv = document.createElement('div');
		fieldDiv.innerHTML = `
				<input type="text" class="field-name" value="${name}" placeholder="Field name">
				<input type="text" class="field-value" value="${value}" placeholder="Field value">
				<button type="button" class="remove-field-btn clickable-icon" aria-label="Remove field">
					<i data-lucide="trash-2"></i>
				</button>
			`;
		templateFields.appendChild(fieldDiv);

		fieldDiv.querySelector('.remove-field-btn').addEventListener('click', () => {
			templateFields.removeChild(fieldDiv);
		});

		createIcons({
			icons: {
				Trash2
			}
		});
	}

	function initializeAutoSave() {
		const templateForm = document.getElementById('template-settings-form');
		if (!templateForm) {
			console.error('Template form not found');
			return;
		}

		const debounce = (func, delay) => {
			let debounceTimer;
			return function() {
				const context = this;
				const args = arguments;
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => func.apply(context, args), delay);
			}
		};

		const autoSave = debounce(() => {
			saveTemplateSettings();
		}, 500);

		templateForm.addEventListener('input', autoSave);

		templateFields.addEventListener('click', (event) => {
			if (event.target.classList.contains('remove-field-btn') || event.target.closest('.remove-field-btn')) {
				autoSave();
			}
		});

		if (addFieldBtn) {
			addFieldBtn.addEventListener('click', () => {
				addFieldToEditor();
				autoSave();
			});
		} else {
			console.error('Add field button not found');
		}
	}

	function saveTemplateSettings() {
		const name = templateName.value.trim();
		const folderNameInput = document.getElementById('template-folder-name');
		const folderName = folderNameInput ? folderNameInput.value.trim() : '';
		
		if (name) {
			const fields = Array.from(templateFields.children)
				.filter(field => field.querySelector('.field-name'))
				.map(field => ({
					name: field.querySelector('.field-name').value.trim(),
					value: field.querySelector('.field-value').value.trim()
				}))
				.filter(field => field.name);
	
			const urlPatternsTextarea = document.getElementById('url-patterns');
			const urlPatterns = urlPatternsTextarea ? urlPatternsTextarea.value
				.split('\n')
				.map(pattern => pattern.trim())
				.filter(pattern => pattern !== '') : [];
	
			const newTemplate = { name, folderName, fields, urlPatterns };
	
			if (editingTemplateIndex === -1) {
				templates.push(newTemplate);
				editingTemplateIndex = templates.length - 1;
			} else {
				templates[editingTemplateIndex] = newTemplate;
			}
	
			chrome.storage.sync.set({ templates }, () => {
				console.log('Template settings auto-saved');
				updateTemplateList();
			});
		}
	}

	function resetDefaultTemplate() {
		const defaultTemplate = createDefaultTemplate();
		const index = templates.findIndex(t => t.name === 'Default');
		if (index !== -1) {
			templates[index] = defaultTemplate;
		} else {
			templates.unshift(defaultTemplate);
		}
		chrome.storage.sync.set({ templates }, () => {
			console.log('Default template reset');
			updateTemplateList();
			showTemplateEditor(defaultTemplate);
		});
	}

	function initializeSidebar() {
		const sidebarItems = document.querySelectorAll('.sidebar li[data-section]');
		const sections = document.querySelectorAll('.settings-section');

		sidebarItems.forEach(item => {
			item.addEventListener('click', () => {
				const sectionId = item.dataset.section;
				sidebarItems.forEach(i => i.classList.remove('active'));
				item.classList.add('active');
				document.querySelectorAll('#template-list li').forEach(templateItem => templateItem.classList.remove('active'));
				document.getElementById('template-editor').style.display = 'none';
				editingTemplateIndex = -1;
				sections.forEach(section => {
					section.classList.remove('active');
					if (section.id === `${sectionId}-section`) {
						section.classList.add('active');
					}
				});
			});
		});
	}

	function initializeSettings() {
		loadGeneralSettings();
		loadTemplates();
		initializeSidebar();
		initializeAutoSave();

		const settingsSection = document.querySelector('.settings-section');
		if (settingsSection) {
			const resetDefaultBtn = document.createElement('button');
			resetDefaultBtn.textContent = 'Reset default template';
			resetDefaultBtn.addEventListener('click', resetDefaultTemplate);
			settingsSection.appendChild(resetDefaultBtn);
		} else {
			console.error('Settings section not found');
		}

		createIcons({
			icons: {
				Trash2
			}
		});
	}

	// Event Listeners
	if (vaultInput) {
		vaultInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				addVault(vaultInput.value.trim());
				vaultInput.value = '';
			}
		});
	} else {
		console.error('Vault input not found');
	}

	const templateList = document.getElementById('template-list');
	if (templateList) {
		templateList.addEventListener('click', (event) => {
			if (event.target.tagName === 'LI') {
				const selectedTemplate = templates[event.target.dataset.index];
				if (selectedTemplate) {
					showTemplateEditor(selectedTemplate);
				}
			}
		});
	} else {
		console.error('Template list not found');
	}

	if (newTemplateBtn) {
		newTemplateBtn.addEventListener('click', () => {
			showTemplateEditor(null);
			const templateEditor = document.getElementById('template-editor');
			if (templateEditor) {
				templateEditor.style.display = 'block';
			}
		});
	} else {
		console.error('New template button not found');
	}

	initializeSettings();
});
