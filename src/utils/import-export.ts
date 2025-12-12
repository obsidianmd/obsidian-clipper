import { Template } from '../types/types';
import { templates, saveTemplateSettings, editingTemplateIndex, loadTemplates } from '../managers/template-manager';
import { showTemplateEditor, updateTemplateList } from '../managers/template-ui';
import { sanitizeFileName } from './string-utils';
import { generalSettings, loadSettings } from '../utils/storage-utils';
import { addPropertyType, updatePropertyTypesList } from '../managers/property-types-manager';
import { hideModal } from '../utils/modal-utils';
import { showImportModal } from './import-modal';
import browser from '../utils/browser-polyfill';
import { saveFile } from './file-utils';
import { copyToClipboardWithFeedback } from './clipboard-utils';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import { getMessage } from './i18n';

const SCHEMA_VERSION = '0.1.0';

// Add these type definitions at the top
interface StorageData {
	[key: string]: any;
	template_list?: string[];
}

export async function exportTemplate(): Promise<void> {
	if (editingTemplateIndex === -1) {
		alert(getMessage('selectTemplateToExport'));
		return;
	}

	const template = templates[editingTemplateIndex] as Template;
	const sanitizedName = sanitizeFileName(template.name);
	const fileName = `${sanitizedName.replace(/\s+/g, '-').toLowerCase()}-clipper.json`;

	const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';

	const orderedTemplate: Partial<Template> & { schemaVersion: string } = {
		schemaVersion: SCHEMA_VERSION,
		name: template.name,
		behavior: template.behavior,
		noteContentFormat: template.noteContentFormat,
		properties: template.properties.map(({ name, value, type }) => ({
			name,
			value,
			type: type || generalSettings.propertyTypes.find(pt => pt.name === name)?.type || 'text'
		})),
		triggers: template.triggers,
	};

	// Only include noteNameFormat and path for non-daily note behaviors
	if (!isDailyNote) {
		orderedTemplate.noteNameFormat = template.noteNameFormat;
		orderedTemplate.path = template.path;
	}

	// Include context only if it has a value
	if (template.context) {
		orderedTemplate.context = template.context;
	}

	const content = JSON.stringify(orderedTemplate, null, '\t');
	
	await saveFile({
		content,
		fileName,
		mimeType: 'application/json',
		onError: (error) => console.error('Failed to export template:', error)
	});
}

export function importTemplate(input?: HTMLInputElement): void {
	if (!input) {
		input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
	}

	const handleFile = (file: File) => {
		const reader = new FileReader();
		reader.onload = async (e: ProgressEvent<FileReader>) => {
			try {
				const importedTemplate = JSON.parse(e.target?.result as string) as Partial<Template>;
				console.log('Imported template:', importedTemplate);

				if (!validateImportedTemplate(importedTemplate)) {
					throw new Error('Invalid template file');
				}

				importedTemplate.id = Date.now().toString() + Math.random().toString(36).slice(2, 9);
				
				// Handle property types and preserve existing IDs or generate new ones
				if (importedTemplate.properties) {
					importedTemplate.properties = await Promise.all(importedTemplate.properties.map(async (prop: any) => {
						console.log('Processing property:', prop);
						// Add or update the property type
						await addPropertyType(prop.name, prop.type || 'text', prop.value || '');
						
						// Use the type from generalSettings, which will be either the existing type or the newly added one
						const type = generalSettings.propertyTypes.find(pt => pt.name === prop.name)?.type || 'text';
						console.log(`Property ${prop.name} type after processing:`, type);
						return {
							id: prop.id || (Date.now().toString() + Math.random().toString(36).slice(2, 9)),
							name: prop.name,
							value: prop.value,
							type: type
						};
					}));
				}

				console.log('Processed template properties:', importedTemplate.properties);

				// Keep the context if it exists in the imported template
				if (importedTemplate.context) {
					importedTemplate.context = importedTemplate.context;
				}

				let newName = importedTemplate.name as string;
				let counter = 1;
				while (templates.some(t => t.name === newName)) {
					newName = `${importedTemplate.name} (${counter++})`;
				}
				importedTemplate.name = newName;

				console.log('Final imported template:', importedTemplate);
				templates.unshift(importedTemplate as Template);

				saveTemplateSettings();
				updateTemplateList();
				showTemplateEditor(importedTemplate as Template);
				hideModal(document.getElementById('import-modal'));
			} catch (error) {
				console.error('Error parsing imported template:', error);
				alert(getMessage('failedToImportTemplate'));
			}
		};
		reader.readAsText(file);
	};

	if (input.files && input.files.length > 0) {
		handleFile(input.files[0]);
	} else {
		input.onchange = (event: Event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			if (file) {
				handleFile(file);
			}
		};
		input.click();
	}
}

function validateImportedTemplate(template: Partial<Template>): boolean {
	const requiredFields: (keyof Template)[] = ['name', 'behavior', 'properties', 'noteContentFormat'];
	const validTypes = ['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'];
	
	const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';

	const hasRequiredFields = requiredFields.every(field => template.hasOwnProperty(field));
	const hasValidProperties = Array.isArray(template.properties) &&
		template.properties!.every((prop: any) => 
			prop.hasOwnProperty('name') && 
			prop.hasOwnProperty('value') && 
			(!prop.hasOwnProperty('type') || validTypes.includes(prop.type))
		);

	// Check for noteNameFormat and path only if it's not a daily note template
	const hasValidNoteNameAndPath = isDailyNote || (template.hasOwnProperty('noteNameFormat') && template.hasOwnProperty('path'));

	// Add optional check for context
	const hasValidContext = !template.context || typeof template.context === 'string';

	return hasRequiredFields && hasValidProperties && hasValidNoteNameAndPath && hasValidContext;
}

function preventDefaults(e: Event): void {
	e.preventDefault();
	e.stopPropagation();
}

function handleDrop(e: DragEvent): void {
	const dt = e.dataTransfer;
	const files = dt?.files;

	if (files && files.length) {
		handleFiles(files);
	}
}

function handleFiles(files: FileList): void {
	Array.from(files).forEach(importTemplateFile);
}

async function processImportedTemplate(importedTemplate: Partial<Template>): Promise<Template> {
	console.log('Processing imported template:', importedTemplate);

	if (!validateImportedTemplate(importedTemplate)) {
		throw new Error('Invalid template file');
	}

	importedTemplate.id = Date.now().toString() + Math.random().toString(36).slice(2, 9);
	
	// Process property types
	if (importedTemplate.properties) {
		console.log('Processing properties:', importedTemplate.properties);
		for (const prop of importedTemplate.properties) {
			console.log(`Processing property: ${prop.name}, type: ${prop.type || 'text'}, value: ${prop.value}`);
			const existingPropertyType = generalSettings.propertyTypes.find(pt => pt.name === prop.name);
			if (!existingPropertyType) {
				// Only add the property type if it doesn't exist
				await addPropertyType(prop.name, prop.type || 'text', prop.value || '');
			} else {
				console.log(`Property type ${prop.name} already exists, keeping existing type: ${existingPropertyType.type}`);
			}
		}
		
		// Reassign properties with existing or new types
		importedTemplate.properties = importedTemplate.properties.map(prop => {
			const existingPropertyType = generalSettings.propertyTypes.find(pt => pt.name === prop.name);
			return {
				id: prop.id || (Date.now().toString() + Math.random().toString(36).slice(2, 9)),
				name: prop.name,
				value: prop.value,
				type: existingPropertyType ? existingPropertyType.type : (prop.type || 'text')
			};
		});
	}

	console.log('Processed template properties:', importedTemplate.properties);

	// Ensure unique name
	let newName = importedTemplate.name as string;
	let counter = 1;
	while (templates.some(t => t.name === newName)) {
		newName = `${importedTemplate.name} (${counter++})`;
	}
	importedTemplate.name = newName;

	console.log('Final imported template:', importedTemplate);
	return importedTemplate as Template;
}

export function importTemplateFile(file: File): void {
	const reader = new FileReader();
	reader.onload = async (e: ProgressEvent<FileReader>) => {
		try {
			console.log('Starting template import');
			const importedTemplate = JSON.parse(e.target?.result as string) as Partial<Template>;
			const processedTemplate = await processImportedTemplate(importedTemplate);
			
			templates.unshift(processedTemplate);
			await saveTemplateSettings();
			updateTemplateList();
			showTemplateEditor(processedTemplate);
			console.log('Template import completed');
		} catch (error) {
			console.error('Error parsing imported template:', error);
			alert(getMessage('failedToImportTemplate'));
		}
	};
	reader.readAsText(file);
}

export function showTemplateImportModal(): void {
	showImportModal(
		'import-modal',
		importTemplateFromJson,
		'.json',
		true,
		'importTemplate'
	);
}

async function importTemplateFromJson(jsonContent: string): Promise<void> {
	try {
		const importedTemplate = JSON.parse(jsonContent) as Partial<Template>;
		const processedTemplate = await processImportedTemplate(importedTemplate);
		
		templates.unshift(processedTemplate);
		await saveTemplateSettings();
		updateTemplateList();
		showTemplateEditor(processedTemplate);
	} catch (error) {
		console.error('Error parsing imported template:', error);
		throw new Error('Error importing template. Please check the file and try again.');
	}
}

export function copyTemplateToClipboard(template: Template): void {
	const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';

	const orderedTemplate: Partial<Template> & { schemaVersion: string } = {
		schemaVersion: SCHEMA_VERSION,
		name: template.name,
		behavior: template.behavior,
		noteContentFormat: template.noteContentFormat,
		properties: template.properties.map(({ name, value, type }) => ({
			name,
			value,
			type: type || generalSettings.propertyTypes.find(pt => pt.name === name)?.type || 'text'
		})),
		triggers: template.triggers,
	};

	// Only include noteNameFormat and path for non-daily note behaviors
	if (!isDailyNote) {
		orderedTemplate.noteNameFormat = template.noteNameFormat;
		orderedTemplate.path = template.path;
	}

	// Include context only if it has a value
	if (template.context) {
		orderedTemplate.context = template.context;
	}

	const jsonContent = JSON.stringify(orderedTemplate, null, 2);
	
	copyToClipboardWithFeedback(
		jsonContent,
		getMessage('templateCopied'),
		getMessage('templateCopyError')
	).then(success => {
		if (success) {
			alert(getMessage('templateCopied'));
		} else {
			alert(getMessage('templateCopyError'));
		}
	});
}

export async function exportAllSettings(): Promise<void> {
	console.log('Starting exportAllSettings function');
	try {
		console.log('Fetching all data from browser storage');
		const allData = await browser.storage.sync.get(null) as StorageData;
		console.log('All data fetched:', allData);

		// Create a copy of the data to modify
		const exportData: StorageData = { ...allData };

		// Decompress all templates
		const templateIds = exportData.template_list || [];
		for (const id of templateIds) {
			const key = `template_${id}`;
			if (exportData[key] && Array.isArray(exportData[key])) {
				try {
					// Join chunks and decompress
					const compressedData = (exportData[key] as string[]).join('');
					const decompressedData = decompressFromUTF16(compressedData);
					exportData[key] = JSON.parse(decompressedData);
				} catch (error) {
					console.error(`Failed to decompress template ${id}:`, error);
				}
			}
		}

		console.log('Data prepared for export:', exportData);
		const content = JSON.stringify(exportData, null, 2);
		console.log('Data stringified, length:', content.length);

		const fileName = 'obsidian-web-clipper-settings.json';

		await saveFile({
			content,
			fileName,
			mimeType: 'application/json',
			onError: (error) => console.error('Failed to export settings:', error)
		});

		console.log('Export completed successfully');
	} catch (error) {
		console.error('Error in exportAllSettings:', error);
		alert(getMessage('failedToExportSettings'));
	}
}

export function importAllSettings(): void {
	showImportModal(
		'import-modal',
		importAllSettingsFromJson,
		'.json',
		false,
		'importAllSettings'
	);
}

async function importAllSettingsFromJson(jsonContent: string): Promise<void> {
	try {
		const settings = JSON.parse(jsonContent) as StorageData;
		
		if (confirm(getMessage('confirmReplaceSettings'))) {
			// Create a copy of the settings to modify
			const importData: StorageData = { ...settings };
			
			// Compress all templates
			const templateIds = importData.template_list || [];
			for (const id of templateIds) {
				const key = `template_${id}`;
				if (importData[key]) {
					try {
						// Check if the data is already compressed (will be an array of strings)
						const isAlreadyCompressed = Array.isArray(importData[key]) && 
							importData[key].every((chunk: any) => typeof chunk === 'string');

						if (!isAlreadyCompressed) {
							// Compress the template data
							const templateStr = JSON.stringify(importData[key]);
							const compressedData = compressToUTF16(templateStr);
							
							// Split into chunks
							const chunks: string[] = [];
							const CHUNK_SIZE = 8000;
							for (let i = 0; i < compressedData.length; i += CHUNK_SIZE) {
								chunks.push(compressedData.slice(i, i + CHUNK_SIZE));
							}
							importData[key] = chunks;
						}
					} catch (error) {
						console.error(`Failed to process template ${id}:`, error);
					}
				}
			}

			await browser.storage.sync.clear();
			await browser.storage.sync.set(importData);
			await loadSettings();
			await loadTemplates();
			updateTemplateList();
			updatePropertyTypesList();
			alert(getMessage('settingsImportSuccess'));
		}
	} catch (error) {
		console.error('Error importing all settings:', error);
		throw new Error('Error importing settings. Please check the file and try again.');
	}
}