import { Template, Property, PropertyType } from '../types/types';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import browser from '../utils/browser-polyfill';
import { generalSettings } from '../utils/storage-utils';
import { addPropertyType } from './property-types-manager';
import { getMessage } from '../utils/i18n';

export let templates: Template[] = [];
export let editingTemplateIndex = -1;

const STORAGE_KEY_PREFIX = 'template_';
const LOCAL_STORAGE_KEY_PREFIX = 'template_local_';
const TEMPLATE_LIST_KEY = 'template_list';
const LOCAL_TEMPLATE_LIST_KEY = 'template_local_list';
const CHUNK_SIZE = 8000;
const LOCAL_CHUNK_SIZE = 1500000;
const SYNC_SIZE_LIMIT = 7000;
const SIZE_WARNING_THRESHOLD = 6000;
const LOCAL_SIZE_WARNING_THRESHOLD = 800000;

export function setEditingTemplateIndex(index: number): void {
	editingTemplateIndex = index;
}

export async function loadTemplates(): Promise<Template[]> {
	try {
		const syncData = await browser.storage.sync.get([TEMPLATE_LIST_KEY, LOCAL_TEMPLATE_LIST_KEY]);
		const syncTemplateIds = syncData[TEMPLATE_LIST_KEY] as string[] || [];
		let localTemplateIds = syncData[LOCAL_TEMPLATE_LIST_KEY] as string[] || [];

		// Fallback: if local template list is missing from sync, check local storage
		if (localTemplateIds.length === 0) {
			try {
				const localData = await browser.storage.local.get([LOCAL_TEMPLATE_LIST_KEY]);
				localTemplateIds = localData[LOCAL_TEMPLATE_LIST_KEY] as string[] || [];
			} catch (error) {
				console.warn('Failed to load local template list from local storage:', error);
			}
		}

		// Filter out any null or undefined values
		const filteredSyncIds = syncTemplateIds.filter(id => id != null);
		const filteredLocalIds = localTemplateIds.filter(id => id != null);

		const loadedTemplates: Template[] = [];

		// Load sync templates
		if (filteredSyncIds.length > 0) {
			const syncTemplates = await Promise.all(filteredSyncIds.map(async (id: string) => {
				try {
					const result = await browser.storage.sync.get(`template_${id}`);
					const compressedChunks = result[`template_${id}`] as string[];
					if (compressedChunks) {
						const decompressedData = decompressFromUTF16(compressedChunks.join(''));
						const template = JSON.parse(decompressedData);
						if (template && Array.isArray(template.properties)) {
							template.isLocalOnly = false;
							return template;
						}
					}
					console.warn(`Sync template ${id} is invalid or missing`);
					return null;
				} catch (error) {
					console.error(`Error parsing sync template ${id}:`, error);
					return null;
				}
			}));
			loadedTemplates.push(...syncTemplates.filter((t: Template | null): t is Template => t !== null));
		}

		// Load local templates
		if (filteredLocalIds.length > 0) {
			const localTemplates = await Promise.all(filteredLocalIds.map(async (id: string) => {
				try {
					const result = await browser.storage.local.get(`template_local_${id}`);
					const compressedChunks = result[`template_local_${id}`] as string[];
					if (compressedChunks) {
						const decompressedData = decompressFromUTF16(compressedChunks.join(''));
						const template = JSON.parse(decompressedData);
						if (template && Array.isArray(template.properties)) {
							template.isLocalOnly = true;
							return template;
						}
					}
					console.warn(`Local template ${id} is invalid or missing`);
					return null;
				} catch (error) {
					console.error(`Error parsing local template ${id}:`, error);
					return null;
				}
			}));
			loadedTemplates.push(...localTemplates.filter((t: Template | null): t is Template => t !== null));
		}

		templates = loadedTemplates;

		if (templates.length === 0) {
			console.log('No valid templates found, creating default template');
			const defaultTemplate = createDefaultTemplate();
			templates = [defaultTemplate];
			await saveTemplateSettings();
		}

		// After loading templates, update global property types
		await updateGlobalPropertyTypes(templates);

		return templates;
	} catch (error) {
		console.error('Error loading templates:', error);
		const defaultTemplate = createDefaultTemplate();
		templates = [defaultTemplate];
		await saveTemplateSettings();
		return templates;
	}
}

export async function saveTemplateSettings(): Promise<string[]> {
	const syncTemplateIds: string[] = [];
	const localTemplateIds: string[] = [];
	const warnings: string[] = [];
	const syncTemplateChunks: { [key: string]: string[] } = {};
	const localTemplateChunks: { [key: string]: string[] } = {};

	for (const template of templates) {
		if (!template.noteNameFormat || template.noteNameFormat.trim() === '') {
			warnings.push(`Warning: Template "${template.name}" has an empty note name format. Using default "{{title}}".`);
			template.noteNameFormat = '{{title}}';
		}

		const [chunks, warning, useLocalStorage] = await prepareTemplateForSave(template);
		// Decide storage target
		if (useLocalStorage || template.isLocalOnly) {
			// Save to local storage and ensure any old sync copy is removed
			localTemplateChunks[LOCAL_STORAGE_KEY_PREFIX + template.id] = chunks;
			localTemplateIds.push(template.id);
			try {
				await browser.storage.sync.remove(`template_${template.id}`);
			} catch (error) {
				console.warn(`Failed to remove sync version of template ${template.id}:`, error);
			}
		} else {
			// Save to sync storage and ensure any old local copy is removed
			syncTemplateChunks[STORAGE_KEY_PREFIX + template.id] = chunks;
			syncTemplateIds.push(template.id);
			try {
				await browser.storage.local.remove(`template_local_${template.id}`);
			} catch (error) {
				console.warn(`Failed to remove local version of template ${template.id}:`, error);
			}
			// Ensure flag is false when saved to sync
			template.isLocalOnly = false;
		}
		if (warning) {
			warnings.push(warning);
		}
	}

	try {
		// Save sync templates and both template lists (always write lists to avoid stale data)
		await browser.storage.sync.set({
			...syncTemplateChunks,
			[TEMPLATE_LIST_KEY]: syncTemplateIds,
			[LOCAL_TEMPLATE_LIST_KEY]: localTemplateIds
		});

		// Save local templates separately
		if (Object.keys(localTemplateChunks).length > 0) {
			await browser.storage.local.set(localTemplateChunks);
		}
		
		console.log('Template settings saved');
		return warnings;
	} catch (error) {
		console.error('Error saving templates:', error);
		throw error;
	}
}

async function prepareTemplateForSave(template: Template): Promise<[string[], string | null, boolean]> {
	// Ensure isLocalOnly property is preserved during serialization
	const templateToSave = { ...template };
	if (template.isLocalOnly) {
		templateToSave.isLocalOnly = true;
	}
	const compressedData = compressToUTF16(JSON.stringify(templateToSave));
	const useLocalStorage = compressedData.length > SYNC_SIZE_LIMIT;
	const chunkSize = useLocalStorage ? LOCAL_CHUNK_SIZE : CHUNK_SIZE;
	const chunks = [];
	for (let i = 0; i < compressedData.length; i += chunkSize) {
		chunks.push(compressedData.slice(i, i + chunkSize));
	}

	// Check if the template size is approaching the limit
	let warning = null;
	if (useLocalStorage) {
		if (compressedData.length > LOCAL_SIZE_WARNING_THRESHOLD) {
			warning = `Warning: Template "${template.name}" (${(compressedData.length / 1024).toFixed(2)}KB) is very large and stored locally.`;
		} else {
			warning = `Info: Template "${template.name}" (${(compressedData.length / 1024).toFixed(2)}KB) is stored locally and won't sync across devices.`;
		}
	} else if (compressedData.length > SIZE_WARNING_THRESHOLD) {
		warning = `Warning: Template "${template.name}" is ${(compressedData.length / 1024).toFixed(2)}KB, approaching sync storage limit.`;
	}
	return [chunks, warning, useLocalStorage];
}

export function createDefaultTemplate(): Template {
	return {
		id: Date.now().toString() + Math.random().toString(36).slice(2, 11),
		name: getMessage('defaultTemplateName'),
		behavior: 'create',
		noteNameFormat: '{{title}}',
		path: 'Clippings',
		noteContentFormat: '{{content}}',
		context: "",
		isLocalOnly: false,
		properties: [
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'title', value: '{{title}}' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'source', value: '{{url}}' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'author', value: '{{author|split:", "|wikilink|join}}' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'published', value: '{{published}}' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'created', value: '{{date}}' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'description', value: '{{description}}' },
			{ id: Date.now().toString() + Math.random().toString(36).slice(2, 11), name: 'tags', value: 'clippings' }
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

export async function deleteTemplate(templateId: string): Promise<boolean> {
	const index = templates.findIndex(t => t.id === templateId);
	console.log('Deleting template:', templateId);
	if (index !== -1) {
		const template = templates[index];
		const isLocalOnly = template.isLocalOnly;
		
		// Remove from the templates array
		templates.splice(index, 1);
		setEditingTemplateIndex(-1);

		try {
			// Remove both copies to be safe (handles forced-local cases)
			await browser.storage.local.remove(`template_local_${templateId}`);
			await browser.storage.sync.remove(`template_${templateId}`);

			// Update both template lists in sync storage
			const syncData = await browser.storage.sync.get([TEMPLATE_LIST_KEY, LOCAL_TEMPLATE_LIST_KEY]);
			let localTemplateIds = (syncData[LOCAL_TEMPLATE_LIST_KEY] as string[] || []).filter(id => id !== templateId);
			let templateIds = (syncData[TEMPLATE_LIST_KEY] as string[] || []).filter(id => id !== templateId);
			await browser.storage.sync.set({ [LOCAL_TEMPLATE_LIST_KEY]: localTemplateIds, [TEMPLATE_LIST_KEY]: templateIds });

			console.log(`Template ${templateId} deleted successfully`);
			return true;
		} catch (error) {
			console.log('Error deleting template:', error);
			return false;
		}
	}
	console.log('Error deleting template');
	return false;
}

async function updateGlobalPropertyTypes(templates: Template[]): Promise<void> {
	const existingTypes = new Set(generalSettings.propertyTypes.map(p => p.name));
	const newTypes: PropertyType[] = [];

	const defaultTypes: { [key: string]: { type: string, defaultValue: string } } = {
		'title': { type: 'text', defaultValue: '{{title}}' },
		'source': { type: 'text', defaultValue: '{{url}}' },
		'author': { type: 'multitext', defaultValue: '{{author|split:", "|wikilink|join}}' },
		'published': { type: 'date', defaultValue: '{{published}}' },
		'created': { type: 'date', defaultValue: '{{date}}' },
		'description': { type: 'text', defaultValue: '{{description}}' },
		'tags': { type: 'multitext', defaultValue: 'clippings' }
	};

	templates.forEach(template => {
		template.properties.forEach(property => {
			if (!existingTypes.has(property.name)) {
				const defaultType = defaultTypes[property.name] || { type: 'text', defaultValue: '' };
				newTypes.push({ 
					name: property.name, 
					type: defaultType.type,
					defaultValue: defaultType.defaultValue
				});
				existingTypes.add(property.name);
			}
		});
	});

	for (const newType of newTypes) {
		await addPropertyType(newType.name, newType.type, newType.defaultValue);
	}
}

export async function rebuildTemplateList(): Promise<void> {
	try {
		// Get all items in storage
		const allItems = await browser.storage.sync.get(null);
		
		// Filter for template keys and extract IDs
		const templateIds = Object.keys(allItems)
			.filter(key => key.startsWith('template_') && key !== 'template_list')
			.map(key => key.replace('template_', ''));

		console.log('Found template IDs:', templateIds);

		// Update the template_list in storage
		await browser.storage.sync.set({ 'template_list': templateIds });

		console.log('Template list rebuilt successfully');

		// Reload templates
		templates = await loadTemplates();

		console.log('Templates reloaded:', templates);
	} catch (error) {
		console.error('Error rebuilding template list:', error);
	}
}

export async function cleanupTemplateStorage(): Promise<void> {
	await rebuildTemplateList();
	await loadTemplates();
	console.log('Template storage cleaned up and rebuilt');
}
