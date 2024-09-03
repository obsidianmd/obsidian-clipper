import { createIcons, Trash2, AlignLeft, Binary, List, Calendar, Clock, SquareCheckBig, GripVertical } from 'lucide';

const icons = {
	Trash2,
	AlignLeft,
	Binary,
	List,
	Calendar,
	Clock,
	SquareCheckBig,
	GripVertical
};

createIcons({ icons });

document.addEventListener('DOMContentLoaded', () => {
	const vaultInput = document.getElementById('vault-input');
	const vaultList = document.getElementById('vault-list');
	const newTemplateBtn = document.getElementById('new-template-btn');
	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name');
	const templateProperties = document.getElementById('template-properties');
	const addPropertyBtn = document.getElementById('add-property-btn');

	let templates = [];
	let editingTemplateIndex = -1;
	let vaults = [];

	function createDefaultTemplate() {
		return {
			name: 'Default',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings/',
			noteContentFormat: '{{content}}',
			properties: [
				{ name: 'title', value: '{{title}}', type: 'text' },
				{ name: 'source', value: '{{url}}', type: 'text' },
				{ name: 'author', value: '{{authorLink}}', type: 'text' },
				{ name: 'published', value: '{{published}}', type: 'date' },
				{ name: 'created', value: '{{today}}', type: 'date' },
				{ name: 'description', value: '{{description}}', type: 'text' },
				{ name: 'tags', value: 'clippings', type: 'multitext' }
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
			li.innerHTML = `
				<div class="drag-handle">
					<i data-lucide="grip-vertical"></i>
				</div>
				<span>${vault}</span>
				<button class="remove-vault-btn">Remove</button>
			`;
			li.dataset.index = index;
			li.draggable = true;
			li.addEventListener('dragstart', handleDragStart);
			li.addEventListener('dragover', handleDragOver);
			li.addEventListener('drop', handleDrop);
			li.addEventListener('dragend', handleDragEnd);
			const removeBtn = li.querySelector('.remove-vault-btn');
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				removeVault(index);
			});
			vaultList.appendChild(li);
		});
		createIcons({ icons });
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
		updateVaultList();
	}

	function saveGeneralSettings() {
		chrome.storage.sync.set({ vaults }, () => {
			console.log('General settings saved');
			updateVaultList();
		});
	}

	function loadTemplates() {
		chrome.storage.sync.get(['templates'], (data) => {
			
			templates = Array.isArray(data.templates) ? data.templates : [];

			// Remove any null or undefined templates
			templates = templates.filter(template => template != null);

			// Check if the Default template exists
			const defaultTemplateIndex = templates.findIndex(t => t && t.name === 'Default');

			if (defaultTemplateIndex === -1) {
				// If it doesn't exist, add it
				const defaultTemplate = createDefaultTemplate();
				templates.unshift(defaultTemplate);
			}

			if (templates.length === 0) {
				const defaultTemplate = createDefaultTemplate();
				templates.push(defaultTemplate);
			}

			if (defaultTemplateIndex === -1 || templates.length === 1) {
				chrome.storage.sync.set({ templates }, () => {
				});
			}

			updateTemplateList();
			if (templates.length > 0) {
				showTemplateEditor(templates[0]);
			} else {
				console.error('No templates available after processing');
			}
		});
	}

	function updateTemplateList() {
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
				li.dataset.index = index;
				li.draggable = true;
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
				li.addEventListener('dragstart', handleDragStart);
				li.addEventListener('dragover', handleDragOver);
				li.addEventListener('drop', handleDrop);
				li.addEventListener('dragend', handleDragEnd);
				const deleteBtn = li.querySelector('.delete-template-btn');
				if (deleteBtn) {
					deleteBtn.addEventListener('click', (e) => {
						e.stopPropagation();
						deleteTemplate(index);
					});
				}
				templateList.appendChild(li);
			} else {
				console.error('Invalid template at index', index, ':', template);
			}
		});
		createIcons({ icons });
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
		templateProperties.innerHTML = '';
		document.getElementById('template-path-name').value = 'Clippings/';
		document.getElementById('url-patterns').value = '';
		document.getElementById('template-editor').style.display = 'none';
	}

	function showTemplateEditor(template) {
		editingTemplateIndex = template ? templates.findIndex(t => t.name === template.name) : -1;
		templateEditorTitle.textContent = template ? 'Edit template' : 'New template';
		templateName.value = template ? template.name : '';
		templateProperties.innerHTML = '';

		const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn');
		if (template && template.name === 'Default') {
			resetDefaultTemplateBtn.style.display = 'inline-block';
		} else {
			resetDefaultTemplateBtn.style.display = 'none';
		}

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
			template.properties.forEach(property => addPropertyToEditor(property.name, property.value, property.type));
		}

		const urlPatternsTextarea = document.getElementById('url-patterns');
		urlPatternsTextarea.value = template && template.urlPatterns ? template.urlPatterns.join('\n') : '';

		document.getElementById('template-editor').style.display = 'block';

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

	function addPropertyToEditor(name = '', value = '', type = 'text') {
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
		propertyDiv.dataset.index = templateProperties.children.length;
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

		templateProperties.addEventListener('click', (event) => {
			if (event.target.classList.contains('remove-property-btn') || event.target.closest('.remove-property-btn')) {
				autoSave();
			}
		});

		if (addPropertyBtn) {
			addPropertyBtn.addEventListener('click', () => {
				addPropertyToEditor();
				autoSave();
			});
		} else {
			console.error('Add property button not found');
		}
	}

	function saveTemplateSettings() {
		const name = templateName.value.trim();
		const pathInput = document.getElementById('template-path-name');
		const path = pathInput ? pathInput.value.trim() : '';
		
		if (name) {
			const properties = Array.from(templateProperties.children)
				.filter(property => property.querySelector('.property-name'))
				.map(property => ({
					name: property.querySelector('.property-name').value.trim(),
					value: property.querySelector('.property-value').value.trim(),
					type: property.querySelector('.property-type').value
				}))
				.filter(property => property.name);
	
			const urlPatternsTextarea = document.getElementById('url-patterns');
			const urlPatterns = urlPatternsTextarea ? urlPatternsTextarea.value
				.split('\n')
				.map(pattern => pattern.trim())
				.filter(pattern => pattern !== '') : [];
	
			const behavior = document.getElementById('template-behavior').value;
			const specificNoteName = document.getElementById('specific-note-name').value.trim();
			const dailyNoteFormat = document.getElementById('daily-note-format').value.trim();
			const noteNameFormat = document.getElementById('note-name-format').value.trim();
			const noteContentFormat = document.getElementById('note-content-format').value.trim();

			const newTemplate = { 
				name, 
				behavior,
				specificNoteName,
				dailyNoteFormat,
				noteNameFormat,
				path, 
				urlPatterns,
				properties,
				noteContentFormat
			};
	
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

		const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn');
		resetDefaultTemplateBtn.addEventListener('click', resetDefaultTemplate);

		const exportTemplateBtn = document.getElementById('export-template-btn');
		exportTemplateBtn.addEventListener('click', exportTemplate);

		const importTemplateBtn = document.getElementById('import-template-btn');
		importTemplateBtn.addEventListener('click', importTemplate);

		createIcons({ icons });
	}

	function exportTemplate() {
		if (editingTemplateIndex === -1) {
			alert('Please select a template to export.');
			return;
		}

		const template = templates[editingTemplateIndex];
		const noteName = `${template.name}.obsidian-clipper.json`;

		const orderedTemplate = {
			name: template.name,
			behavior: template.behavior,
			noteNameFormat: template.noteNameFormat,
			path: template.path,
			noteContentFormat: template.noteContentFormat,
			properties: template.properties,
			urlPatterns: template.urlPatterns,
		};

		const jsonContent = JSON.stringify(orderedTemplate, null, 2);

		const blob = new Blob([jsonContent], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = noteName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function importTemplate() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';

		input.onchange = (event) => {
			const file = event.target.files[0];
			if (file) {
				const reader = new FileReader();
				reader.onload = (e) => {
					try {
						const importedTemplate = JSON.parse(e.target.result);
						if (validateImportedTemplate(importedTemplate)) {
							// Check if a template with the same name already exists
							const existingIndex = templates.findIndex(t => t.name === importedTemplate.name);
							if (existingIndex !== -1) {
								if (confirm(`A template named "${importedTemplate.name}" already exists. Do you want to replace it?`)) {
									templates[existingIndex] = importedTemplate;
								} else {
									// Append a number to the template name to make it unique
									let newName = importedTemplate.name;
									let counter = 1;
									while (templates.some(t => t.name === newName)) {
										newName = `${importedTemplate.name} (${counter})`;
										counter++;
									}
									importedTemplate.name = newName;
									templates.push(importedTemplate);
								}
							} else {
								templates.push(importedTemplate);
							}
							saveTemplateSettings();
							updateTemplateList();
							showTemplateEditor(importedTemplate);
							alert('Template imported successfully!');
						} else {
							alert('Invalid template file. Please check the file format and try again.');
						}
					} catch (error) {
						console.error('Error parsing imported template:', error);
						alert('Error importing template. Please check the file and try again.');
					}
				};
				reader.readAsText(file);
			}
		};

		input.click();
	}

	function validateImportedTemplate(template) {
		const requiredFields = ['name', 'behavior', 'path', 'properties', 'noteContentFormat'];
		const validTypes = ['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'];
		return requiredFields.every(field => template.hasOwnProperty(field)) &&
			Array.isArray(template.properties) &&
			template.properties.every(prop => 
				prop.hasOwnProperty('name') && 
				prop.hasOwnProperty('value') && 
				prop.hasOwnProperty('type') &&
				validTypes.includes(prop.type)
			);
	}

	function handleDragStart(e) {
		e.dataTransfer.setData('text/plain', e.target.dataset.index);
		e.target.classList.add('dragging');
	}

	function handleDragOver(e) {
		e.preventDefault();
		const draggingElement = document.querySelector('.dragging');
		if (draggingElement && e.target.closest('[draggable]') && e.target.closest('[draggable]') !== draggingElement) {
			const container = e.target.closest('ul, #template-properties');
			const children = Array.from(container.children);
			const draggedOverItem = e.target.closest('[draggable]');
			const draggedOverIndex = children.indexOf(draggedOverItem);
			const draggingIndex = children.indexOf(draggingElement);
			
			if (draggedOverIndex < draggingIndex) {
				container.insertBefore(draggingElement, draggedOverItem);
			} else {
				container.insertBefore(draggingElement, draggedOverItem.nextSibling);
			}
		}
	}

	function handleDrop(e) {
		e.preventDefault();
		const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
		const list = e.target.closest('ul, #template-properties');
		const items = Array.from(list.children);
		const toIndex = items.indexOf(document.querySelector('.dragging'));
		
		if (list.id === 'vault-list') {
			moveItem(vaults, fromIndex, toIndex);
			saveGeneralSettings();
		} else if (list.id === 'template-list') {
			moveItem(templates, fromIndex, toIndex);
			saveTemplateSettings();
		} else if (list.id === 'template-properties') {
			const template = templates[editingTemplateIndex];
			moveItem(template.properties, fromIndex, toIndex);
			saveTemplateSettings();
		}
		
		updateUI(list.id);
	}

	function handleDragEnd(e) {
		e.target.classList.remove('dragging');
	}

	function moveItem(array, fromIndex, toIndex) {
		if (fromIndex === toIndex) return;
		const item = array.splice(fromIndex, 1)[0];
		array.splice(toIndex, 0, item);
	}

	function updateUI(listId) {
		switch (listId) {
			case 'vault-list':
				updateVaultList();
				break;
			case 'template-list':
				updateTemplateList();
				break;
			case 'template-properties':
				showTemplateEditor(templates[editingTemplateIndex]);
				break;
		}
	}

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
	}

	initializeSettings();
});
