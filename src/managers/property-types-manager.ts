import { generalSettings, addPropertyType, updatePropertyType, removePropertyType, saveSettings } from '../utils/storage-utils';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { initializeIcons } from '../icons/icons';

export function initializePropertyTypesManager(): void {
	updatePropertyTypesList();
	setupAddPropertyTypeButton();
	setupImportExportButtons();
}

function updatePropertyTypesList(): void {
	const propertyTypesList = document.getElementById('property-types-list');
	if (!propertyTypesList) return;

	propertyTypesList.innerHTML = '';

	generalSettings.propertyTypes.forEach(propertyType => {
		const listItem = createPropertyTypeListItem(propertyType);
		propertyTypesList.appendChild(listItem);
	});

	initializeIcons(propertyTypesList);
}

function createPropertyTypeListItem(propertyType: { name: string; type: string }): HTMLElement {
	const listItem = createElementWithClass('div', 'property-type-item');

	const nameInput = createElementWithHTML('input', '', {
		type: 'text',
		value: propertyType.name,
		class: 'property-type-name',
		readonly: 'true'
	});

	const typeSelect = document.createElement('select');
	typeSelect.className = 'property-type-select';
	['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'].forEach(type => {
		const option = document.createElement('option');
		option.value = type;
		option.textContent = type;
		typeSelect.appendChild(option);
	});
	typeSelect.value = propertyType.type;

	const removeBtn = createElementWithClass('button', 'remove-property-type-btn clickable-icon');
	removeBtn.setAttribute('type', 'button');
	removeBtn.setAttribute('aria-label', 'Remove property type');
	removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));

	listItem.appendChild(nameInput);
	listItem.appendChild(typeSelect);
	listItem.appendChild(removeBtn);

	typeSelect.addEventListener('change', () => updatePropertyType(propertyType.name, typeSelect.value));
	removeBtn.addEventListener('click', () => removePropertyType(propertyType.name).then(updatePropertyTypesList));

	return listItem;
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

function importTypesJson(): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';
	input.onchange = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e: ProgressEvent<FileReader>) => {
				try {
					const content = JSON.parse(e.target?.result as string);
					if (content.types) {
						generalSettings.propertyTypes = Object.entries(content.types).map(([name, type]) => ({ name, type: type as string }));
						saveSettings().then(updatePropertyTypesList);
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