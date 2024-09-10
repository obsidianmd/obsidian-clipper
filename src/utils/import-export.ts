import { Template, Property } from '../types/types';
import { templates, saveTemplateSettings, editingTemplateIndex } from '../managers/template-manager';
import { showTemplateEditor, updateTemplateList } from '../managers/template-ui';

const SCHEMA_VERSION = '0.1.0';

function toKebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[\s_]+/g, '-')
		.toLowerCase();
}

export function exportTemplate(): void {
	if (editingTemplateIndex === -1) {
		alert('Please select a template to export.');
		return;
	}

	const template = templates[editingTemplateIndex] as Template;
	const templateFile = `${toKebabCase(template.name)}-clipper.json`;

	const orderedTemplate: Partial<Template> & { schemaVersion: string } = {
		schemaVersion: SCHEMA_VERSION,
		name: template.name,
		behavior: template.behavior,
		noteNameFormat: template.noteNameFormat,
		path: template.path,
		noteContentFormat: template.noteContentFormat,
		properties: template.properties.map(({ name, value, type }) => ({ name, value, type })) as Property[],
		triggers: template.triggers,
	};

	const jsonContent = JSON.stringify(orderedTemplate, null, 2);

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

export function importTemplate(): void {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (event: Event) => {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e: ProgressEvent<FileReader>) => {
			try {
				const importedTemplate = JSON.parse(e.target?.result as string) as Partial<Template>;
				if (!validateImportedTemplate(importedTemplate)) {
					throw new Error('Invalid template file');
				}

				importedTemplate.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
				
				// Assign new IDs to properties
				importedTemplate.properties = importedTemplate.properties?.map(prop => ({
					...prop,
					id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
				}));

				let newName = importedTemplate.name as string;
				let counter = 1;
				while (templates.some(t => t.name === newName)) {
					newName = `${importedTemplate.name} (${counter++})`;
				}
				importedTemplate.name = newName;
				templates.push(importedTemplate as Template);

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
	const requiredFields: (keyof Template)[] = ['name', 'behavior', 'path', 'properties', 'noteContentFormat'];
	const validTypes = ['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'];
	return requiredFields.every(field => template.hasOwnProperty(field)) &&
		Array.isArray(template.properties) &&
		template.properties!.every(prop => 
			prop.hasOwnProperty('name') && 
			prop.hasOwnProperty('value') && 
			prop.hasOwnProperty('type') &&
			validTypes.includes(prop.type)
		);
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

			importedTemplate.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
			
			// Assign new IDs to properties
			importedTemplate.properties = importedTemplate.properties?.map(prop => ({
				...prop,
				id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
			}));

			let newName = importedTemplate.name as string;
			let counter = 1;
			while (templates.some(t => t.name === newName)) {
				newName = `${importedTemplate.name} (${counter++})`;
			}
			importedTemplate.name = newName;
			templates.push(importedTemplate as Template);

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
