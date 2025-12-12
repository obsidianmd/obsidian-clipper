import { Template, Property } from '../types/types';
import { deleteTemplate, templates, editingTemplateIndex, saveTemplateSettings, setEditingTemplateIndex, loadTemplates } from './template-manager';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { escapeValue, unescapeValue } from '../utils/string-utils';
import { generalSettings } from '../utils/storage-utils';
import { updateUrl } from '../utils/routing';
import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { updatePromptContextVisibility } from './interpreter-settings';
import { showSettingsSection } from './settings-section-ui';
import { updatePropertyType } from './property-types-manager';
import { getMessage } from '../utils/i18n';
let hasUnsavedChanges = false;

export function resetUnsavedChanges(): void {
	hasUnsavedChanges = false;
}

export function updateTemplateList(loadedTemplates?: Template[]): void {
	const templateList = document.getElementById('template-list');
	if (!templateList) {
		console.error('Template list element not found');
		return;
	}
	
	const templatesToUse = loadedTemplates || templates;
	
	// Filter out null or undefined templates
	const validTemplates = templatesToUse.filter((template): template is Template => 
		template != null && typeof template === 'object' && 'id' in template && 'name' in template
	);

	// Clear existing templates
	templateList.textContent = '';
	validTemplates.forEach((template, index) => {
		const li = document.createElement('li');
		
		const dragHandle = createElementWithClass('div', 'drag-handle');
		dragHandle.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'grip-vertical' }));
		li.appendChild(dragHandle);

		const templateName = createElementWithClass('span', 'template-name');
		templateName.textContent = template.name;
		li.appendChild(templateName);

		const deleteBtn = createElementWithClass('button', 'delete-template-btn clickable-icon');
		deleteBtn.setAttribute('type', 'button');
		deleteBtn.setAttribute('aria-label', 'Delete template');
		deleteBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		li.appendChild(deleteBtn);

		li.dataset.id = template.id;
		li.dataset.index = index.toString();
		li.draggable = true;

		let touchStartTime: number;
		let touchStartY: number;

		li.addEventListener('touchstart', (e) => {
			touchStartTime = Date.now();
			touchStartY = e.touches[0].clientY;
		});

		li.addEventListener('touchend', (e) => {
			const touchEndY = e.changedTouches[0].clientY;
			const touchDuration = Date.now() - touchStartTime;
			const touchDistance = Math.abs(touchEndY - touchStartY);

			if (touchDuration < 300 && touchDistance < 10) {
				const target = e.target as HTMLElement;
				if (!target.closest('.delete-template-btn')) {
					e.preventDefault();
					showTemplateEditor(template);
					// Add these lines to close the sidebar and deactivate the hamburger menu
					const settingsContainer = document.getElementById('settings');
					const hamburgerMenu = document.getElementById('hamburger-menu');
					if (settingsContainer) {
						settingsContainer.classList.remove('sidebar-open');
					}
					if (hamburgerMenu) {
						hamburgerMenu.classList.remove('is-active');
					}
				}
			}
		});

		// Keep the click event for non-touch devices
		li.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			if (!target.closest('.delete-template-btn')) {
				showTemplateEditor(template);
			}
		});

		deleteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			deleteTemplateFromList(template.id);
		});
		
		if (index === editingTemplateIndex) {
			li.classList.add('active');
		}
		templateList.appendChild(li);
	});

	// If any invalid templates were found and removed, save the changes
	if (validTemplates.length !== templatesToUse.length) {
		saveTemplateSettings();
	}

	initializeIcons(templateList);
}

// Rename this function to make it clear it's for deleting from the list
async function deleteTemplateFromList(templateId: string): Promise<void> {
	const template = templates.find(t => t.id === templateId);
	if (!template) {
		console.error('Template not found:', templateId);
		return;
	}

	if (confirm(getMessage('confirmDeleteTemplate', [template.name]))) {
		const success = await deleteTemplate(templateId);
		if (success) {
			const updatedTemplates = await loadTemplates();
			updateTemplateList(updatedTemplates);
			if (updatedTemplates.length > 0) {
				showTemplateEditor(updatedTemplates[0]);
			} else {
				showSettingsSection('general');
			}
		} else {
			alert(getMessage('failedToDeleteTemplate'));
		}
	}
}

export function showTemplateEditor(template: Template | null): void {
	let editingTemplate: Template;

	if (!template) {
		const newTemplateName = getUniqueTemplateName(getMessage('newTemplate'));
		editingTemplate = {
			id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
			name: newTemplateName,
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings',
			noteContentFormat: '{{content}}',
			properties: [],
			triggers: [],
			context: ''
		};
		templates.unshift(editingTemplate);
		setEditingTemplateIndex(0);
		saveTemplateSettings().then(() => {
			updateTemplateList();
		}).catch(error => {
			console.error('Failed to save new template:', error);
		});
	} else {
		editingTemplate = template;
		setEditingTemplateIndex(templates.findIndex(t => t.id === editingTemplate.id));
	}

	// Ensure properties is always an array
	if (!editingTemplate.properties) {
		editingTemplate.properties = [];
	}

	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name') as HTMLInputElement;
	const templateProperties = document.getElementById('template-properties');

	if (templateEditorTitle) templateEditorTitle.textContent = getMessage('editTemplate');
	if (templateName) templateName.value = editingTemplate.name;
	if (templateProperties) templateProperties.textContent = '';

	const pathInput = document.getElementById('template-path-name') as HTMLInputElement;
	if (pathInput) pathInput.value = editingTemplate.path || '';

	const behaviorSelect = document.getElementById('template-behavior') as HTMLSelectElement;
	if (behaviorSelect) behaviorSelect.value = editingTemplate.behavior || 'create';
	
	const noteNameFormat = document.getElementById('note-name-format') as HTMLInputElement;
	if (noteNameFormat) {
		noteNameFormat.value = editingTemplate.noteNameFormat || '{{title}}';
	}

	const noteContentFormat = document.getElementById('note-content-format') as HTMLTextAreaElement;
	if (noteContentFormat) noteContentFormat.value = editingTemplate.noteContentFormat || '';

	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;
	if (promptContextTextarea) promptContextTextarea.value = editingTemplate.context || '';

	updateBehaviorFields();

	if (behaviorSelect) {
		behaviorSelect.addEventListener('change', updateBehaviorFields);
	}

	refreshPropertyNameSuggestions();

	if (editingTemplate && Array.isArray(editingTemplate.properties)) {
		editingTemplate.properties.forEach(property => addPropertyToEditor(property.name, property.value, property.id));
	}

	const triggersTextarea = document.getElementById('url-patterns') as HTMLTextAreaElement;
	if (triggersTextarea) triggersTextarea.value = editingTemplate && editingTemplate.triggers ? editingTemplate.triggers.join('\n') : '';

	showSettingsSection('templates', editingTemplate.id);

	if (!editingTemplate.id) {
		const templateNameField = document.getElementById('template-name') as HTMLInputElement;
		if (templateNameField) {
			templateNameField.focus();
			templateNameField.select();
		}
	}

	resetUnsavedChanges();

	if (templateName) {
		templateName.addEventListener('input', () => {
			if (editingTemplateIndex !== -1 && templates[editingTemplateIndex]) {
				templates[editingTemplateIndex].name = templateName.value;
				updateTemplateList();
			}
		});
	}

	const vaultSelect = document.getElementById('template-vault') as HTMLSelectElement;
	if (vaultSelect) {
		// Clear existing vault options
		vaultSelect.textContent = '';
		const lastUsedOption = document.createElement('option');
		lastUsedOption.value = '';
		lastUsedOption.textContent = getMessage('lastUsed');
		vaultSelect.appendChild(lastUsedOption);
		generalSettings.vaults.forEach(vault => {
			const option = document.createElement('option');
			option.value = vault;
			option.textContent = vault;
			vaultSelect.appendChild(option);
		});
		vaultSelect.value = editingTemplate.vault || '';
	}

	updateUrl('templates', editingTemplate.id);
	updatePromptContextVisibility();
}

function updateBehaviorFields(): void {
	const behaviorSelect = document.getElementById('template-behavior') as HTMLSelectElement;
	const noteNameFormatContainer = document.getElementById('note-name-format-container');
	const pathContainer = document.getElementById('path-name-container');
	const noteNameFormat = document.getElementById('note-name-format') as HTMLInputElement;
	const behaviorWarningContainer = document.getElementById('behavior-warning-container');

	if (behaviorSelect) {
		const selectedBehavior = behaviorSelect.value;
		const isDailyNote = selectedBehavior === 'append-daily' || selectedBehavior === 'prepend-daily';
		const needsWarning = selectedBehavior !== 'create' && selectedBehavior !== 'overwrite';

		if (needsWarning) {
			if (behaviorWarningContainer) behaviorWarningContainer.style.display = 'flex';
		} else {
			if (behaviorWarningContainer) behaviorWarningContainer.style.display = 'none';
		}

		if (noteNameFormatContainer) noteNameFormatContainer.style.display = isDailyNote ? 'none' : 'block';
		if (pathContainer) pathContainer.style.display = isDailyNote ? 'none' : 'block';

		if (noteNameFormat) {
			noteNameFormat.required = !isDailyNote;
			switch (selectedBehavior) {
				case 'append-specific':
				case 'prepend-specific':
				case 'overwrite':
					noteNameFormat.placeholder = getMessage('specificNoteName');
					break;
				case 'append-daily':
				case 'prepend-daily':
					noteNameFormat.placeholder = getMessage('dailyNoteFormat');
					break;
				default:
					noteNameFormat.placeholder = getMessage('noteNameFormat');
			}
		}
	}
}

export function addPropertyToEditor(name: string = '', value: string = '', id: string | null = null): HTMLElement {
	const templateProperties = document.getElementById('template-properties');
	if (!templateProperties) {
		console.error('Template properties container not found');
		// Return a dummy element to satisfy the return type
		return document.createElement('div');
	}

	const propertyId = id || Date.now().toString() + Math.random().toString(36).slice(2, 11);
	const propertyDiv = createElementWithClass('div', 'property-editor');
	propertyDiv.dataset.id = propertyId;

	const dragHandle = createElementWithClass('div', 'drag-handle');
	dragHandle.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'grip-vertical' }));
	propertyDiv.appendChild(dragHandle);

	const propertySelectDiv = createElementWithClass('div', 'property-select');
	const propertySelectedDiv = createElementWithClass('div', 'property-selected');
	const propertyType = generalSettings.propertyTypes.find(p => p.name === name)?.type || 'text';
	propertySelectedDiv.dataset.value = propertyType;
	propertySelectedDiv.appendChild(createElementWithHTML('i', '', { 'data-lucide': getPropertyTypeIcon(propertyType) }));
	propertySelectDiv.appendChild(propertySelectedDiv);

	const select = document.createElement('select');
	select.className = 'property-type';
	select.id = `${propertyId}-type`;
	['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'].forEach(optionValue => {
		const option = document.createElement('option');
		option.value = optionValue;
		const messageKey = `propertyType${optionValue.charAt(0).toUpperCase() + optionValue.slice(1)}`;
		option.textContent = getMessage(messageKey);
		select.appendChild(option);
	});
	select.value = propertyType;
	propertySelectDiv.appendChild(select);
	propertyDiv.appendChild(propertySelectDiv);

	const nameInput = createElementWithHTML('input', '', {
		type: 'text',
		class: 'property-name',
		id: `${propertyId}-name`,
		value: name,
		placeholder: getMessage('propertyName'),
		autocapitalize: 'off',
		autocomplete: 'off',
		list: 'property-name-suggestions'
	});
	propertyDiv.appendChild(nameInput);

	// Create datalist for autocomplete if it doesn't exist
	let datalist = document.getElementById('property-name-suggestions');
	if (!datalist) {
		datalist = document.createElement('datalist');
		datalist.id = 'property-name-suggestions';
		document.body.appendChild(datalist);
	}

	// Populate datalist with existing property types
	updatePropertyNameSuggestions();

	const valueInput = createElementWithHTML('input', '', {
		type: 'text',
		class: 'property-value',
		id: `${propertyId}-value`,
		value: unescapeValue(value),
		placeholder: getMessage('propertyValue')
	}) as HTMLInputElement;
	propertyDiv.appendChild(valueInput);

	const removeBtn = createElementWithClass('button', 'remove-property-btn clickable-icon');
	removeBtn.setAttribute('type', 'button');
	removeBtn.setAttribute('aria-label', getMessage('removeProperty'));
	removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
	propertyDiv.appendChild(removeBtn);

	templateProperties.appendChild(propertyDiv);

	propertyDiv.addEventListener('mousedown', (event) => {
		const target = event.target as HTMLElement;
		if (!target.closest('input, select, button')) {
			propertyDiv.setAttribute('draggable', 'true');
			templateProperties.querySelectorAll('.property-editor').forEach((el) => {
				if (el !== propertyDiv) {
					el.setAttribute('draggable', 'true');
				}
			});
		}
	});

	const resetDraggable = () => {
		propertyDiv.removeAttribute('draggable');
		templateProperties.querySelectorAll('.property-editor').forEach((el) => {
			el.removeAttribute('draggable');
		});
	};

	propertyDiv.addEventListener('dragend', resetDraggable);
	propertyDiv.addEventListener('mouseup', resetDraggable);

	if (select) {
		select.addEventListener('change', function() {
			if (propertySelectedDiv) updateSelectedOption(this.value, propertySelectedDiv);
			
			// Get the current name of the property
			const nameInput = propertyDiv.querySelector('.property-name') as HTMLInputElement;
			const currentName = nameInput.value;

			// Update the global property type
			updatePropertyType(currentName, this.value).then(() => {
				console.log(`Property type for ${currentName} updated to ${this.value}`);
			}).catch(error => {
				console.error(`Failed to update property type for ${currentName}:`, error);
			});

			updateTemplateFromForm();
		});
	}

	if (removeBtn) {
		removeBtn.addEventListener('click', () => {
			templateProperties.removeChild(propertyDiv);
		});
	}

	propertyDiv.addEventListener('dragstart', handleDragStart);
	propertyDiv.addEventListener('dragover', handleDragOver);
	propertyDiv.addEventListener('drop', handleDrop);
	propertyDiv.addEventListener('dragend', handleDragEnd);

	updateSelectedOption(propertyType, propertySelectedDiv);

	initializeIcons(propertyDiv);

	nameInput.addEventListener('input', function(this: HTMLInputElement) {
		const selectedType = generalSettings.propertyTypes.find(pt => pt.name === this.value);
		if (selectedType) {
			select.value = selectedType.type;
			updateSelectedOption(selectedType.type, propertySelectedDiv);
			
			// Only update the property type if the name is not empty
			if (this.value.trim() !== '') {
				updatePropertyType(this.value, selectedType.type).then(() => {
					console.log(`Property type for ${this.value} updated to ${selectedType.type}`);
				}).catch(error => {
					console.error(`Failed to update property type for ${this.value}:`, error);
				});
			}
			
			// Fill in the default value if it exists and the value input is empty
			if (selectedType.defaultValue && !valueInput.value) {
				valueInput.value = selectedType.defaultValue;
			}

			// Immediately update the template form
			updateTemplateFromForm();
		}
	});

	// Add a change event listener to handle selection from autocomplete
	nameInput.addEventListener('change', function(this: HTMLInputElement) {
		const selectedType = generalSettings.propertyTypes.find(pt => pt.name === this.value);
		if (selectedType) {
			// Fill in the default value if it exists, regardless of current value
			if (selectedType.defaultValue) {
				valueInput.value = selectedType.defaultValue;
			}
		}
	});

	return propertyDiv; // Return the created propertyDiv
}

function updateSelectedOption(value: string, propertySelected: HTMLElement): void {
	const iconName = getPropertyTypeIcon(value);
	
	// Clear existing content
	propertySelected.textContent = '';
	
	// Create and append the new icon element
	const iconElement = createElementWithHTML('i', '', { 'data-lucide': iconName });
	propertySelected.appendChild(iconElement);
	
	propertySelected.setAttribute('data-value', value);
	initializeIcons(propertySelected);
}

export function updateTemplateFromForm(): void {
	if (editingTemplateIndex === -1) return;

	const template = templates[editingTemplateIndex];
	if (!template) {
		console.error('Template not found');
		return;
	}

	const behaviorSelect = document.getElementById('template-behavior') as HTMLSelectElement;
	if (behaviorSelect) template.behavior = behaviorSelect.value as Template['behavior'];

	const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';

	const pathInput = document.getElementById('template-path-name') as HTMLInputElement;
	if (pathInput) template.path = pathInput.value;

	const noteNameFormat = document.getElementById('note-name-format') as HTMLInputElement;
	if (noteNameFormat) {
		if (!isDailyNote && noteNameFormat.value.trim() === '') {
			console.error('Note name format is required for non-daily note behaviors');
			noteNameFormat.setCustomValidity(getMessage('noteNameRequired'));
			noteNameFormat.reportValidity();
			return;
		} else {
			noteNameFormat.setCustomValidity('');
			template.noteNameFormat = noteNameFormat.value;
		}
	}

	const noteContentFormat = document.getElementById('note-content-format') as HTMLTextAreaElement;
	if (noteContentFormat) template.noteContentFormat = noteContentFormat.value;

	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;
	if (promptContextTextarea) template.context = promptContextTextarea.value;

	const propertyElements = document.querySelectorAll('#template-properties .property-editor');
	template.properties = Array.from(propertyElements).map(prop => {
		const nameInput = prop.querySelector('.property-name') as HTMLInputElement;
		const valueInput = prop.querySelector('.property-value') as HTMLInputElement;
		const typeSelect = prop.querySelector('.property-select .property-selected') as HTMLElement;
		return {
			id: (prop as HTMLElement).dataset.id || Date.now().toString() + Math.random().toString(36).slice(2, 11),
			name: nameInput.value,
			value: escapeValue(valueInput.value),
			type: typeSelect.getAttribute('data-value') || 'text'
		};
	}).filter(prop => prop.name.trim() !== ''); // Filter out properties with empty names

	const triggersTextarea = document.getElementById('url-patterns') as HTMLTextAreaElement;
	if (triggersTextarea) template.triggers = triggersTextarea.value.split('\n').filter(Boolean);

	const vaultSelect = document.getElementById('template-vault') as HTMLSelectElement;
	if (vaultSelect) template.vault = vaultSelect.value || undefined;

	hasUnsavedChanges = true;
}

function clearTemplateEditor(): void {
	setEditingTemplateIndex(-1);
	const templateEditorTitle = document.getElementById('template-editor-title');
	const templateName = document.getElementById('template-name') as HTMLInputElement;
	const templateProperties = document.getElementById('template-properties');
	if (templateEditorTitle) templateEditorTitle.textContent = getMessage('newTemplate');
	if (templateName) templateName.value = '';
	if (templateProperties) templateProperties.textContent = '';
	const pathInput = document.getElementById('template-path-name') as HTMLInputElement;
	if (pathInput) pathInput.value = 'Clippings';
	const triggersTextarea = document.getElementById('url-patterns') as HTMLTextAreaElement;
	if (triggersTextarea) triggersTextarea.value = '';
	const templateEditor = document.getElementById('template-editor');
	if (templateEditor) templateEditor.style.display = 'none';
}

export function initializeAddPropertyButton(): void {
	const addPropertyBtn = document.getElementById('add-property-btn');
	if (addPropertyBtn) {
		addPropertyBtn.removeEventListener('click', handleAddProperty);
		addPropertyBtn.addEventListener('click', handleAddProperty);
	} else {
		console.error('Add property button not found');
	}
}

function handleAddProperty(): void {
	const templateProperties = document.getElementById('template-properties');
	if (templateProperties) {
		const newPropertyDiv = addPropertyToEditor();
		if (newPropertyDiv.parentElement !== templateProperties) {
			templateProperties.appendChild(newPropertyDiv);
		}
		const nameInput = newPropertyDiv.querySelector('.property-name') as HTMLInputElement;
		if (nameInput) {
			nameInput.focus();
			nameInput.addEventListener('blur', () => {
				if (nameInput.value.trim() === '') {
					templateProperties.removeChild(newPropertyDiv);
				} else {
					updateTemplateFromForm();
				}
			}, { once: true });
		}
	}
}

function getUniqueTemplateName(baseName: string): string {
	const existingNames = new Set(templates.map(t => t.name));
	let newName = baseName;
	let counter = 1;

	while (existingNames.has(newName)) {
		newName = `${baseName} ${counter}`;
		counter++;
	}

	return newName;
}

function updatePropertyNameSuggestions(): void {
	const datalist = document.getElementById('property-name-suggestions');
	if (datalist) {
		// Clear existing suggestions
		datalist.textContent = '';
		generalSettings.propertyTypes.forEach(pt => {
			const option = document.createElement('option');
			option.value = pt.name;
			datalist.appendChild(option);
		});
	}
}

export function refreshPropertyNameSuggestions(): void {
	updatePropertyNameSuggestions();
}