import { compressToUTF16, decompressFromUTF16 } from 'lz-string';
import browser from '../../utils/browser-polyfill';
import type { Template } from '../../types/types';
import type { StorageArea } from '../storage-area';
import {
	SYNC_SCHEMA_VERSION,
	type SyncPayload,
	type SyncProvider,
	type SyncSaveResult,
	type SyncSettings,
	type SyncStatus,
} from '../types';

const STORAGE_KEY_PREFIX = 'template_';
const TEMPLATE_LIST_KEY = 'template_list';
const METADATA_KEY = 'sync_metadata';
const CHUNK_SIZE = 8000;
const SIZE_WARNING_THRESHOLD = 6000;

interface BrowserSyncMetadata {
	schemaVersion?: number;
	updatedAt?: string;
}

export class BrowserSyncProvider implements SyncProvider {
	readonly id = 'browser';
	readonly name = 'Browser sync';

	constructor(private readonly storage: StorageArea = browser.storage.sync as StorageArea) {}

	async load(): Promise<SyncPayload | null> {
		const data = await this.storage.get(null);
		return browserStorageDataToPayload(data);
	}

	async save(payload: SyncPayload, previousPayload?: SyncPayload | null): Promise<SyncSaveResult> {
		const { items, warnings } = payloadToBrowserStorageData(payload);
		const currentItems = await this.storage.get(null);
		const changedItems = Object.fromEntries(
			Object.entries(items).filter(([key, value]) => !storageValuesEqual(currentItems[key], value)),
		);
		if (Object.keys(changedItems).length > 0) {
			await this.storage.set(changedItems);
		}

		const currentIds = new Set(payload.templates.map(template => template.id));
		const removedTemplateKeys = (previousPayload?.templates ?? [])
			.filter(template => !currentIds.has(template.id))
			.map(template => STORAGE_KEY_PREFIX + template.id);
		if (removedTemplateKeys.length > 0 && this.storage.remove) {
			await this.storage.remove(removedTemplateKeys);
		}
		return { warnings };
	}

	async getStatus(): Promise<SyncStatus> {
		return { connected: true, message: 'Managed by browser sync' };
	}

	async repair(): Promise<SyncPayload | null> {
		const data = await this.storage.get(null);
		const discoveredIds = Object.keys(data)
			.filter(key => key.startsWith(STORAGE_KEY_PREFIX) && key !== TEMPLATE_LIST_KEY)
			.map(key => key.slice(STORAGE_KEY_PREFIX.length));
		const payload = browserStorageDataToPayload(data, discoveredIds);
		if (payload) {
			await this.storage.set({ [TEMPLATE_LIST_KEY]: payload.templates.map(template => template.id) });
		}
		return payload;
	}
}

export function browserStorageDataToPayload(
	data: Record<string, unknown>,
	templateIdsOverride?: string[],
): SyncPayload | null {
	const metadata = asRecord(data[METADATA_KEY]) as BrowserSyncMetadata;
	const templateIds = (templateIdsOverride ?? (Array.isArray(data[TEMPLATE_LIST_KEY]) ? data[TEMPLATE_LIST_KEY] : []))
		.filter((id): id is string => typeof id === 'string');
	const templates = templateIds
		.map(id => decodeTemplate(data[STORAGE_KEY_PREFIX + id]))
		.filter((template): template is Template => template !== null);

	const settings = legacyDataToSettings(data);
	const hasData = Object.keys(settings).length > 0
		|| templates.length > 0
		|| TEMPLATE_LIST_KEY in data
		|| METADATA_KEY in data;
	if (!hasData) return null;

	return {
		schemaVersion: typeof metadata.schemaVersion === 'number' ? metadata.schemaVersion : SYNC_SCHEMA_VERSION,
		updatedAt: typeof metadata.updatedAt === 'string' ? metadata.updatedAt : new Date(0).toISOString(),
		settings,
		templates,
	};
}

export function payloadToBrowserStorageData(payload: SyncPayload): {
	items: Record<string, unknown>;
	warnings: string[];
} {
	const items: Record<string, unknown> = {
		...settingsToLegacyData(payload.settings),
		[TEMPLATE_LIST_KEY]: payload.templates.map(template => template.id),
		[METADATA_KEY]: {
			schemaVersion: payload.schemaVersion,
			updatedAt: payload.updatedAt,
		},
	};
	const warnings: string[] = [];

	for (const template of payload.templates) {
		const compressedData = compressToUTF16(JSON.stringify(template));
		const chunks: string[] = [];
		for (let i = 0; i < compressedData.length; i += CHUNK_SIZE) {
			chunks.push(compressedData.slice(i, i + CHUNK_SIZE));
		}
		items[STORAGE_KEY_PREFIX + template.id] = chunks;
		if (compressedData.length > SIZE_WARNING_THRESHOLD) {
			warnings.push(`Warning: Template "${template.name}" is ${(compressedData.length / 1024).toFixed(2)}KB, which is approaching the storage limit.`);
		}
	}

	return { items, warnings };
}

function decodeTemplate(value: unknown): Template | null {
	try {
		const parsed = Array.isArray(value) && value.every(chunk => typeof chunk === 'string')
			? JSON.parse(decompressFromUTF16(value.join('')))
			: value;
		return isTemplate(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isTemplate(value: unknown): value is Template {
	if (!value || typeof value !== 'object') return false;
	const template = value as Partial<Template>;
	return typeof template.id === 'string' && Array.isArray(template.properties);
}

function legacyDataToSettings(data: Record<string, unknown>): SyncSettings {
	const general = asRecord(data.general_settings);
	const highlighter = asRecord(data.highlighter_settings);
	const interpreter = asRecord(data.interpreter_settings);
	const reader = asRecord(data.reader_settings);
	const settings: SyncSettings = {};

	assignDefined(settings, {
		vaults: data.vaults,
		showMoreActionsButton: general.showMoreActionsButton,
		betaFeatures: general.betaFeatures,
		legacyMode: general.legacyMode,
		silentOpen: general.silentOpen,
		openBehavior: general.openBehavior,
		saveBehavior: general.saveBehavior,
		highlighterEnabled: highlighter.highlighterEnabled,
		alwaysShowHighlights: highlighter.alwaysShowHighlights,
		highlightBehavior: highlighter.highlightBehavior,
		interpreterModel: interpreter.interpreterModel,
		models: interpreter.models,
		providers: interpreter.providers,
		interpreterEnabled: interpreter.interpreterEnabled,
		interpreterAutoRun: interpreter.interpreterAutoRun,
		defaultPromptContext: interpreter.defaultPromptContext,
		propertyTypes: data.property_types,
	});
	if (Object.keys(reader).length > 0) settings.readerSettings = reader;
	const stats = asRecord(data.stats);
	if (Object.keys(stats).length > 0) settings.stats = stats;
	return settings;
}

function settingsToLegacyData(settings: SyncSettings): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	if (settings.vaults !== undefined) data.vaults = settings.vaults;
	const general = pickDefined(settings, [
		'showMoreActionsButton', 'betaFeatures', 'legacyMode', 'silentOpen', 'openBehavior', 'saveBehavior',
	]);
	if (Object.keys(general).length > 0) data.general_settings = general;
	const highlighter = pickDefined(settings, [
		'highlighterEnabled', 'alwaysShowHighlights', 'highlightBehavior',
	]);
	if (Object.keys(highlighter).length > 0) data.highlighter_settings = highlighter;
	const interpreter = pickDefined(settings, [
		'interpreterModel', 'models', 'providers', 'interpreterEnabled', 'interpreterAutoRun', 'defaultPromptContext',
	]);
	if (Object.keys(interpreter).length > 0) data.interpreter_settings = interpreter;
	if (settings.propertyTypes !== undefined) data.property_types = settings.propertyTypes;
	if (settings.readerSettings !== undefined) data.reader_settings = settings.readerSettings;
	if (settings.stats !== undefined) data.stats = settings.stats;
	return data;
}

function asRecord(value: unknown): Record<string, any> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? value as Record<string, any>
		: {};
}

function assignDefined(target: Record<string, unknown>, source: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) target[key] = value;
	}
}

function pickDefined(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const key of keys) {
		if (source[key] !== undefined) result[key] = source[key];
	}
	return result;
}

function storageValuesEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
