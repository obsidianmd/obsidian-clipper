import { createIcons } from 'lucide';
import { icons } from './icons.js';

let templates = [];
let editingTemplateIndex = -1;

export function loadTemplates() {
	chrome.storage.sync.get(['templates'], (data) => {
		templates = Array.isArray(data.templates) ? data.templates : [];

		// Remove any null or undefined templates
		templates = templates.filter(template => template != null);

		templates = templates.map(template => {
			if (!template.id) {
				template.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
			}
			return template;
		});

		if (templates.length === 0) {
			templates.push(createDefaultTemplate());
		}

		chrome.storage.sync.set({ templates }, () => {
			updateTemplateList();
			if (templates.length > 0) {
				showTemplateEditor(templates[0]);
			} else {
				console.error('No templates available.');
			}
		});
	});
}

export function updateTemplateList() {
	const templateList = document.getElementById('template-list');
	templateList.innerHTML = '';
	templates.forEach((template, index) => {
		if (template && template.name) {
			const li = document.createElement('li');
			li.innerHTML = `
				<div class="drag-handle">
					<i data-lucide="grip-vertical"></i>
				</div>
				<span class="template-name">${template.name}</span>
				<button type="button" class="delete-template-btn clickable-icon" aria-label="Delete template">
					<i data-lucide="trash-2"></i>
				</button>
			`;
			li.dataset.id = template.id;
			li.dataset.index = index;
			li.draggable = true;
			li.addEventListener('click', (e) => {
				if (!e.target.closest('.delete-template-btn')) {
					showTemplateEditor(template);
				}
			});
			const deleteBtn = li.querySelector('.delete-template-btn');
			if (deleteBtn) {
				deleteBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					deleteTemplate(template.id);
				});
			}
			if (index === editingTemplateIndex) {
				li.classList.add('active');
			}
			templateList.appendChild(li);
		} else {
			console.error('Invalid template at index', index, ':', template);
		}
	});
	createIcons({ icons });
}

export function showTemplateEditor(template) {
	if (template) {
		editingTemplateIndex = templates.findIndex(t => t.id === template.id);
	} else {
		const newTemplate = {
			id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
			name: 'New template',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings/',
			noteContentFormat: '{{content}}',
			properties: [],
			urlPatterns: []
		};
		templates.push(newTemplate);
		editingTemplateIndex = templates.length - 1;
		template = newTemplate;
	}

	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name');
	const templateProperties = document.getElementById('template-properties');

	templateEditorTitle.textContent = template ? 'Edit template' : 'New template';
	templateName.value = template ? template.name : '';
	templateProperties.innerHTML = '';

	const pathInput = document.getElementById('template-path-name');
	pathInput.value = template ? template.path : 'Clippings/';

	const behaviorSelect = document.getElementById('template-behavior');
	const specificNoteContainer = document.getElementById('specific-note-container');
	const dailyNoteFormatContainer = document.getElementById('daily-note-format-container');
	const noteNameFormatContainer = document.getElementById('note-name-format-container');
	const propertiesContainer = document.getElementById('properties-container');
	const propertiesWarning = document.getElementById('properties-warning');
	
	behaviorSelect.value = template ? (template.behavior || 'create') : 'create';
	document.getElementById('specific-note-name').value = template ? (template.specificNoteName || '') : '';
	document.getElementById('daily-note-format').value = template ? (template.dailyNoteFormat || 'YYYY-MM-DD') : 'YYYY-MM-DD';
	document.getElementById('note-name-format').value = template ? (template.noteNameFormat || '{{title}}') : '{{title}}';

	const noteContentFormat = document.getElementById('note-content-format');
	noteContentFormat.value = template ? (template.noteContentFormat || '{{content}}') : '{{content}}';

	updateBehaviorFields();

	behaviorSelect.addEventListener('change', updateBehaviorFields);

	function updateBehaviorFields() {
		const selectedBehavior = behaviorSelect.value;
		specificNoteContainer.style.display = selectedBehavior === 'append-specific' ? 'block' : 'none';
		dailyNoteFormatContainer.style.display = selectedBehavior === 'append-daily' ? 'block' : 'none';
		noteNameFormatContainer.style.display = selectedBehavior === 'create' ? 'block' : 'none';
		
		if (selectedBehavior === 'append-specific' || selectedBehavior === 'append-daily') {
			propertiesContainer.style.display = 'none';
			propertiesWarning.style.display = 'block';
		} else {
			propertiesContainer.style.display = 'block';
			propertiesWarning.style.display = 'none';
		}
	}

	if (template && Array.isArray(template.properties)) {
		template.properties.forEach(property => addPropertyToEditor(property.name, property.value, property.type, property.id));
	}

	const urlPatternsTextarea = document.getElementById('url-patterns');
	urlPatternsTextarea.value = template && template.urlPatterns ? template.urlPatterns.join('\n') : '';

	document.getElementById('template-editor').style.display = 'block';

	document.querySelectorAll('.sidebar li[data-section]').forEach(item => item.classList.remove('active'));
	document.querySelectorAll('#template-list li').forEach(item => item.classList.remove('active'));
	if (editingTemplateIndex !== -1) {
		const activeTemplateItem = document.querySelector(`#template-list li[data-id="${templates[editingTemplateIndex].id}"]`);
		if (activeTemplateItem) {
			activeTemplateItem.classList.add('active');
		}
	}

	document.getElementById('templates-section').classList.add('active');
	document.getElementById('general-section').classList.remove('active');

	updateTemplateFromForm();
	saveTemplateSettings().then(() => {
		updateTemplateList();

		if (!template.id) {
			const templateNameField = document.getElementById('template-name');
			if (templateNameField) {
				templateNameField.focus();
				templateNameField.select();
			}
		}
	}).catch(error => {
		console.error('Failed to save new template:', error);
	});
}

export function saveTemplateSettings() {
	return new Promise((resolve, reject) => {
		chrome.storage.sync.set({ templates }, () => {
			if (chrome.runtime.lastError) {
				console.error('Error saving templates:', chrome.runtime.lastError);
				reject(chrome.runtime.lastError);
			} else {
				console.log('Template settings saved');
				resolve();
			}
		});
	});
}

export function createDefaultTemplate() {
	return {
		id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
		name: 'Default',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: 'Clippings/',
		noteContentFormat: '{{content}}',
		properties: [
			{ name: 'title', value: '{{title}}', type: 'text' },
			{ name: 'source', value: '{{url}}', type: 'text' },
			{ name: 'author', value: '{{author}}', type: 'text' },
			{ name: 'published', value: '{{published}}', type: 'date' },
			{ name: 'created', value: '{{today}}', type: 'date' },
			{ name: 'description', value: '{{description}}', type: 'text' },
			{ name: 'tags', value: 'clippings', type: 'multitext' }
		],
		urlPatterns: []
	};
}

export function deleteTemplate(templateId) {
	const index = templates.findIndex(t => t.id === templateId);
	if (index !== -1) {
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
	}
}

function clearTemplateEditor() {
	editingTemplateIndex = -1;
	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name');
	const templateProperties = document.getElementById('template-properties');
	templateEditorTitle.textContent = 'New template';
	templateName.value = '';
	templateProperties.innerHTML = '';
	document.getElementById('template-path-name').value = 'Clippings/';
	document.getElementById('url-patterns').value = '';
	document.getElementById('template-editor').style.display = 'none';
}

export function addPropertyToEditor(name = '', value = '', type = 'text', id = null) {
	const templateProperties = document.getElementById('template-properties');
	const propertyDiv = document.createElement('div');
	propertyDiv.className = 'property-editor';
	propertyDiv.draggable = true;
	propertyDiv.innerHTML = `
		<div class="drag-handle">
			<i data-lucide="grip-vertical"></i>
		</div>
		<div class="property-select">
			<div class="property-selected" data-value="${type}">
				<i data-lucide="${getIconForType(type)}"></i>
			</div>
			<select class="property-type">
				<option value="text">Text</option>
				<option value="multitext">List</option>
				<option value="number">Number</option>
				<option value="checkbox">Checkbox</option>
				<option value="date">Date</option>
				<option value="datetime">Date & time</option>
			</select>
		</div>
		<input type="text" class="property-name" value="${name}" placeholder="Property name">
		<input type="text" class="property-value" value="${value}" placeholder="Property value">
		<button type="button" class="remove-property-btn clickable-icon" aria-label="Remove property">
			<i data-lucide="trash-2"></i>
		</button>
	`;
	propertyDiv.dataset.id = id || Date.now().toString() + Math.random().toString(36).substr(2, 9);
	templateProperties.appendChild(propertyDiv);

	const propertySelect = propertyDiv.querySelector('.property-select');
	const propertySelected = propertySelect.querySelector('.property-selected');
	const hiddenSelect = propertySelect.querySelector('select');

	hiddenSelect.value = type;

	hiddenSelect.addEventListener('change', function() {
		updateSelectedOption(this.value, propertySelected);
	});

	propertyDiv.querySelector('.remove-property-btn').addEventListener('click', () => {
		templateProperties.removeChild(propertyDiv);
	});

	propertyDiv.addEventListener('dragstart', handleDragStart);
	propertyDiv.addEventListener('dragover', handleDragOver);
	propertyDiv.addEventListener('drop', handleDrop);
	propertyDiv.addEventListener('dragend', handleDragEnd);

	updateSelectedOption(type, propertySelected);

	createIcons({ icons, root: propertyDiv });
}

function updateSelectedOption(value, propertySelected) {
	const iconName = getIconForType(value);
	propertySelected.innerHTML = `<i data-lucide="${iconName}"></i>`;
	propertySelected.setAttribute('data-value', value);
	createIcons({ icons, root: propertySelected });
}

function getIconForType(type) {
	const iconMap = {
		text: 'align-left',
		multitext: 'list',
		number: 'binary',
		checkbox: 'square-check-big',
		date: 'calendar',
		datetime: 'clock'
	};
	return iconMap[type] || 'align-left';
}

export function updateTemplateFromForm() {
	if (editingTemplateIndex === -1) return;

	const template = templates[editingTemplateIndex];
	template.name = document.getElementById('template-name').value;
	template.behavior = document.getElementById('template-behavior').value;
	template.path = document.getElementById('template-path-name').value;
	template.noteNameFormat = document.getElementById('note-name-format').value;
	template.specificNoteName = document.getElementById('specific-note-name').value;
	template.dailyNoteFormat = document.getElementById('daily-note-format').value;
	template.noteContentFormat = document.getElementById('note-content-format').value;

	template.properties = Array.from(document.querySelectorAll('#template-properties .property-editor')).map(prop => ({
		id: prop.dataset.id,
		name: prop.querySelector('.property-name').value,
		value: prop.querySelector('.property-value').value,
		type: prop.querySelector('.property-select .property-selected').getAttribute('data-value')
	}));

	template.urlPatterns = document.getElementById('url-patterns').value.split('\n').filter(Boolean);
}