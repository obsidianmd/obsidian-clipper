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

export interface PromptVariable {
	key: string;
	prompt: string;
	filters?: string;
}

export interface PropertyType {
	name: string;
	type: string;
	defaultValue?: string;
}

export interface Provider {
	id: string;
	name: string;
	baseUrl: string;
	apiKey: string;
}

export interface Settings {
	vaults: string[];
	showMoreActionsButton: boolean;
	betaFeatures: boolean;
	legacyMode: boolean;
	silentOpen: boolean;
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
	stats: {
		addToObsidian: number;
		saveFile: number;
		copyToClipboard: number;
		share: number;
	};
	history: HistoryEntry[];
}

export interface ModelConfig {
	id: string;
	providerId: string;
	providerModelId: string;
	name: string;
	enabled: boolean;
}

export interface HistoryEntry {
	datetime: string;
	url: string;
	action: 'addToObsidian' | 'saveFile' | 'copyToClipboard' | 'share';
	title?: string;
	vault?: string;
	path?: string;
}
