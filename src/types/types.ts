export interface Template {
	id: string;
	name: string;
	behavior: 'create' | 'append-specific' | 'append-daily' | 'prepend-specific' | 'prepend-daily' | 'overwrite';
	noteNameFormat: string;
	path: string;
	noteContentFormat: string;
	properties: Property[];
	triggers?: string[];
	vault?: string;
	context?: string;
}

export interface Property {
	id?: string;
	name: string;
	value: string;
	type?: string;
}

export interface ExtractedContent {
	[key: string]: string;
}

export type FilterFunction = (value: string, param?: string) => string | any[];

/**
 * Obsidian property types that map to different Zod schema types
 */
export type ObsidianPropertyType = 'text' | 'multitext' | 'number' | 'checkbox' | 'date' | 'datetime';

/**
 * Location of a prompt variable in the template structure
 * - note_name: In the note name/filename field
 * - properties: In a property value
 * - note_content: In the note body/content
 */
export type PromptLocation = 'note_name' | 'properties' | 'note_content';

export interface PromptVariable {
	key: string;
	prompt: string;
	filters?: string;
	/** Where in the template this prompt appears */
	location: PromptLocation;
	/** The property name this prompt is associated with (only for location='properties') */
	propertyName?: string;
	/** The Obsidian property type (text, multitext, number, checkbox, date, datetime) */
	propertyType?: ObsidianPropertyType;
}

export interface PropertyType {
	name: string;
	type: string;
	defaultValue?: string;
}

import type { SupportedProvider } from '../ai-sdk/types';

export interface Provider {
	id: string;
	name: string;
	type?: SupportedProvider;  // Optional for backwards compatibility; auto-detected if not set
	baseUrl: string;
	apiKey: string;
	apiKeyRequired?: boolean;
	presetId?: string;
}

export interface Rating {
	rating: number;
	date: string;
}

export type SaveBehavior = 'addToObsidian' | 'saveFile' | 'copyToClipboard';

export interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	maxWidth: number;
	theme: 'default' | 'flexoki';
	themeMode: 'auto' | 'light' | 'dark';
}

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	legacyMode: boolean;
	silentOpen: boolean;
	openBehavior: 'popup' | 'embedded';
	highlighterEnabled: boolean;
	alwaysShowHighlights: boolean;
	highlightBehavior: string;
	interpreterModel?: string;
	models: ModelConfig[];
	providers: Provider[];
	interpreterEnabled: boolean;
	interpreterAutoRun: boolean;
	defaultPromptContext: string;
	propertyTypes: PropertyType[];
	readerSettings: ReaderSettings;
	stats: {
		addToObsidian: number;
		saveFile: number;
		copyToClipboard: number;
		share: number;
	};
	history: HistoryEntry[];
	ratings: Rating[];
	saveBehavior: 'addToObsidian' | 'saveFile' | 'copyToClipboard';
}

/**
 * Reasoning effort level for models that support extended thinking
 * - OpenAI o1/o3/GPT-5: 'low' | 'medium' | 'high'
 * - Anthropic Claude: maps to budgetTokens
 * - Google Gemini: 'low' | 'high'
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/**
 * Model-specific settings that can be configured per model
 * These settings are applied when calling the LLM
 */
export interface ModelSettings {
	/** Temperature for response randomness (0-2, default varies by model) */
	temperature?: number;
	/** Maximum output tokens (capped by model's limit) */
	maxTokens?: number;
	/** Enable extended thinking/reasoning for supported models */
	reasoningEnabled?: boolean;
	/** Reasoning effort level when reasoning is enabled */
	reasoningEffort?: ReasoningEffort;
}

export interface ModelConfig {
	id: string;
	providerId: string;
	providerModelId: string;
	name: string;
	enabled: boolean;
	/** Model-specific settings (temperature, reasoning, etc.) */
	settings?: ModelSettings;
	capabilities?: {
		contextWindow: number;
		maxOutput: number;
		supportsVision: boolean;
		supportsToolCalls: boolean;
	};
}

export interface HistoryEntry {
	datetime: string;
	url: string;
	action: 'addToObsidian' | 'saveFile' | 'copyToClipboard' | 'share';
	title?: string;
	vault?: string;
	path?: string;
}

export interface ConversationMessage {
	author: string;
	content: string;
	timestamp?: string;
	metadata?: Record<string, any>;
}

export interface ConversationMetadata {
	title?: string;
	description?: string;
	site: string;
	url: string;
	messageCount: number;
	startTime?: string;
	endTime?: string;
}

export interface Footnote {
	url: string;
	text: string;
}
