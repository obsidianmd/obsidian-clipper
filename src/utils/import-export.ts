import { Template, Property } from '../types/types';
import { templates, saveTemplateSettings, editingTemplateIndex } from '../managers/template-manager';
import { showTemplateEditor, updateTemplateList } from '../managers/template-ui';
import { sanitizeFileName } from './string-utils';
import { detectBrowser } from './browser-detection';
import { generalSettings } from '../utils/storage-utils';
import { addPropertyType } from '../managers/property-types-manager';

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
		properties: template.properties.map(({ name, value }) => {
			const type = generalSettings.propertyTypes.find(pt => pt.name === name)?.type || 'text';
			return { 
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

	if (isIOSBrowser) {
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

export function importTemplate(): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = async (e: ProgressEvent<FileReader>) => {
			try {
				const importedTemplate = JSON.parse(e.target?.result as string) as Partial<Template>;
				if (!validateImportedTemplate(importedTemplate)) {
					throw new Error('Invalid template file');
				}

				importedTemplate.id = Date.now().toString() + Math.random().toString(36).slice(2, 9);
				
				// Handle property types and preserve existing IDs or generate new ones
				if (importedTemplate.properties) {
					importedTemplate.properties = await Promise.all(importedTemplate.properties.map(async (prop: any) => {
						// Add or update the property type
						await addPropertyType(prop.name, prop.type || 'text');
						
						// Use the type from generalSettings, which will be either the existing type or the newly added one
						const type = generalSettings.propertyTypes.find(pt => pt.name === prop.name)?.type || 'text';
						return {
							id: prop.id || (Date.now().toString() + Math.random().toString(36).slice(2, 9)),
							name: prop.name,
							value: prop.value,
							type: type
						};
					}));
				}

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

				templates.unshift(importedTemplate as Template);

				saveTemplateSettings();
				updateTemplateList();
				showTemplateEditor(importedTemplate as Template);
			} catch (error) {
				console.error('Error parsing imported template:', error);
				alert('Error importing template. Please check the file and try again.');
			}
		};
		reader.readAsText(file);
	};

	input.click();
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

export function initializeDropZone(): void {
	const dropZone = document.getElementById('template-drop-zone');
	const body = document.body;

	if (!dropZone) {
		console.error('Drop zone not found');
		return;
	}

	let dragCounter = 0;

	body.addEventListener('dragenter', handleDragEnter, false);
	body.addEventListener('dragleave', handleDragLeave, false);
	body.addEventListener('dragover', handleDragOver, false);
	body.addEventListener('drop', handleDrop, false);

	function handleDragEnter(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
		dragCounter++;
		if (isFileDrag(e)) {
			dropZone?.classList.add('drag-over');
		}
	}

	function handleDragLeave(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
		dragCounter--;
		if (dragCounter === 0) {
			dropZone?.classList.remove('drag-over');
		}
	}

	function handleDragOver(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
	}

	function handleDrop(e: DragEvent): void {
		e.preventDefault();
		e.stopPropagation();
		dropZone?.classList.remove('drag-over');
		dragCounter = 0;
		
		if (isFileDrag(e)) {
			const files = e.dataTransfer?.files;
			if (files && files.length) {
				handleFiles(files);
			}
		}
	}

	function isFileDrag(e: DragEvent): boolean {
		if (e.dataTransfer?.types) {
			for (let i = 0; i < e.dataTransfer.types.length; i++) {
				if (e.dataTransfer.types[i] === "Files") {
					return true;
				}
			}
		}
		return false;
	}
}

function preventDefaults(e: Event): void {
	e.preventDefault();
	e.stopPropagation();
}

function highlight(e: Event): void {
	const dropZone = document.getElementById('template-drop-zone');
	dropZone?.classList.add('drag-over');
}

function unhighlight(e: Event): void {
	const dropZone = document.getElementById('template-drop-zone');
	dropZone?.classList.remove('drag-over');
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
	reader.onload = (e: ProgressEvent<FileReader>) => {
		try {
			const importedTemplate = JSON.parse(e.target?.result as string) as Partial<Template>;
			if (!validateImportedTemplate(importedTemplate)) {
				throw new Error('Invalid template file');
			}

			importedTemplate.id = Date.now().toString() + Math.random().toString(36).slice(2, 9);
			
			// Assign new IDs to properties
			importedTemplate.properties = importedTemplate.properties?.map(prop => ({
				...prop,
				id: Date.now().toString() + Math.random().toString(36).slice(2, 9)
			}));

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

			templates.unshift(importedTemplate as Template);

			saveTemplateSettings();
			updateTemplateList();
			showTemplateEditor(importedTemplate as Template);
		} catch (error) {
			console.error('Error parsing imported template:', error);
			alert('Error importing template. Please check the file and try again.');
		}
	};
	reader.readAsText(file);
}