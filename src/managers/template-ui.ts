import { Template, Property } from '../types/types';
import { templates, editingTemplateIndex, saveTemplateSettings, addPropertyToEditor, updateTemplateFromForm, resetUnsavedChanges, getTemplates, setEditingTemplateIndex } from './template-manager';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { escapeValue, unescapeValue } from '../utils/string-utils';
import { generalSettings } from './general-settings';
import { updateUrl } from '../core/settings';
import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';

export function updateTemplateList(): void {
	const templateList = document.getElementById('template-list');
	if (!templateList) return;

	templateList.innerHTML = '';
	templates.forEach((template, index) => {
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
	const specificNoteContainer = document.getElementById('specific-note-container');
	const dailyNoteFormatContainer = document.getElementById('daily-note-format-container');
	const noteNameFormatContainer = document.getElementById('note-name-format-container');
	const propertiesContainer = document.getElementById('properties-container');
	const propertiesWarning = document.getElementById('properties-warning');
	
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