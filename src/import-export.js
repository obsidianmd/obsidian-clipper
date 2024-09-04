import { templates, saveTemplateSettings, updateTemplateList, showTemplateEditor } from './template-manager.js';

export function exportTemplate() {
	if (editingTemplateIndex === -1) {
		alert('Please select a template to export.');
		return;
	}

	const template = templates[editingTemplateIndex];
	const noteName = `${template.name}.obsidian-clipper.json`;

	const orderedTemplate = {
		name: template.name,
		behavior: template.behavior,
		noteNameFormat: template.noteNameFormat,
		path: template.path,
		noteContentFormat: template.noteContentFormat,
		properties: template.properties,
		urlPatterns: template.urlPatterns,
	};

	const jsonContent = JSON.stringify(orderedTemplate, null, 2);

	const blob = new Blob([jsonContent], { type: 'application/json' });
	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');
	a.href = url;
	a.download = noteName;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function importTemplate() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.json';

	input.onchange = (event) => {
		const file = event.target.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					let importedTemplate = JSON.parse(e.target.result);
					if (validateImportedTemplate(importedTemplate)) {
						// Assign a new ID if the imported template doesn't have one
						if (!importedTemplate.id) {
							importedTemplate.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
						}

						// Check if a template with the same name already exists
						const existingIndex = templates.findIndex(t => t.name === importedTemplate.name);
						if (existingIndex !== -1) {
							if (confirm(`A template named "${importedTemplate.name}" already exists. Do you want to replace it?`)) {
								templates[existingIndex] = importedTemplate;
							} else {
								// Append a number to the template name to make it unique
								let newName = importedTemplate.name;
								let counter = 1;
								while (templates.some(t => t.name === newName)) {
									newName = `${importedTemplate.name} (${counter})`;
									counter++;
								}
								importedTemplate.name = newName;
								templates.push(importedTemplate);
							}
						} else {
							templates.push(importedTemplate);
						}
						saveTemplateSettings();
						updateTemplateList();
						showTemplateEditor(importedTemplate);
						alert('Template imported successfully!');
					} else {
						alert('Invalid template file. Please check the file format and try again.');
					}
				} catch (error) {
					console.error('Error parsing imported template:', error);
					alert('Error importing template. Please check the file and try again.');
				}
			};
			reader.readAsText(file);
		}
	};

	input.click();
}

function validateImportedTemplate(template) {
	const requiredFields = ['name', 'behavior', 'path', 'properties', 'noteContentFormat'];
	const validTypes = ['text', 'multitext', 'number', 'checkbox', 'date', 'datetime'];
	return requiredFields.every(field => template.hasOwnProperty(field)) &&
		Array.isArray(template.properties) &&
		template.properties.every(prop => 
			prop.hasOwnProperty('name') && 
			prop.hasOwnProperty('value') && 
			prop.hasOwnProperty('type') &&
			validTypes.includes(prop.type)
		);
}