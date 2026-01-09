import { Template, Property } from '../types/types';
import { getTemplates, saveTemplateSettings, getEditingTemplateIndex } from '../managers/template-manager';
import { updateTemplateList } from '../managers/template-ui';
import { updateVaultList } from '../managers/general-settings';
import { generalSettings, saveSettings } from './storage-utils';
import { initializeModelList } from '../managers/interpreter-settings';
import { initializeIcons } from '../icons/icons';

let draggedElement: HTMLElement | null = null;

export function initializeDragAndDrop(): void {
	const draggableLists = [
		document.getElementById('template-list'),
		document.getElementById('template-properties'),
		document.getElementById('template-custom-variables-list'),
		document.getElementById('vault-list'),
		document.getElementById('model-list'),
		document.getElementById('custom-variables-list')
	];

	draggableLists.forEach(list => {
		if (list) {
			list.addEventListener('dragstart', handleDragStart);
			list.addEventListener('dragover', handleDragOver);
			list.addEventListener('drop', handleDrop);
			list.addEventListener('dragend', handleDragEnd);
		}
	});
}

export function handleDragStart(e: DragEvent): void {
	e.stopPropagation(); // Prevent bubbling to the body
	draggedElement = (e.target as HTMLElement).closest('[draggable]');
	if (draggedElement && e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', draggedElement.dataset.id || draggedElement.dataset.index || '');
		setTimeout(() => {
			if (draggedElement) draggedElement.classList.add('dragging');
		}, 0);
	}
}

export function handleDragOver(e: DragEvent): void {
	e.stopPropagation(); // Prevent bubbling to the body
	e.preventDefault();
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	const closestDraggable = (e.target as HTMLElement).closest('[draggable]');
	if (closestDraggable && closestDraggable !== draggedElement && draggedElement) {
		const rect = closestDraggable.getBoundingClientRect();
		const midY = rect.top + rect.height / 2;
		if (e.clientY < midY) {
			closestDraggable.parentNode?.insertBefore(draggedElement, closestDraggable);
		} else {
			closestDraggable.parentNode?.insertBefore(draggedElement, closestDraggable.nextSibling);
		}
	}
}

export function handleDrop(e: DragEvent): void {
	e.stopPropagation();
	e.preventDefault();
	if (!e.dataTransfer) return;
	const draggedItemId = e.dataTransfer.getData('text/plain');
	const list = (e.target as HTMLElement).closest('ul, #template-properties, #template-custom-variables-list, #model-list, #custom-variables-list');
	
	if (list && draggedElement) {
		const items = Array.from(list.children);
		const newIndex = items.indexOf(draggedElement);
		
		if (list.id === 'template-list') {
			handleTemplateReorder(draggedItemId, newIndex);
		} else if (list.id === 'template-properties') {
			handlePropertyReorder(draggedItemId, newIndex);
		} else if (list.id === 'vault-list') {
			handleVaultReorder(newIndex);
		} else if (list.id === 'model-list') {
			handleModelReorder(newIndex);
		} else if (list.id === 'custom-variables-list') {
			handleCustomVariablesReorder(list as HTMLElement);
		} else if (list.id === 'template-custom-variables-list') {
			handleTemplateCustomVariablesReorder(list as HTMLElement);
		}
		
		draggedElement.classList.remove('dragging');
	}
	
	draggedElement = null;
}

export function handleDragEnd(): void {
	if (draggedElement) {
		draggedElement.classList.remove('dragging');
	}
	draggedElement = null;
}

function handleTemplateReorder(draggedItemId: string, newIndex: number): void {
	const _templates = getTemplates();
	const oldIndex = _templates.findIndex(t => (t as Template).id === draggedItemId);
	if (oldIndex !== -1 && oldIndex !== newIndex) {
		const [movedTemplate] = _templates.splice(oldIndex, 1);
		_templates.splice(newIndex, 0, movedTemplate);
		saveTemplateSettings().then(() => {
			updateTemplateList();
		}).catch(error => {
			console.error('Failed to save template settings:', error);
		});
	}
}

export function handleTemplateDrag(): void {
	const templateSettingsForm = document.getElementById('template-settings-form');
	if (templateSettingsForm) {
		templateSettingsForm.addEventListener('dragover', (event) => {
			event.preventDefault();
		});
		templateSettingsForm.addEventListener('drop', (event) => {
			event.preventDefault();
		});
	}
}

function handlePropertyReorder(draggedItemId: string, newIndex: number): void {
	const editingTemplateIndex = getEditingTemplateIndex();
	if (editingTemplateIndex === -1) {
		console.error('No template is currently being edited');
		return;
	}

	const currentTemplates = getTemplates();
	const template = currentTemplates[editingTemplateIndex] as Template;
	if (!template) {
		console.error('Template not found');
		return;
	}

	if (!Array.isArray(template.properties) || template.properties.length === 0) {
		console.error('Template properties array is empty or not an array');
		return;
	}

	const oldIndex = template.properties.findIndex(p => (p as Property).id === draggedItemId);
	if (oldIndex === -1) {
		console.error('Property not found');
		return;
	}

	if (oldIndex !== newIndex) {
		const [movedProperty] = template.properties.splice(oldIndex, 1);
		template.properties.splice(newIndex, 0, movedProperty);
		saveTemplateSettings().then(() => {
			updateTemplateList();
		}).catch(error => {
			console.error('Failed to save template settings:', error);
		});
	}
}

function handleVaultReorder(newIndex: number): void {
	if (!draggedElement) return;
	const oldIndex = parseInt(draggedElement.dataset.index || '-1');
	if (oldIndex !== -1 && oldIndex !== newIndex) {
		const [movedVault] = generalSettings.vaults.splice(oldIndex, 1);
		generalSettings.vaults.splice(newIndex, 0, movedVault);
		saveSettings();
		updateVaultList();
	}
}

function handleModelReorder(newIndex: number): void {
	if (!draggedElement) return;
	const oldIndex = parseInt(draggedElement.dataset.index || '-1');
	if (oldIndex !== -1 && oldIndex !== newIndex) {
		const [movedModel] = generalSettings.models.splice(oldIndex, 1);
		generalSettings.models.splice(newIndex, 0, movedModel);
		saveSettings();
		initializeModelList();
		const modelList = document.getElementById('model-list');
		if (modelList) {
			initializeIcons(modelList);
		}
	}
}

function handleCustomVariablesReorder(list: HTMLElement): void {
	// Persist order of custom variables based on current DOM order
	const rows = Array.from(list.querySelectorAll('.property-editor')) as HTMLElement[];
	const orderedEntries: Array<[string, string]> = rows.map((row) => {
		const nameInput = row.querySelector('.property-name') as HTMLInputElement | null;
		const valueInput = row.querySelector('.property-value') as HTMLInputElement | null;
		const name = nameInput?.value?.trim() || '';
		const value = valueInput?.value ?? '';
		return [name, value];
	}).filter((tuple): tuple is [string, string] => tuple[0].length > 0);

	// Rebuild customVariables in the new order
	const newMap: Record<string, string> = {};
	orderedEntries.forEach(([k, v]) => {
		newMap[k] = v;
	});
	generalSettings.customVariables = newMap;
	saveSettings();
}

function handleTemplateCustomVariablesReorder(list: HTMLElement): void {
	// Persist order for per-template custom variables
	const rows = Array.from(list.querySelectorAll('.property-editor')) as HTMLElement[];
	const orderedEntries: Array<[string, string]> = rows.map((row) => {
		const nameInput = row.querySelector('.property-name') as HTMLInputElement | null;
		const valueInput = row.querySelector('.property-value') as HTMLInputElement | null;
		const name = nameInput?.value?.trim() || '';
		const value = valueInput?.value ?? '';
		return [name, value];
	}).filter((tuple): tuple is [string, string] => tuple[0].length > 0);

	const templates = getTemplates();
	const idx = getEditingTemplateIndex();
	if (idx < 0 || !templates[idx]) return;
	const t = templates[idx] as Template;
	const newMap: Record<string, string> = {};
	orderedEntries.forEach(([k, v]) => { newMap[k] = v; });
	t.customVariables = newMap;
	saveTemplateSettings();
}

export function moveItem<T>(array: T[], fromIndex: number, toIndex: number): T[] {
	const newArray = [...array];
	const [movedItem] = newArray.splice(fromIndex, 1);
	newArray.splice(toIndex, 0, movedItem);
	return newArray;
}
