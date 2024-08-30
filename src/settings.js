import { createIcons, Trash2 } from 'lucide';

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input');
	const vaultList = document.getElementById('vault-list');
	const folderNameInput = document.getElementById('folder-name');
	const templateSelect = document.getElementById('template-select');
	const newTemplateBtn = document.getElementById('new-template-btn');
	const deleteTemplateBtn = document.getElementById('delete-template-btn');
	const templateEditor = document.getElementById('template-editor');
	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name');
	const templateFields = document.getElementById('template-fields');
	const addFieldBtn = document.getElementById('add-field-btn');
	const saveTemplateBtn = document.getElementById('save-template-btn');

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

	vaultInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			addVault(vaultInput.value.trim());
			vaultInput.value = '';
		}
	});

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
			li.textContent = template.name;
			li.dataset.index = index;
			if (index === 0) {
				li.classList.add('active');
			}
			li.addEventListener('click', () => {
				document.querySelectorAll('#template-list li').forEach(item => item.classList.remove('active'));
				li.classList.add('active');
				showTemplateEditor(template);
			});
			templateList.appendChild(li);
		});
	}

	function showTemplateEditor(template) {
		editingTemplateIndex = template ? templates.findIndex(t => t.name === template.name) : -1;
		templateEditorTitle.textContent = template ? 'Edit template' : 'New template';
		templateName.value = template ? template.name : '';
		templateFields.innerHTML = '';

		// Function to create or update an input field
		function createOrUpdateField(id, labelText, value, type = 'input') {
			let field = document.getElementById(id);
			let label = document.querySelector(`label[for="${id}"]`);

			if (!field) {
				if (!label) {
					label = document.createElement('label');
					label.htmlFor = id;
					label.textContent = labelText;
					templateEditor.insertBefore(label, templateFields);
				}

				if (type === 'input') {
					field = document.createElement('input');
					field.type = 'text';
				} else if (type === 'textarea') {
					field = document.createElement('textarea');
				}
				field.id = id;
				templateEditor.insertBefore(field, templateFields);
			}

			field.value = value;
			return field;
		}

		createOrUpdateField('template-folder-name', 'Folder name', template ? template.folderName : 'Clippings/');

		const existingPropertiesLabel = templateEditor.querySelector('#properties-label');
		if (existingPropertiesLabel) {
			existingPropertiesLabel.remove();
		}

		// Add "Properties" label
		const propertiesLabel = document.createElement('h4');
		propertiesLabel.id = 'properties-label';
		propertiesLabel.textContent = 'Properties';
		templateEditor.insertBefore(propertiesLabel, templateFields);

		if (template) {
			template.fields.forEach(field => addFieldToEditor(field.name, field.value));
		} else {
			addFieldToEditor();
		}

		const addFieldBtn = document.getElementById('add-field-btn');
		const urlPatternsTextarea = createOrUpdateField('url-patterns', 'URL patterns (one per line)', 
			template && template.urlPatterns ? template.urlPatterns.join('\n') : '', 'textarea');
		urlPatternsTextarea.placeholder = 'https://example.com/';
		templateEditor.insertBefore(urlPatternsTextarea, addFieldBtn.nextSibling);
		templateEditor.insertBefore(document.querySelector('label[for="url-patterns"]'), urlPatternsTextarea);
		
		// Make sure the template editor is visible
		document.getElementById('template-editor').style.display = 'block';

		// Update the active state of the template list items
		const templateListItems = document.querySelectorAll('#template-list li');
		templateListItems.forEach(item => {
			item.classList.remove('active');
			if (parseInt(item.dataset.index) === editingTemplateIndex) {
				item.classList.add('active');
			}
		});

		// Make sure the templates section is visible
		document.getElementById('templates-section').classList.add('active');
		document.getElementById('general-section').classList.remove('active');
		document.querySelector('.sidebar li[data-section="general"]').classList.remove('active');
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

	document.getElementById('template-list').addEventListener('click', (event) => {
		if (event.target.tagName === 'LI') {
			const selectedTemplate = templates[event.target.dataset.index];
			if (selectedTemplate) {
				showTemplateEditor(selectedTemplate);
			}
		}
	});

	newTemplateBtn.addEventListener('click', () => {
		showTemplateEditor(null);
		document.getElementById('template-editor').style.display = 'block';
	});

	addFieldBtn.addEventListener('click', () => {
		addFieldToEditor();
	});

	function saveTemplateSettings() {
		chrome.storage.sync.set({ templates }, () => {
			console.log('Template settings saved');
			updateTemplateList();
		});
	}

	saveTemplateBtn.addEventListener('click', () => {
		const name = templateName.value.trim();
		const folderName = document.getElementById('template-folder-name').value.trim();
		if (name) {
			const fields = Array.from(templateFields.children)
				.filter(field => field.querySelector('.field-name'))
				.map(field => ({
					name: field.querySelector('.field-name').value.trim(),
					value: field.querySelector('.field-value').value.trim()
				}))
				.filter(field => field.name);

			const urlPatterns = document.getElementById('url-patterns').value
				.split('\n')
				.map(pattern => pattern.trim())
				.filter(pattern => pattern !== '');

			const newTemplate = { name, folderName, fields, urlPatterns };

			if (editingTemplateIndex === -1) {
				templates.push(newTemplate);
			} else {
				templates[editingTemplateIndex] = newTemplate;
			}

			saveTemplateSettings();
			showTemplateEditor(newTemplate);
		}
	});

	deleteTemplateBtn.addEventListener('click', () => {
		if (editingTemplateIndex > 0) {
			templates.splice(editingTemplateIndex, 1);
			saveTemplateSettings();
			showTemplateEditor(templates[0]);
		} else {
			alert("You cannot delete the Default template.");
		}
	});

	// Initialize
	loadGeneralSettings();
	loadTemplates();

	// Add this function to reset the Default template
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

	// Add a button in the HTML to reset the Default template
	const resetDefaultBtn = document.createElement('button');
	resetDefaultBtn.textContent = 'Reset default template';
	resetDefaultBtn.addEventListener('click', resetDefaultTemplate);
	document.querySelector('.settings-section').appendChild(resetDefaultBtn);

	// Initialize all Lucide icons
	createIcons({
		icons: {
			Trash2
		}
	});

	// Add this function to handle sidebar navigation
	function initializeSidebar() {
		const sidebarItems = document.querySelectorAll('.sidebar li[data-section]');
		const sections = document.querySelectorAll('.settings-section');

		sidebarItems.forEach(item => {
			item.addEventListener('click', () => {
				const sectionId = item.dataset.section;
				
				// Update active states
				sidebarItems.forEach(i => i.classList.remove('active'));
				item.classList.add('active');
				
				sections.forEach(section => {
					section.classList.remove('active');
					if (section.id === `${sectionId}-section`) {
						section.classList.add('active');
					}
				});
			});
		});
	}

	// Call this function after loading settings
	function initializeSettings() {
		loadGeneralSettings();
		loadTemplates();
		initializeSidebar();
	}

	// Replace the separate loadGeneralSettings() and loadTemplates() calls with:
	initializeSettings();
});
