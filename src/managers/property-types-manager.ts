import { generalSettings, addPropertyType, updatePropertyType, removePropertyType, saveSettings } from '../utils/storage-utils';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { templates } from './template-manager';

export function initializePropertyTypesManager(): void {
	updatePropertyTypesList();
	setupAddPropertyTypeButton();
	setupImportExportButtons();
}

function updatePropertyTypesList(): void {
	const propertyTypesList = document.getElementById('property-types-list');
	if (!propertyTypesList) return;

	propertyTypesList.innerHTML = '';

	const propertyUsageCounts = countPropertyUsage();

	// Sort property types by name
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

	const removeBtn = createElementWithClass('button', 'remove-property-btn clickable-icon');
	removeBtn.setAttribute('type', 'button');
	removeBtn.setAttribute('aria-label', 'Remove property type');
	removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));

	listItem.appendChild(propertySelectDiv);
	listItem.appendChild(nameInput);
	listItem.appendChild(usageSpan);
	listItem.appendChild(removeBtn);

	select.addEventListener('change', function() {
		updateSelectedOption(this.value, propertySelectedDiv);
		updatePropertyType(propertyType.name, this.value).then(updatePropertyTypesList);
	});
	removeBtn.addEventListener('click', () => removePropertyType(propertyType.name).then(updatePropertyTypesList));

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