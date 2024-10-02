import { Template, Property } from '../types/types';
import { templates, saveTemplateSettings, editingTemplateIndex } from '../managers/template-manager';
import { showTemplateEditor, updateTemplateList } from '../managers/template-ui';
import { sanitizeFileName } from './string-utils';
import { detectBrowser } from './browser-detection';
import { generalSettings } from '../utils/storage-utils';
import { addPropertyType } from '../managers/property-types-manager';
import { showModal, hideModal } from '../utils/modal-utils';
import { showImportModal as showGenericImportModal } from './import-modal';

const SCHEMA_VERSION = '0.1.0';

export async function exportTemplate(): Promise<void> {
	if (editingTemplateIndex === -1) {
		alert('Please select a template to export.');
		return;
	}

	const template = templates[editingTemplateIndex] as Template;
	const sanitizedName = sanitizeFileName(template.name);
	const templateFile = `${sanitizedName.replace(/\s+/g, '-').toLowerCase()}-clipper.json`;

	const isDailyNote = template.behavior === 'append-daily' || template.behavior === 'prepend-daily';

	const orderedTemplate: Partial<Template> & { schemaVersion: string } = {
		schemaVersion: SCHEMA_VERSION,
		name: template.name,
		behavior: template.behavior,
		noteContentFormat: template.noteContentFormat,
		properties: template.properties.map(({ id, name, value }) => {
			const type = generalSettings.propertyTypes.find(pt => pt.name === name)?.type || 'text';
			return { 
				id,
				name, 
				value, 
				type 
			};
		}),
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

	const jsonContent = JSON.stringify(orderedTemplate, null, '\t');

	const browser = await detectBrowser();
	const isIOSBrowser = browser === 'mobile-safari' || browser === 'ipad-os';
	const isSafari = browser === 'safari';

	if (isIOSBrowser || isSafari) {
		// For iOS, create a Blob and use the Web Share API if available
		const blob = new Blob([jsonContent], { type: 'application/json' });
		const file = new File([blob], templateFile, { type: 'application/json' });

		if (navigator.share) {
			try {
				await navigator.share({
					files: [file],
					title: 'Exported template',
					text: 'Obsidian Web Clipper template'
				});
			} catch (error) {
				console.error('Error sharing:', error);
				// Fallback to opening in a new tab if sharing fails
				const dataUri = URL.createObjectURL(blob);
				window.open(dataUri, '_blank');
			}
		} else {
			// Fallback for older iOS versions
			const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonContent)}`;
			window.open(dataUri, '_blank');
		}
	} else {
		// For other platforms, use Blob and URL.createObjectURL
		const blob = new Blob([jsonContent], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = templateFile;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
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
				alert('Error importing template. Please check the file and try again.');
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
			alert('Error importing template. Please check the file and try again.');
		}
	};
	reader.readAsText(file);
}

export function showTemplateImportModal(): void {
	showGenericImportModal(
		'generic-import-modal',
		importTemplateFromJson,
		'.json',
		'Drag and drop template file here',
		'Paste template JSON here',
		true
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
	const { id, ...templateCopy } = template;

	const jsonContent = JSON.stringify(templateCopy, null, 2);
	
	navigator.clipboard.writeText(jsonContent).then(() => {
		alert('Template JSON copied to clipboard');
	}).catch(err => {
		console.error('Failed to copy template JSON: ', err);
		alert('Failed to copy template JSON to clipboard');
	});
}
