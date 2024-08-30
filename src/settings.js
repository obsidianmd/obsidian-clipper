import { createIcons, Trash2 } from 'lucide';

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input');
	const vaultList = document.getElementById('vault-list');
	const folderNameInput = document.getElementById('folder-name');
	const tagsInput = document.getElementById('tags');
	const templateSelect = document.getElementById('template-select');
	const newTemplateBtn = document.getElementById('new-template-btn');
	const deleteTemplateBtn = document.getElementById('delete-template-btn');
	const templateEditor = document.getElementById('template-editor');
	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name');
	const templateFields = document.getElementById('template-fields');
	const addFieldBtn = document.getElementById('add-field-btn');
	const saveTemplateBtn = document.getElementById('save-template-btn');
	const cancelTemplateBtn = document.getElementById('cancel-template-btn');

	let templates = [];
	let editingTemplateIndex = -1;

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
				{ name: 'tags', value: '{{tags}}' }
			],
			urlPatterns: []
		};
	}

	function loadTemplates() {
		chrome.storage.sync.get(['templates'], (data) => {
			templates = data.templates || [];
			if (templates.length === 0) {
				templates.push(createDefaultTemplate());
				chrome.storage.sync.set({ templates });
			}
			updateTemplateSelect();
			showTemplateEditor(templates[0]);
		});
	}

	function updateTemplateSelect() {
		templateSelect.innerHTML = '';
		templates.forEach((template, index) => {
			const option = document.createElement('option');
			option.value = template.name;
			option.textContent = template.name;
			templateSelect.appendChild(option);
			if (index === 0) {
				option.selected = true;
			}
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

		// Create or update folder name input
		createOrUpdateField('template-folder-name', 'Folder name', template ? template.folderName : 'Clippings/');

		// Create or update URL patterns textarea
		const urlPatternsTextarea = createOrUpdateField('url-patterns', 'URL patterns one per line', 
			template && template.urlPatterns ? template.urlPatterns.join('\n') : '', 'textarea');
		urlPatternsTextarea.placeholder = 'https://example.com/';

		if (template) {
			template.fields.forEach(field => addFieldToEditor(field.name, field.value));
		} else {
			addFieldToEditor(); // Add an empty field for new templates
		}
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

		// Initialize Lucide icon
		createIcons({
			icons: {
				Trash2
			}
		});
	}

	templateSelect.addEventListener('change', () => {
		const selectedTemplate = templates.find(t => t.name === templateSelect.value);
		if (selectedTemplate) {
			showTemplateEditor(selectedTemplate);
		}
	});

	newTemplateBtn.addEventListener('click', () => {
		showTemplateEditor(null);
		document.getElementById('template-editor').style.display = 'block';
	});

	addFieldBtn.addEventListener('click', () => {
		addFieldToEditor();
	});

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

			updateTemplateSelect();
			chrome.storage.sync.set({ templates }, () => {
				console.log('Template saved');
				showTemplateEditor(newTemplate);
			});
		}
	});

	deleteTemplateBtn.addEventListener('click', () => {
		if (editingTemplateIndex > 0) {
			templates.splice(editingTemplateIndex, 1);
			updateTemplateSelect();
			showTemplateEditor(templates[0]);
			chrome.storage.sync.set({ templates }, () => {
				console.log('Template deleted');
			});
		} else {
			alert("You cannot delete the Default template.");
		}
	});

	// Load initial data
	chrome.storage.sync.get(['vaults', 'folderName', 'tags'], (data) => {
		const vaults = data.vaults || [];
		folderNameInput.value = data.folderName || 'Clippings/';
		tagsInput.value = data.tags || 'clippings';
		vaults.forEach(vault => {
			const li = document.createElement('li');
			li.textContent = vault;
			vaultList.appendChild(li);
		});
	});

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
			updateTemplateSelect();
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
});