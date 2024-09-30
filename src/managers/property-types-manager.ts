import { generalSettings, addPropertyType, updatePropertyType, removePropertyType, saveSettings } from '../utils/storage-utils';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { templates } from './template-manager';

export function initializePropertyTypesManager(): void {
	ensureTagsProperty();
	updatePropertyTypesList();
	setupAddPropertyTypeButton();
	setupImportExportButtons();
}

function ensureTagsProperty(): void {
	const tagsProperty = generalSettings.propertyTypes.find(pt => pt.name === 'tags');
	if (!tagsProperty) {
		addPropertyType('tags', 'multitext');
	} else if (tagsProperty.type !== 'multitext') {
		updatePropertyType('tags', 'multitext');
	}
}

function updatePropertyTypesList(): void {
	const propertyTypesList = document.getElementById('property-types-list');
	if (!propertyTypesList) return;

	propertyTypesList.innerHTML = '';

	const propertyUsageCounts = countPropertyUsage();

	// Sort all property types alphabetically
	const sortedPropertyTypes = [...generalSettings.propertyTypes].sort((a, b) => 
		a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
	);

	sortedPropertyTypes.forEach(propertyType => {
		const listItem = createPropertyTypeListItem(propertyType, propertyUsageCounts[propertyType.name] || 0);
		propertyTypesList.appendChild(listItem);
	});

	initializeIcons(propertyTypesList);
}

function countPropertyUsage(): Record<string, number> {
	const usageCounts: Record<string, number> = {};
	templates.forEach(template => {
		template.properties.forEach(property => {
			usageCounts[property.name] = (usageCounts[property.name] || 0) + 1;
		});
	});
	return usageCounts;
}

function createPropertyTypeListItem(propertyType: { name: string; type: string }, usageCount: number): HTMLElement {
	const listItem = createElementWithClass('div', 'property-editor');

	const propertySelectDiv = createElementWithClass('div', 'property-select');
	const propertySelectedDiv = createElementWithClass('div', 'property-selected');
	propertySelectedDiv.dataset.value = propertyType.type;
	propertySelectedDiv.appendChild(createElementWithHTML('i', '', { 'data-lucide': getPropertyTypeIcon(propertyType.type) }));
	propertySelectDiv.appendChild(propertySelectedDiv);

	const select = document.createElement('select');
	select.className = 'property-type';
	['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'].forEach(type => {
		const option = document.createElement('option');
		option.value = type;
		option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
		select.appendChild(option);
	});
	select.value = propertyType.type;
	propertySelectDiv.appendChild(select);

	const nameInput = createElementWithHTML('input', '', {
		type: 'text',
		value: propertyType.name,
		class: 'property-name',
		readonly: 'true'
	});

	const usageSpan = createElementWithClass('span', 'tree-item-flair');
	usageSpan.textContent = `${usageCount}`;

	listItem.appendChild(propertySelectDiv);
	listItem.appendChild(nameInput);
	listItem.appendChild(usageSpan);

	if (propertyType.name !== 'tags') {
		if (usageCount === 0) {
			const removeBtn = createElementWithClass('button', 'remove-property-btn clickable-icon');
			removeBtn.setAttribute('type', 'button');
			removeBtn.setAttribute('aria-label', 'Remove property type');
			removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
			listItem.appendChild(removeBtn);

			removeBtn.addEventListener('click', () => removePropertyType(propertyType.name).then(updatePropertyTypesList));
		}

		select.addEventListener('change', function() {
			updateSelectedOption(this.value, propertySelectedDiv);
			updatePropertyType(propertyType.name, this.value).then(updatePropertyTypesList);
		});
	} else {
		// For 'tags' property, disable the select and add a special class
		select.disabled = true;
		listItem.classList.add('tags-property');
	}

	return listItem;
}

function updateSelectedOption(value: string, propertySelected: HTMLElement): void {
	const iconName = getPropertyTypeIcon(value);
	
	// Clear existing content
	propertySelected.innerHTML = '';
	
	// Create and append the new icon element
	const iconElement = createElementWithHTML('i', '', { 'data-lucide': iconName });
	propertySelected.appendChild(iconElement);
	
	propertySelected.setAttribute('data-value', value);
	initializeIcons(propertySelected);
}

function setupAddPropertyTypeButton(): void {
	const addButton = document.getElementById('add-property-type-btn');
	if (addButton) {
		addButton.addEventListener('click', () => {
			const name = prompt('Enter the name for the new property type:');
			if (name) {
				addPropertyType(name).then(updatePropertyTypesList);
			}
		});
	}
}

function setupImportExportButtons(): void {
	const importButton = document.getElementById('import-types-btn');
	const exportButton = document.getElementById('export-types-btn');

	if (importButton) {
		importButton.addEventListener('click', importTypesJson);
	}

	if (exportButton) {
		exportButton.addEventListener('click', exportTypesJson);
	}
}

async function importTypesJson(): Promise<void> {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = async (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = async (e: ProgressEvent<FileReader>) => {
				try {
					const content = JSON.parse(e.target?.result as string);
					if (content.types) {
						const newTypes = Object.entries(content.types).map(([name, type]) => ({ name, type: type as string }));
						await mergePropertyTypes(newTypes);
						updatePropertyTypesList();
					}
				} catch (error) {
					console.error('Error parsing types.json:', error);
					alert('Error importing types.json. Please check the file format.');
				}
			};
			reader.readAsText(file);
		}
	};
	input.click();
}

async function mergePropertyTypes(newTypes: { name: string; type: string }[]): Promise<void> {
	for (const newType of newTypes) {
		if (newType.name === 'tags') {
			// Ensure 'tags' is always multitext
			await updatePropertyType('tags', 'multitext');
		} else {
			const existingType = generalSettings.propertyTypes.find(pt => pt.name === newType.name);
			if (existingType && existingType.type !== newType.type) {
				const useNewType = await resolveConflict(newType.name, existingType.type, newType.type);
				if (useNewType) {
					await updatePropertyType(newType.name, newType.type);
				}
			} else if (!existingType) {
				await addPropertyType(newType.name, newType.type);
			}
		}
	}

	await saveSettings();
}

async function resolveConflict(name: string, existingType: string, newType: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const message = `Property "${name}" already exists with type "${existingType}". Do you want to update it to "${newType}"?`;
		if (confirm(message)) {
			resolve(true);
		} else {
			resolve(false);
		}
	});
}

function exportTypesJson(): void {
	const typesObject = generalSettings.propertyTypes.reduce((acc, { name, type }) => {
		acc[name] = type;
		return acc;
	}, {} as Record<string, string>);

	const content = JSON.stringify({ types: typesObject }, null, 2);
	const blob = new Blob([content], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = 'types.json';
	a.click();

	URL.revokeObjectURL(url);
}