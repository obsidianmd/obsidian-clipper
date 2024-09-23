import { Template, Property } from '../types/types';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import browser from '../utils/browser-polyfill';

export let templates: Template[] = [];
export let editingTemplateIndex = -1;

const STORAGE_KEY_PREFIX = 'template_';
const TEMPLATE_LIST_KEY = 'template_list';
const CHUNK_SIZE = 8000;
const SIZE_WARNING_THRESHOLD = 6000;

export function setEditingTemplateIndex(index: number): void {
	editingTemplateIndex = index;
}

export async function loadTemplates(): Promise<Template[]> {
	try {
		const data = await browser.storage.sync.get(['template_list']);
		const templateIds = data.template_list || [];
		console.log('Template IDs loaded:', templateIds);

		if (templateIds.length === 0) {
			console.log('No template IDs found, creating default template');
			const defaultTemplate = createDefaultTemplate();
			templates = [defaultTemplate];
			await saveTemplateSettings();
			return templates;
		}

		const loadedTemplates = await Promise.all(templateIds.map(async (id: string) => {
			try {
				const result = await browser.storage.sync.get(`template_${id}`);
				const compressedChunks = result[`template_${id}`];
				if (compressedChunks) {
					const decompressedData = decompressFromUTF16(compressedChunks.join(''));
					const template = JSON.parse(decompressedData);
					if (template && Array.isArray(template.properties)) {
						return template;
					}
				}
				console.warn(`Template ${id} is invalid or missing`);
				return null;
			} catch (error) {
				console.error(`Error parsing template ${id}:`, error);
				return null;
			}
		}));

		templates = loadedTemplates.filter((t): t is Template => t !== null);
		console.log('Templates loaded:', templates);

		if (templates.length === 0) {
			console.log('No valid templates found, creating default template');
			const defaultTemplate = createDefaultTemplate();
			templates = [defaultTemplate];
			await saveTemplateSettings();
		}

		return templates;
	} catch (error) {
		console.error('Error loading templates:', error);
		// Instead of returning an empty array, create a default template
		const defaultTemplate = createDefaultTemplate();
		templates = [defaultTemplate];
		await saveTemplateSettings();
		return templates;
	}
}

async function loadTemplate(id: string): Promise<Template | null> {
	const data = await browser.storage.sync.get(STORAGE_KEY_PREFIX + id);
	const compressedChunks = data[STORAGE_KEY_PREFIX + id];
	if (compressedChunks) {
		const decompressedData = decompressFromUTF16(compressedChunks.join(''));
		return JSON.parse(decompressedData);
	}
	return null;
}

export async function saveTemplateSettings(): Promise<string[]> {
	const templateIds = templates.map(t => t.id);
	const warnings: string[] = [];
	const templateChunks: { [key: string]: string[] } = {};

	for (const template of templates) {
		if (!template.noteNameFormat || template.noteNameFormat.trim() === '') {
			warnings.push(`Warning: Template "${template.name}" has an empty note name format. Using default "{{title}}".`);
			template.noteNameFormat = '{{title}}';
		}

		const [chunks, warning] = await prepareTemplateForSave(template);
		templateChunks[STORAGE_KEY_PREFIX + template.id] = chunks;
		if (warning) {
			warnings.push(warning);
		}
	}

	try {
		await browser.storage.sync.set({ ...templateChunks, [TEMPLATE_LIST_KEY]: templateIds });
		console.log('Template settings saved');
		return warnings;
	} catch (error) {
		console.error('Error saving templates:', error);
		throw error;
	}
}

async function prepareTemplateForSave(template: Template): Promise<[string[], string | null]> {
	const compressedData = compressToUTF16(JSON.stringify(template));
	const chunks = [];
	for (let i = 0; i < compressedData.length; i += CHUNK_SIZE) {
		chunks.push(compressedData.slice(i, i + CHUNK_SIZE));
	}

	// Check if the template size is approaching the limit
	if (compressedData.length > SIZE_WARNING_THRESHOLD) {
		return [chunks, `Warning: Template "${template.name}" is ${(compressedData.length / 1024).toFixed(2)}KB, which is approaching the storage limit.`];
	}
	return [chunks, null];
}

export function createDefaultTemplate(): Template {
	return {
		id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
		name: 'Default',
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: 'Clippings',
		noteContentFormat: '{{content}}',
		context: "",
		properties: [
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'title', value: '{{title}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'source', value: '{{url}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'author', value: '{{author|split:", "|wikilink|join}}', type: 'multitext' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'published', value: '{{published}}', type: 'date' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'created', value: '{{date}}', type: 'date' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'description', value: '{{description}}', type: 'text' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'tags', value: 'clippings', type: 'multitext' }
		],
		triggers: []
	};
}

export function getEditingTemplateIndex(): number {
	return editingTemplateIndex;
}

export function getTemplates(): Template[] {
	return templates;
}

export function findTemplateById(id: string): Template | undefined {
	return templates.find(template => template.id === id);
}

export function duplicateTemplate(templateId: string): Template {
	const originalTemplate = templates.find(t => t.id === templateId);
	if (!originalTemplate) {
		throw new Error('Template not found');
	}

	const newTemplate: Template = JSON.parse(JSON.stringify(originalTemplate));
	newTemplate.id = Date.now().toString() + Math.random().toString(36).slice(2, 11);
	newTemplate.name = getUniqueTemplateName(originalTemplate.name);
	
	templates.unshift(newTemplate);
	return newTemplate;
}

function getUniqueTemplateName(baseName: string): string {
	const baseNameWithoutNumber = baseName.replace(/\s\d+$/, '');
	const existingNames = new Set(templates.map(t => t.name));
	let newName = baseNameWithoutNumber;
	let counter = 1;

	while (existingNames.has(newName)) {
		counter++;
		newName = `${baseNameWithoutNumber} ${counter}`;
	}

	return newName;
}

export function deleteTemplate(templateId: string): boolean {
	const index = templates.findIndex(t => t.id === templateId);
	if (index !== -1) {
		templates.splice(index, 1);
		setEditingTemplateIndex(-1);
		return true;
	}
	return false;
}

// Add this function if it's not already defined
async function saveTemplate(template: Template): Promise<void> {
	templates = [...templates.filter(t => t.id !== template.id), template];
	await saveTemplateSettings();
}
