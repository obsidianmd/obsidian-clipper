/**
 * AI SDK types for the Obsidian Web Clipper interpreter
 */

/**
 * Supported provider types that map to AI SDK implementations
 */
export type SupportedProvider =
	| 'openai'            // api.openai.com (chat/completions API)
	| 'openai-responses'  // OpenAI responses API (v1/responses)
	| 'anthropic'         // api.anthropic.com (v1/messages API)
	| 'google'            // generativelanguage.googleapis.com
	| 'azure'             // *.openai.azure.com
	| 'openai-compatible'; // DeepSeek, Perplexity, OpenRouter, xAI, Meta, Ollama, etc.

/**
 * Array of all valid provider types for runtime validation
 */
export const SUPPORTED_PROVIDERS: readonly SupportedProvider[] = [
	'openai',
	'openai-responses',
	'anthropic',
	'google',
	'azure',
	'openai-compatible'
] as const;

/**
 * Check if a value is a valid SupportedProvider type
 */
export function isSupportedProvider(value: unknown): value is SupportedProvider {
	return typeof value === 'string' && SUPPORTED_PROVIDERS.includes(value as SupportedProvider);
}

/**
 * Model capabilities from models.dev API
 */
export interface ModelCapabilities {
	id: string;
	name: string;
	provider: string;
	tool_call: boolean;
	reasoning: boolean;
	temperature: boolean;
	attachment: boolean;
	modalities: {
		input: ('text' | 'image' | 'pdf' | 'audio')[];
		output: ('text' | 'image' | 'audio')[];
	};
	limit: {
		context: number;
		output: number;
	};
	cost?: {
		input: number;  // Cost per million tokens
		output: number; // Cost per million tokens
	};
}

/**
 * Provider info from models.dev API
 */
export interface ProviderInfo {
	id: string;
	name: string;
	env: string[];
	npm: string;
}

/**
 * Raw models.dev API response structure
 */
export interface ModelsDevApiResponse {
	[providerId: string]: {
		id: string;
		name: string;
		env?: string[];
		npm?: string;
		api?: string;  // Base API URL from models.dev
		doc?: string;  // Documentation URL from models.dev
		models: {
			[modelId: string]: {
				id: string;
				name: string;
				tool_call?: boolean;
				reasoning?: boolean;
				temperature?: boolean;
				attachment?: boolean;
				modalities?: {
					input?: string[];
					output?: string[];
				};
				limit?: {
					context?: number;
					output?: number;
				};
				cost?: {
					input?: number;
					output?: number;
				};
			};
		};
	};
}

/**
 * Cached registry data structure
 */
export interface CachedRegistryData {
	data: ModelsDevApiResponse;
	timestamp: number;
}

/**
 * Provider configuration for creating AI SDK instances
 */
export interface ProviderConfig {
	type: SupportedProvider;
	apiKey: string;
	baseUrl?: string;
	headers?: Record<string, string>;
}

/**
 * Extended Provider interface with explicit type field
 */
export interface AIProvider {
	id: string;
	name: string;
	type: SupportedProvider;
	baseUrl: string;
	apiKey: string;
	apiKeyRequired: boolean;
	headers?: Record<string, string>;
	presetId?: string;
}

/**
 * Extended ModelConfig with cached capabilities
 */
export interface AIModelConfig {
	id: string;
	providerId: string;
	providerModelId: string;
	name: string;
	enabled: boolean;
	capabilities?: {
		contextWindow: number;
		maxOutput: number;
		supportsVision: boolean;
		supportsToolCalls: boolean;
	};
}

/**
 * Usage information from AI SDK response
 */
export interface UsageInfo {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	estimatedCost?: {
		input: number;   // Cost in USD
		output: number;
		total: number;
	};
}

/**
 * Possible response value types based on Obsidian property types
 */
export type PromptResponseValue = string | number | boolean | string[];

/**
 * A single prompt response from the interpreter
 */
export interface PromptResponse {
	key: string;
	prompt: string;
	user_response: PromptResponseValue;
}

/**
 * Result from interpreter service
 */
export interface InterpreterResult {
	promptResponses: PromptResponse[];
	usage?: UsageInfo;
}

/**
 * Obsidian property types for schema generation
 */
export type ObsidianPropertyType = 'text' | 'multitext' | 'number' | 'checkbox' | 'date' | 'datetime';

/**
 * Location of a prompt variable in the template structure
 */
export type PromptLocation = 'note_name' | 'properties' | 'note_content';

/**
 * Reasoning effort level for models that support extended thinking
 */
export type ReasoningEffort = 'low' | 'medium' | 'high';

/**
 * Model-specific settings passed to the interpreter
 */
export interface ModelSettings {
	/** Temperature for response randomness (0-2) */
	temperature?: number;
	/** Maximum output tokens */
	maxTokens?: number;
	/** Enable extended thinking/reasoning */
	reasoningEnabled?: boolean;
	/** Reasoning effort level */
	reasoningEffort?: ReasoningEffort;
}

/**
 * Options for the interpreter service
 */
export interface InterpreterOptions {
	/** The models.dev provider ID (e.g., "openai", "anthropic", "google") */
	providerId: string;
	providerModelId: string;
	apiKey: string;
	baseUrl?: string;
	providerType: SupportedProvider;
	promptVariables: {
		key: string;
		prompt: string;
		filters?: string;
		/** Where in the template this prompt appears */
		location: PromptLocation;
		/** The property name this prompt is associated with (only for location='properties') */
		propertyName?: string;
		/** The Obsidian property type for appropriate Zod schema type */
		propertyType?: ObsidianPropertyType;
	}[];
	context: string;
	/** Model-specific settings */
	modelSettings?: ModelSettings;
	/** @deprecated Use modelSettings.maxTokens instead */
	maxTokens?: number;
	/** @deprecated Use modelSettings.temperature instead */
	temperature?: number;
}
