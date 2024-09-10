import { Template, Property } from '../types/types';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { getPropertyTypeIcon, initializeIcons } from '../icons/icons';
import { escapeValue, unescapeValue } from '../utils/string-utils';
import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';

export let templates: Template[] = [];
export let editingTemplateIndex = -1;

const STORAGE_KEY_PREFIX = 'template_';
const TEMPLATE_LIST_KEY = 'template_list';
const CHUNK_SIZE = 8000;
const SIZE_WARNING_THRESHOLD = 6000;

let hasUnsavedChanges = false;

export function setEditingTemplateIndex(index: number): void {
	editingTemplateIndex = index;
}

export function loadTemplates(): Promise<Template[]> {
	return new Promise((resolve) => {
		chrome.storage.sync.get(TEMPLATE_LIST_KEY, async (data) => {
			const templateIds = data[TEMPLATE_LIST_KEY] || [];
			templates = [];

			for (const id of templateIds) {
				const template = await loadTemplate(id);
				if (template) {
					templates.push(template);
				}
			}

			if (templates.length === 0) {
				const defaultTemplate = createDefaultTemplate();
				templates.push(defaultTemplate);
				await saveTemplateSettings();
			}

			resolve(templates);
		});
	});
}

async function loadTemplate(id: string): Promise<Template | null> {
	return new Promise((resolve) => {
		chrome.storage.sync.get(STORAGE_KEY_PREFIX + id, (data) => {
			const compressedChunks = data[STORAGE_KEY_PREFIX + id];
			if (compressedChunks) {
				const decompressedData = decompressFromUTF16(compressedChunks.join(''));
				resolve(JSON.parse(decompressedData));
			} else {
				resolve(null);
			}
		});
	});
}

export function saveTemplateSettings(): Promise<string[]> {
	return new Promise(async (resolve, reject) => {
		try {
			const templateIds = templates.map(t => t.id);
			const templateData: { [key: string]: any } = {
				[TEMPLATE_LIST_KEY]: templateIds
			};

			const warnings: string[] = [];
			const templateChunks: { [key: string]: string[] } = {};
			for (const template of templates) {
				const [chunks, warning] = await prepareTemplateForSave(template);
				templateChunks[STORAGE_KEY_PREFIX + template.id] = chunks;
				if (warning) {
					warnings.push(warning);
				}
			}

			// Save template list and individual templates
			chrome.storage.sync.set({ ...templateChunks, [TEMPLATE_LIST_KEY]: templateIds }, () => {
				if (chrome.runtime.lastError) {
					console.error('Error saving templates:', chrome.runtime.lastError);
					reject(chrome.runtime.lastError);
				} else {
					console.log('Template settings saved');
					hasUnsavedChanges = false;
					resolve(warnings);
				}
			});
		} catch (error) {
			console.error('Error preparing templates for save:', error);
			reject(error);
		}
	});
}

async function prepareTemplateForSave(template: Template): Promise<[string[], string | null]> {
	const compressedData = compressToUTF16(JSON.stringify(template));
	const chunks = [];
	for (let i = 0; i < compressedData.length; i += CHUNK_SIZE) {
		chunks.push(compressedData.slice(i, i + CHUNK_SIZE));
	}

	// Check if the template size is approaching the limit
	if (compressedData.length > SIZE_WARNING_THRESHOLD) {
		return [chunks, `Warning: Template "${template.name}" is ${(compressedData.length / 1024).toFixed(2)}KB, which is approaching the storage limit.`];
	}
	return [chunks, null];
}

export function createDefaultTemplate(): Template {
	return {
		id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
		name: 'Default',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: 'Clippings',
		noteContentFormat: '{{content}}',
		properties: [
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'title', value: '{{title}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'source', value: '{{url}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'author', value: '{{author|wikilink}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'published', value: '{{published}}', type: 'date' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'created', value: '{{date}}', type: 'date' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'description', value: '{{description}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'tags', value: 'clippings', type: 'multitext' }
		],
		triggers: []
	};
}

export function addPropertyToEditor(name: string = '', value: string = '', type: string = 'text', id: string | null = null): void {
	const templateProperties = document.getElementById('template-properties');
	if (!templateProperties) return;

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
		<input type="text" class="property-value" value="${escapeHtml(unescapeValue(value))}" placeholder="Property value">
		<button type="button" class="remove-property-btn clickable-icon" aria-label="Remove property">
			<i data-lucide="trash-2"></i>
		</button>
	`;
	propertyDiv.dataset.id = id || Date.now().toString() + Math.random().toString(36).slice(2, 11);
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

export function resetUnsavedChanges(): void {
	hasUnsavedChanges = false;
}

export function getEditingTemplateIndex(): number {
	return editingTemplateIndex;
}

export function getTemplates(): Template[] {
	return templates;
}

function escapeHtml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function findTemplateById(id: string): Template | undefined {
	return templates.find(template => template.id === id);
}
