import { Template, Property } from '../types/types';
import { templates, saveTemplateSettings, editingTemplateIndex } from '../managers/template-manager';
import { showTemplateEditor, updateTemplateList } from '../managers/template-ui';
import { sanitizeFileName } from './string-utils';
import { detectBrowser } from './browser-detection';
import { generalSettings } from '../utils/storage-utils';
import { addPropertyType } from '../managers/property-types-manager';
import { showModal, hideModal } from '../utils/modal-utils';

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

function importTemplateFile(file: File): void {
	const reader = new FileReader();
	reader.onload = async (e: ProgressEvent<FileReader>) => {
		try {
			console.log('Starting template import');
			const importedTemplate = JSON.parse(e.target?.result as string) as Partial<Template>;
			console.log('Parsed imported template:', importedTemplate);

			if (!validateImportedTemplate(importedTemplate)) {
				throw new Error('Invalid template file');
			}

			importedTemplate.id = Date.now().toString() + Math.random().toString(36).slice(2, 9);
			
			// Process property types immediately
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

			await saveTemplateSettings();
			updateTemplateList();
			showTemplateEditor(importedTemplate as Template);
			console.log('Template import completed');
		} catch (error) {
			console.error('Error parsing imported template:', error);
			alert('Error importing template. Please check the file and try again.');
		}
	};
	reader.readAsText(file);
}

export function showImportModal(): void {
	const modal = document.getElementById('import-modal');
	const dropZone = document.getElementById('import-drop-zone');
	const jsonTextarea = document.getElementById('import-json-textarea') as HTMLTextAreaElement | null;
	const cancelBtn = document.getElementById('import-cancel-btn');
	const confirmBtn = document.getElementById('import-confirm-btn');

	if (!modal || !dropZone || !jsonTextarea || !cancelBtn || !confirmBtn) {
		console.error('Import modal elements not found');
		return;
	}

	// Clear the textarea when showing the modal
	jsonTextarea.value = '';

	showModal(modal);

	dropZone.addEventListener('dragover', handleDragOver);
	dropZone.addEventListener('drop', handleDrop);
	dropZone.addEventListener('click', openFilePicker);
	cancelBtn.addEventListener('click', () => hideModal(modal));
	confirmBtn.addEventListener('click', () => {
		const jsonContent = jsonTextarea.value.trim();
		if (jsonContent) {
			importTemplateFromJson(jsonContent);
		}
		hideModal(modal);
	});

	function handleDragOver(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
	}

	function handleDrop(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFile(files[0]);
		}
	}

	function openFilePicker(): void {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = (event: Event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			if (file) {
				handleFile(file);
			}
		};
		input.click();
	}

	function handleFile(file: File): void {
		const reader = new FileReader();
		reader.onload = (event: ProgressEvent<FileReader>) => {
			const content = event.target?.result as string;
			if (jsonTextarea) {
				jsonTextarea.value = content;
			}
			importTemplateFromJson(content);
		};
		reader.readAsText(file);
	}
}

function importTemplateFromJson(jsonContent: string): void {
	const blob = new Blob([jsonContent], { type: 'application/json' });
	const file = new File([blob], 'imported-template.json', { type: 'application/json' });

	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(file);

	const input = document.createElement('input');
	input.type = 'file';
	input.files = dataTransfer.files;

	const event = new Event('change', { bubbles: true });
	input.dispatchEvent(event);

	importTemplate(input);
}