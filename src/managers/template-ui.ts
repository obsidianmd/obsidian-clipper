import { Template, Property } from '../types/types';
import { templates, editingTemplateIndex, saveTemplateSettings, getTemplates, setEditingTemplateIndex } from './template-manager';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { escapeValue, escapeHtml, unescapeValue } from '../utils/string-utils';
import { generalSettings } from '../utils/storage-utils';
import { updateUrl } from '../utils/routing';
import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import browser from '../utils/browser-polyfill';

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
	
	templateList.innerHTML = '';
	templatesToUse.forEach((template, index) => {
		if (template && template.name && template.id) {
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
			li.dataset.index = index.toString();
			li.draggable = true;
			li.addEventListener('click', (e) => {
				const target = e.target as HTMLElement;
				if (!target.closest('.delete-template-btn')) {
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
	initializeIcons(templateList);
}

export function showTemplateEditor(template: Template | null): void {
	let editingTemplate: Template;

	if (!template) {
		editingTemplate = {
			id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
			name: 'New template',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings',
			noteContentFormat: '{{content}}',
			properties: [],
			triggers: []
		};
		templates.push(editingTemplate);
		setEditingTemplateIndex(templates.length - 1);
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

	if (templateEditorTitle) templateEditorTitle.textContent = 'Edit template';
	if (templateName) templateName.value = editingTemplate.name;
	if (templateProperties) templateProperties.innerHTML = '';

	const pathInput = document.getElementById('template-path-name') as HTMLInputElement;
	if (pathInput) pathInput.value = editingTemplate.path;

	const behaviorSelect = document.getElementById('template-behavior') as HTMLSelectElement;
	
	if (behaviorSelect) behaviorSelect.value = editingTemplate.behavior || 'create';
	const specificNoteName = document.getElementById('specific-note-name') as HTMLInputElement;
	if (specificNoteName) specificNoteName.value = editingTemplate.specificNoteName || '';
	const dailyNoteFormat = document.getElementById('daily-note-format') as HTMLInputElement;
	if (dailyNoteFormat) dailyNoteFormat.value = editingTemplate.dailyNoteFormat || 'YYYY-MM-DD';
	const noteNameFormat = document.getElementById('note-name-format') as HTMLInputElement;
	if (noteNameFormat) noteNameFormat.value = editingTemplate.noteNameFormat || '{{title}}';

	const noteContentFormat = document.getElementById('note-content-format') as HTMLTextAreaElement;
	if (noteContentFormat) noteContentFormat.value = editingTemplate.noteContentFormat || '';

	updateBehaviorFields();

	if (behaviorSelect) {
		behaviorSelect.addEventListener('change', updateBehaviorFields);
	}

	if (editingTemplate && Array.isArray(editingTemplate.properties)) {
		editingTemplate.properties.forEach(property => addPropertyToEditor(property.name, property.value, property.type, property.id));
	}

	const triggersTextarea = document.getElementById('url-patterns') as HTMLTextAreaElement;
	if (triggersTextarea) triggersTextarea.value = editingTemplate && editingTemplate.triggers ? editingTemplate.triggers.join('\n') : '';

	const templateEditor = document.getElementById('template-editor');
	if (templateEditor) templateEditor.style.display = 'block';
	const templatesSection = document.getElementById('templates-section');
	if (templatesSection) templatesSection.style.display = 'block';
	const generalSection = document.getElementById('general-section');
	if (generalSection) generalSection.style.display = 'none';

	document.querySelectorAll('.sidebar li[data-section]').forEach(item => item.classList.remove('active'));
	document.querySelectorAll('#template-list li').forEach(item => item.classList.remove('active'));
	if (editingTemplateIndex !== -1) {
		const activeTemplateItem = document.querySelector(`#template-list li[data-id="${templates[editingTemplateIndex].id}"]`);
		if (activeTemplateItem) {
			activeTemplateItem.classList.add('active');
		}
	}

	if (templatesSection) templatesSection.classList.add('active');
	if (generalSection) generalSection.classList.remove('active');

	updateTemplateList();

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
		vaultSelect.innerHTML = '<option value="">Last used</option>';
		generalSettings.vaults.forEach(vault => {
			const option = document.createElement('option');
			option.value = vault;
			option.textContent = vault;
			vaultSelect.appendChild(option);
		});
		vaultSelect.value = editingTemplate.vault || '';
	}

	updateUrl('templates', editingTemplate.id);
}

function updateBehaviorFields(): void {
	const behaviorSelect = document.getElementById('template-behavior') as HTMLSelectElement;
	const specificNoteContainer = document.getElementById('specific-note-container');
	const dailyNoteFormatContainer = document.getElementById('daily-note-format-container');
	const noteNameFormatContainer = document.getElementById('note-name-format-container');
	const propertiesContainer = document.getElementById('properties-container');
	const propertiesWarning = document.getElementById('properties-warning');

	if (behaviorSelect) {
		const selectedBehavior = behaviorSelect.value;
		if (specificNoteContainer) specificNoteContainer.style.display = selectedBehavior === 'append-specific' ? 'block' : 'none';
		if (dailyNoteFormatContainer) dailyNoteFormatContainer.style.display = selectedBehavior === 'append-daily' ? 'block' : 'none';
		if (noteNameFormatContainer) noteNameFormatContainer.style.display = selectedBehavior === 'create' ? 'block' : 'none';
		
		if (selectedBehavior === 'append-specific' || selectedBehavior === 'append-daily') {
			if (propertiesContainer) propertiesContainer.style.display = 'none';
			if (propertiesWarning) propertiesWarning.style.display = 'block';
		} else {
			if (propertiesContainer) propertiesContainer.style.display = 'block';
			if (propertiesWarning) propertiesWarning.style.display = 'none';
		}
	}
}

export function deleteTemplate(templateId: string): void {
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
				setEditingTemplateIndex(editingTemplateIndex - 1);
			}
			
			saveTemplateSettings();
			updateTemplateList();
		}
	}
}

export function addPropertyToEditor(name: string = '', value: string = '', type: string = 'text', id: string | null = null): void {
	const templateProperties = document.getElementById('template-properties');
	if (!templateProperties) return;

	const propertyId = id || Date.now().toString() + Math.random().toString(36).slice(2, 11);
	const propertyDiv = document.createElement('div');
	propertyDiv.className = 'property-editor';
	propertyDiv.innerHTML = `
		<div class="drag-handle">
			<i data-lucide="grip-vertical"></i>
		</div>
		<div class="property-select">
			<div class="property-selected" data-value="${type}">
				<i data-lucide="${getPropertyTypeIcon(type)}"></i>
			</div>
			<select class="property-type" id="${propertyId}-type">
				<option value="text">Text</option>
				<option value="multitext">List</option>
				<option value="number">Number</option>
				<option value="checkbox">Checkbox</option>
				<option value="date">Date</option>
				<option value="datetime">Date & time</option>
			</select>
		</div>
		<input type="text" class="property-name" id="${propertyId}-name" value="${name}" placeholder="Property name">
		<input type="text" class="property-value" id="${propertyId}-value" value="${escapeHtml(unescapeValue(value))}" placeholder="Property value">
		<button type="button" class="remove-property-btn clickable-icon" aria-label="Remove property">
			<i data-lucide="trash-2"></i>
		</button>
	`;
	propertyDiv.dataset.id = propertyId;
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

	const propertySelect = propertyDiv.querySelector('.property-select');
	if (!propertySelect) return;

	const propertySelected = propertySelect.querySelector('.property-selected');
	const hiddenSelect = propertySelect.querySelector('select');

	if (hiddenSelect) {
		hiddenSelect.value = type;

		hiddenSelect.addEventListener('change', function() {
			if (propertySelected) updateSelectedOption(this.value, propertySelected as HTMLElement);
		});
	}

	const removePropertyBtn = propertyDiv.querySelector('.remove-property-btn');
	if (removePropertyBtn) {
		removePropertyBtn.addEventListener('click', () => {
			templateProperties.removeChild(propertyDiv);
		});
	}

	propertyDiv.addEventListener('dragstart', handleDragStart);
	propertyDiv.addEventListener('dragover', handleDragOver);
	propertyDiv.addEventListener('drop', handleDrop);
	propertyDiv.addEventListener('dragend', handleDragEnd);

	if (propertySelected) updateSelectedOption(type, propertySelected as HTMLElement);

	initializeIcons(propertyDiv);
}

function updateSelectedOption(value: string, propertySelected: HTMLElement): void {
	const iconName = getPropertyTypeIcon(value);
	propertySelected.innerHTML = `<i data-lucide="${iconName}"></i>`;
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
	if (behaviorSelect) template.behavior = behaviorSelect.value;

	const pathInput = document.getElementById('template-path-name') as HTMLInputElement;
	if (pathInput) template.path = pathInput.value;

	const noteNameFormat = document.getElementById('note-name-format') as HTMLInputElement;
	if (noteNameFormat) template.noteNameFormat = noteNameFormat.value;

	const specificNoteName = document.getElementById('specific-note-name') as HTMLInputElement;
	if (specificNoteName) template.specificNoteName = specificNoteName.value;

	const dailyNoteFormat = document.getElementById('daily-note-format') as HTMLInputElement;
	if (dailyNoteFormat) template.dailyNoteFormat = dailyNoteFormat.value;

	const noteContentFormat = document.getElementById('note-content-format') as HTMLTextAreaElement;
	if (noteContentFormat) template.noteContentFormat = noteContentFormat.value;

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
	});

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
	if (templateEditorTitle) templateEditorTitle.textContent = 'New template';
	if (templateName) templateName.value = '';
	if (templateProperties) templateProperties.innerHTML = '';
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
	addPropertyToEditor();
	if (editingTemplateIndex !== -1) {
		updateTemplateFromForm();
	}
}
