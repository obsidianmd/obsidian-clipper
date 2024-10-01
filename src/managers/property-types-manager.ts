import { PropertyType } from '../types/types';
import { generalSettings, saveSettings } from '../utils/storage-utils';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { initializeIcons, getPropertyTypeIcon } from '../icons/icons';
import { templates } from './template-manager';
import { refreshPropertyNameSuggestions } from './template-ui';
import { detectBrowser } from '../utils/browser-detection';

export function initializePropertyTypesManager(): void {
	ensureTagsProperty();
	updatePropertyTypesList();
	setupAddPropertyTypeButton();
	setupImportExportButtons(); // Make sure this line is present
}

function ensureTagsProperty(): void {
	const tagsProperty = generalSettings.propertyTypes.find(pt => pt.name === 'tags');
	if (!tagsProperty) {
		addPropertyType('tags', 'multitext', '');
	} else if (tagsProperty.type !== 'multitext') {
		updatePropertyType('tags', 'multitext', tagsProperty.defaultValue || '');
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
	refreshPropertyNameSuggestions();
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

function createPropertyTypeListItem(propertyType: PropertyType, usageCount: number): HTMLElement {
	const listItem = createElementWithClass('div', 'property-editor');

	const propertySelectDiv = createElementWithClass('div', 'property-select');
	const propertySelectedDiv = createElementWithClass('div', 'property-selected');
	propertySelectedDiv.dataset.value = propertyType.type;
	propertySelectedDiv.appendChild(createElementWithHTML('i', '', { 'data-lucide': getPropertyTypeIcon(propertyType.type) }));
	propertySelectDiv.appendChild(propertySelectedDiv);

	const select = document.createElement('select') as HTMLSelectElement;
	select.className = 'property-type';
	['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'].forEach(type => {
		const option = document.createElement('option');
		option.value = type;
		option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
		select.appendChild(option);
	});
	select.value = propertyType.type;
	propertySelectDiv.appendChild(select);

	const nameInput = createElementWithClass('span', 'property-name');
	nameInput.textContent = `${propertyType.name}`;

	const defaultValueInput = createElementWithHTML('input', '', {
		type: 'text',
		value: propertyType.defaultValue || '',
		class: 'property-default-value',
		placeholder: 'Default value'
	}) as HTMLInputElement;

	const usageSpan = createElementWithClass('span', 'tree-item-flair');
	usageSpan.textContent = `${usageCount}`;

	listItem.appendChild(propertySelectDiv);
	listItem.appendChild(nameInput);
	listItem.appendChild(defaultValueInput);
	listItem.appendChild(usageSpan);

	if (usageCount === 0 && propertyType.name != 'tags') {
		const removeBtn = createElementWithClass('button', 'remove-property-btn clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('aria-label', 'Remove property type');
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		listItem.appendChild(removeBtn);

		removeBtn.addEventListener('click', () => removePropertyType(propertyType.name));
	} else {
		const removeBtn = createElementWithClass('button', 'remove-property-btn clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('disabled', '');
		removeBtn.setAttribute('aria-label', 'Remove property type');
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		listItem.appendChild(removeBtn);

		removeBtn.addEventListener('click', () => removePropertyType(propertyType.name));
	}

	if (propertyType.name !== 'tags') {
		select.addEventListener('change', function() {
			updateSelectedOption(this.value, propertySelectedDiv);
			updatePropertyType(propertyType.name, this.value, defaultValueInput.value).then(updatePropertyTypesList);
		});

		defaultValueInput.addEventListener('change', function() {
			updatePropertyType(propertyType.name, select.value, this.value).then(updatePropertyTypesList);
		});
	} else {
		// For 'tags' property, disable the select and default value input
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
					console.log('Starting types import');
					const content = JSON.parse(e.target?.result as string);
					console.log('Parsed imported types:', content);

					if (content && typeof content === 'object' && 'types' in content && typeof content.types === 'object') {
						const newTypes = Object.entries(content.types).map(([name, type]) => {
							console.log(`Processing type: ${name}, value:`, type);
							if (typeof type !== 'string') {
								console.warn(`Invalid type for property "${name}". Using 'text' as default.`);
								return { name, type: 'text', defaultValue: '' };
							}
							return { name, type, defaultValue: '' };
						});

						console.log('Processed new types:', newTypes);
						await mergePropertyTypes(newTypes);
						updatePropertyTypesList();
						console.log('Types import completed');
					} else {
						console.error('Invalid types.json format:', content);
						throw new Error('Invalid types.json format: "types" property not found or is not an object');
					}
				} catch (error) {
					console.error('Error parsing types.json:', error);
					alert(`Error importing types.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			};
			reader.readAsText(file);
		}
	};
	input.click();
}

async function mergePropertyTypes(newTypes: PropertyType[]): Promise<void> {
	console.log('Merging property types');
	for (const newType of newTypes) {
		console.log(`Processing type: ${newType.name}, type: ${newType.type}`);
		if (newType.name === 'tags') {
			console.log('Ensuring tags is multitext');
			await updatePropertyType('tags', 'multitext', '');
		} else {
			const existingType = generalSettings.propertyTypes.find(pt => pt.name === newType.name);
			if (existingType) {
				console.log(`Existing type found for ${newType.name}: ${existingType.type}`);
				if (existingType.type !== newType.type) {
					const useNewType = await resolveConflict(newType.name, 'type', existingType.type, newType.type);
					if (useNewType) {
						console.log(`Updating existing type: ${newType.name} to ${newType.type}`);
						await updatePropertyType(newType.name, newType.type, existingType.defaultValue);
					} else {
						console.log(`Keeping existing type: ${newType.name} as ${existingType.type}`);
					}
				} else {
					console.log(`No changes needed for existing type: ${newType.name}`);
				}
			} else {
				console.log(`Adding new type: ${newType.name} as ${newType.type}`);
				await addPropertyType(newType.name, newType.type, '');
			}
		}
	}

	await saveSettings();
	console.log('Property types merged and saved');
}

async function resolveConflict(name: string, field: string, existingValue: string, newValue: string): Promise<boolean> {
	return new Promise<boolean>((resolve) => {
		const message = `Property "${name}" has a conflict:\n${field}: "${existingValue}" -> "${newValue}"\nDo you want to update this ${field}?`;
		if (confirm(message)) {
			resolve(true);
		} else {
			resolve(false);
		}
	});
}

async function exportTypesJson(): Promise<void> {
	const typesObject = generalSettings.propertyTypes.reduce((acc, { name, type }) => {
		acc[name] = type;
		return acc;
	}, {} as Record<string, string>);

	const content = JSON.stringify({ types: typesObject }, null, 2);
	const fileName = 'types.json';

	const browser = await detectBrowser();
	const isIOSBrowser = browser === 'mobile-safari' || browser === 'ipad-os';

	if (isIOSBrowser && navigator.share) {
		const blob = new Blob([content], { type: 'application/json' });
		const file = new File([blob], fileName, { type: 'application/json' });

		try {
			await navigator.share({
				files: [file],
				title: 'Exported property types',
				text: 'Obsidian Web Clipper property types'
			});
		} catch (error) {
			console.error('Error sharing:', error);
			fallbackExport(content, fileName);
		}
	} else {
		fallbackExport(content, fileName);
	}
}

function fallbackExport(content: string, fileName: string): void {
	const blob = new Blob([content], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export async function addPropertyType(name: string, type: string = 'text', defaultValue: string = ''): Promise<void> {
	console.log(`addPropertyType called with: name=${name}, type=${type}, defaultValue=${defaultValue}`);
	const existingPropertyType = generalSettings.propertyTypes.find(pt => pt.name === name);
	if (!existingPropertyType) {
		console.log(`Adding new property type: ${name} with type ${type}`);
		const newPropertyType: PropertyType = { name, type };
		if (defaultValue !== null && defaultValue !== '') {
			newPropertyType.defaultValue = defaultValue;
		}
		generalSettings.propertyTypes.push(newPropertyType);
		await saveSettings();
	} else if (existingPropertyType.type !== type || existingPropertyType.defaultValue !== defaultValue) {
		console.log(`Updating existing property type: ${name} from ${existingPropertyType.type} to ${type}`);
		existingPropertyType.type = type;
		if (defaultValue !== null && defaultValue !== '') {
			existingPropertyType.defaultValue = defaultValue;
		} else {
			delete existingPropertyType.defaultValue;
		}
		await saveSettings();
	} else {
		console.log(`Property type ${name} already exists and is up to date`);
	}
	console.log('Current property types:', JSON.stringify(generalSettings.propertyTypes, null, 2));
}

export async function updatePropertyType(name: string, newType: string, newDefaultValue?: string): Promise<void> {
	const index = generalSettings.propertyTypes.findIndex(p => p.name === name);
	if (index !== -1) {
		generalSettings.propertyTypes[index].type = newType;
		if (newDefaultValue !== undefined && newDefaultValue !== null && newDefaultValue !== '') {
			generalSettings.propertyTypes[index].defaultValue = newDefaultValue;
		} else {
			delete generalSettings.propertyTypes[index].defaultValue;
		}
	} else {
		const newPropertyType: PropertyType = { name, type: newType };
		if (newDefaultValue !== undefined && newDefaultValue !== null && newDefaultValue !== '') {
			newPropertyType.defaultValue = newDefaultValue;
		}
		generalSettings.propertyTypes.push(newPropertyType);
	}
	await saveSettings();
}

export async function removePropertyType(name: string): Promise<void> {
	generalSettings.propertyTypes = generalSettings.propertyTypes.filter(p => p.name !== name);
	await saveSettings();
	updatePropertyTypesList();
}