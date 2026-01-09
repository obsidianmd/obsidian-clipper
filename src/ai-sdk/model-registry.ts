/**
 * Model Registry - Fetches and caches model capabilities from models.dev API
 *
 * Fallback data is loaded from providers.json to avoid duplication.
 */

// Import zod-config first to ensure CSP-compatible mode is enabled
import "./zod-config";
import { z } from "zod";
import browser from "../utils/browser-polyfill";
import { debugLog } from "../utils/debug";
import {
	ModelCapabilities,
	ProviderInfo,
	ModelsDevApiResponse,
	CachedRegistryData,
} from "./types";
// Import providers.json for fallback data
import providersJson from "../../providers.json";

/**
 * Zod schema for models.dev API response validation
 * This ensures we gracefully handle malformed API responses
 */
const ModelSchema = z.object({
	id: z.string(),
	name: z.string(),
	tool_call: z.boolean().optional(),
	reasoning: z.boolean().optional(),
	temperature: z.boolean().optional(),
	attachment: z.boolean().optional(),
	modalities: z
		.object({
			input: z.array(z.string()).optional(),
			output: z.array(z.string()).optional(),
		})
		.optional(),
	limit: z
		.object({
			context: z.number().optional(),
			output: z.number().optional(),
		})
		.optional(),
	cost: z
		.object({
			input: z.number().optional(),
			output: z.number().optional(),
		})
		.optional(),
});

const ProviderSchema = z.object({
	id: z.string(),
	name: z.string(),
	env: z.array(z.string()).optional(),
	npm: z.string().optional(),
	api: z.string().optional(),
	doc: z.string().optional(),
	models: z.record(z.string(), ModelSchema),
});

const ModelsDevApiResponseSchema = z.record(z.string(), ProviderSchema);

const MODELS_DEV_API_URL = "https://models.dev/api.json";
const CACHE_KEY = "modelsDevCache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Default limits for unknown models (conservative values)
const DEFAULT_CONTEXT_LIMIT = 12800;
const DEFAULT_OUTPUT_LIMIT = 4096;

/**
 * Provider preset data from providers.json
 */
interface ProviderPreset {
	apiKeyUrl?: string;
	apiKeyRequired?: boolean;
	baseUrl?: string;
	fallbackModels?: Record<
		string,
		{
			name: string;
			tool_call?: boolean;
			reasoning?: boolean;
			temperature?: boolean;
			limit?: { context: number; output: number };
			cost?: { input: number; output: number };
		}
	>;
}

/**
 * Build fallback provider data from providers.json
 * This converts the compact providers.json format to ModelsDevApiResponse format
 */
function buildFallbackProviders(): ModelsDevApiResponse {
	const fallback: ModelsDevApiResponse = {};
	const presets = providersJson as Record<string, ProviderPreset>;

	for (const [providerId, preset] of Object.entries(presets)) {
		// Skip version and comment fields
		if (providerId === "version" || providerId === "_comment") continue;

		// Only include providers that have fallback models
		if (!preset.fallbackModels) continue;

		const models: Record<
			string,
			ModelsDevApiResponse[string]["models"][string]
		> = {};

		for (const [modelId, modelData] of Object.entries(
			preset.fallbackModels,
		)) {
			models[modelId] = {
				id: modelId,
				name: modelData.name,
				tool_call: modelData.tool_call ?? false,
				reasoning: modelData.reasoning ?? false,
				temperature: modelData.temperature ?? true,
				modalities: { input: ["text"], output: ["text"] },
				limit: modelData.limit ?? {
					context: DEFAULT_CONTEXT_LIMIT,
					output: DEFAULT_OUTPUT_LIMIT,
				},
				cost: modelData.cost,
			};
		}

		fallback[providerId] = {
			id: providerId,
			name: providerId.charAt(0).toUpperCase() + providerId.slice(1), // Capitalize
			models,
		};
	}

	debugLog("ModelRegistry", "Built fallback from providers.json", {
		providers: Object.keys(fallback).length,
	});

	return fallback;
}

let cachedData: ModelsDevApiResponse | null = null;
let cacheTimestamp: number = 0;
let fallbackProviders: ModelsDevApiResponse | null = null;

/**
 * Get fallback providers (lazy initialization)
 */
function getFallbackProviders(): ModelsDevApiResponse {
	if (!fallbackProviders) {
		fallbackProviders = buildFallbackProviders();
	}
	return fallbackProviders;
}

/**
 * Initialize the model registry by fetching data from models.dev
 */
export async function initializeRegistry(): Promise<void> {
	try {
		// Try to load from browser storage first
		const stored = await browser.storage.local.get(CACHE_KEY);
		const storedCache = stored[CACHE_KEY] as CachedRegistryData | undefined;

		if (storedCache && Date.now() - storedCache.timestamp < CACHE_TTL_MS) {
			cachedData = storedCache.data;
			cacheTimestamp = storedCache.timestamp;
			debugLog("ModelRegistry", "Loaded from cache", {
				providers: Object.keys(cachedData).length,
				age:
					Math.round((Date.now() - cacheTimestamp) / 1000 / 60) +
					" minutes",
			});
			return;
		}

		// Fetch fresh data
		await refreshRegistry();
	} catch (error) {
		console.error("Failed to initialize model registry:", error);
		// Use fallback data
		cachedData = getFallbackProviders();
		debugLog("ModelRegistry", "Using fallback data");
	}
}

/**
 * Refresh the registry from models.dev API
 */
export async function refreshRegistry(): Promise<void> {
	try {
		debugLog("ModelRegistry", "Fetching from models.dev...");
		const response = await fetch(MODELS_DEV_API_URL);

		if (!response.ok) {
			throw new Error(`Failed to fetch models.dev: ${response.status}`);
		}

		const rawData = await response.json();

		// Validate API response structure
		const parseResult = ModelsDevApiResponseSchema.safeParse(rawData);
		if (!parseResult.success) {
			console.error(
				"Invalid models.dev API response format:",
				parseResult.error.issues,
			);
			debugLog("ModelRegistry", "API response validation failed", {
				issues: parseResult.error.issues.slice(0, 5), // Log first 5 issues
			});
			throw new Error("Invalid API response format from models.dev");
		}

		const data: ModelsDevApiResponse = parseResult.data;
		cachedData = data;
		cacheTimestamp = Date.now();

		// Store in browser storage
		await browser.storage.local.set({
			[CACHE_KEY]: {
				data: cachedData,
				timestamp: cacheTimestamp,
			} as CachedRegistryData,
		});

		debugLog("ModelRegistry", "Fetched and cached", {
			providers: Object.keys(data).length,
		});
	} catch (error) {
		console.error("Failed to refresh model registry:", error);
		// If we have no cached data, use fallback
		if (!cachedData) {
			cachedData = getFallbackProviders();
			debugLog(
				"ModelRegistry",
				"Using fallback data after fetch failure",
			);
		}
	}
}

/**
 * Map raw API model data to ModelCapabilities with defaults
 */
function mapApiModelToCapabilities(
	model: ModelsDevApiResponse[string]["models"][string],
	providerId: string,
): ModelCapabilities {
	return {
		id: model.id,
		name: model.name,
		provider: providerId,
		tool_call: model.tool_call ?? false,
		reasoning: model.reasoning ?? false,
		temperature: model.temperature ?? true,
		attachment: model.attachment ?? false,
		modalities: {
			input: (model.modalities?.input ?? ["text"]) as (
				| "text"
				| "image"
				| "pdf"
				| "audio"
			)[],
			output: (model.modalities?.output ?? ["text"]) as (
				| "text"
				| "image"
				| "audio"
			)[],
		},
		limit: {
			context: model.limit?.context ?? 4096,
			output: model.limit?.output ?? 2048,
		},
		cost: model.cost
			? {
					input: model.cost.input ?? 0,
					output: model.cost.output ?? 0,
				}
			: undefined,
	};
}

/**
 * Get model capabilities for a specific model
 */
export function getModel(
	providerId: string,
	modelId: string,
): ModelCapabilities | null {
	if (!cachedData) {
		debugLog("ModelRegistry", "Registry not initialized");
		return null;
	}

	const provider = cachedData[providerId];
	if (!provider || !provider.models) {
		return null;
	}

	const model = provider.models[modelId];
	if (!model) {
		return null;
	}

	return mapApiModelToCapabilities(model, providerId);
}

/**
 * Get all models for a provider
 */
export function getProviderModels(providerId: string): ModelCapabilities[] {
	if (!cachedData) {
		return [];
	}

	const provider = cachedData[providerId];
	if (!provider || !provider.models) {
		return [];
	}

	return Object.values(provider.models).map((model) =>
		mapApiModelToCapabilities(model, providerId),
	);
}

/**
 * Get all available providers
 */
export function getProviders(): ProviderInfo[] {
	if (!cachedData) {
		return [];
	}

	return Object.values(cachedData).map((provider) => ({
		id: provider.id,
		name: provider.name,
		env: provider.env ?? [],
		npm: provider.npm ?? "",
	}));
}

/**
 * Extended provider info with API details
 */
export interface ProviderDetails {
	id: string;
	name: string;
	baseUrl?: string;
	docUrl?: string;
	npm?: string;
	env?: string[];
}

/**
 * Get detailed provider info from models.dev
 */
export function getProviderDetails(providerId: string): ProviderDetails | null {
	if (!cachedData) {
		return null;
	}

	const provider = cachedData[providerId];
	if (!provider) {
		return null;
	}

	return {
		id: provider.id,
		name: provider.name,
		baseUrl: provider.api,
		docUrl: provider.doc,
		npm: provider.npm,
		env: provider.env,
	};
}

/**
 * Get all provider IDs from models.dev
 */
export function getProviderIds(): string[] {
	if (!cachedData) {
		return [];
	}
	return Object.keys(cachedData);
}

/**
 * Validate if a token count fits within a model's context window
 */
export function validateContextSize(
	providerId: string,
	modelId: string,
	tokenCount: number,
): boolean {
	const model = getModel(providerId, modelId);
	if (!model) {
		// If we can't find the model, assume it's valid
		return true;
	}
	return tokenCount <= model.limit.context;
}

/**
 * Get context window limit for a model
 * Returns undefined if model not found
 */
export function getContextLimit(
	providerId: string,
	modelId: string,
): number | undefined {
	const model = getModel(providerId, modelId);
	return model?.limit.context;
}

/**
 * Get cost information for a model
 * Returns undefined if model not found or has no cost data
 */
export function getModelCost(
	providerId: string,
	modelId: string,
): { input: number; output: number } | undefined {
	const model = getModel(providerId, modelId);
	return model?.cost;
}

/**
 * Validation result for context size check
 */
export interface ContextValidation {
	isValid: boolean;
	tokenCount: number;
	contextLimit: number | undefined;
	percentUsed: number | undefined;
}

/**
 * Validate context size and return detailed information
 */
export function validateContextWithDetails(
	providerId: string,
	modelId: string,
	tokenCount: number,
): ContextValidation {
	const contextLimit = getContextLimit(providerId, modelId);

	if (!contextLimit) {
		return {
			isValid: true,
			tokenCount,
			contextLimit: undefined,
			percentUsed: undefined,
		};
	}

	const percentUsed = (tokenCount / contextLimit) * 100;

	return {
		isValid: tokenCount <= contextLimit,
		tokenCount,
		contextLimit,
		percentUsed,
	};
}

/**
 * Calculate estimated cost for a request
 */
export function calculateCost(
	providerId: string,
	modelId: string,
	usage: { promptTokens: number; completionTokens: number },
): { input: number; output: number; total: number } | undefined {
	const model = getModel(providerId, modelId);
	if (!model?.cost) {
		return undefined;
	}

	// models.dev costs are per million tokens
	const inputCost = (usage.promptTokens / 1_000_000) * model.cost.input;
	const outputCost = (usage.completionTokens / 1_000_000) * model.cost.output;

	return {
		input: inputCost,
		output: outputCost,
		total: inputCost + outputCost,
	};
}

/**
 * Check if the registry is initialized
 */
export function isInitialized(): boolean {
	return cachedData !== null;
}

/**
 * Model ID patterns mapped to their models.dev provider IDs.
 * Order matters: first match wins, so more specific patterns come first.
 */
const MODEL_ID_PATTERNS: Array<{ pattern: RegExp; provider: string }> = [
	{ pattern: /gemini/i, provider: "google" },
	{ pattern: /claude/i, provider: "anthropic" },
	{ pattern: /deepseek/i, provider: "deepseek" },
	{ pattern: /mistral|codestral|devstral|pixtral/i, provider: "mistral" },
	{ pattern: /command-r|cohere/i, provider: "cohere" },
	{ pattern: /grok/i, provider: "xai" },
	{ pattern: /llama/i, provider: "meta" },
	{ pattern: /sonar|pplx/i, provider: "perplexity" },
	{ pattern: /gpt|chatgpt|\b(o1|o3|o4)(-|$)/i, provider: "openai" },
];

/**
 * Infer the models.dev provider ID from a model ID string
 *
 * This is a fallback mechanism when provider.presetId is missing (e.g., for migrated providers).
 * It uses well-known model naming patterns to determine the provider.
 *
 * @param modelId - The model ID to analyze (e.g., "gemini-3-flash-preview", "claude-sonnet-4-5")
 * @returns The inferred provider ID, or undefined if no pattern matches
 */
export function inferProviderFromModelId(modelId: string): string | undefined {
	return MODEL_ID_PATTERNS.find(({ pattern }) => pattern.test(modelId))
		?.provider;
}

/**
 * Get the effective provider ID, using presetId if available or inferring from model ID
 *
 * @param presetId - The provider's presetId (may be undefined for migrated providers)
 * @param modelId - The model ID to use for inference if presetId is missing
 * @returns The effective provider ID, or undefined if neither source provides one
 */
export function getEffectiveProviderId(
	presetId: string | undefined,
	modelId: string | undefined,
): string | undefined {
	return (
		presetId || (modelId ? inferProviderFromModelId(modelId) : undefined)
	);
}

/**
 * Check if a model supports structured output (via tool calling or JSON mode)
 *
 * The AI SDK's generateObject() requires either:
 * 1. Native JSON mode support (OpenAI json_schema, Anthropic structured output)
 * 2. Tool calling support (uses a synthetic "json" tool)
 *
 * Models without tool_call support in models.dev cannot use generateObject()
 * and need to fall back to generateText() with manual JSON parsing.
 *
 * For unknown models, we're conservative and return false to use text fallback.
 * The interpreter service will still try generateObject() first if the provider
 * is known to support it, with automatic fallback on failure.
 *
 * @returns true if model supports structured output, false if fallback needed
 */
export function supportsStructuredOutput(
	providerId: string,
	modelId: string,
): boolean {
	const model = getModel(providerId, modelId);

	// If we can't find the model in the registry, be conservative and use text fallback
	// This avoids API errors for unknown models while still getting usable responses
	if (!model) {
		debugLog(
			"ModelRegistry",
			"Model not found, using text fallback (conservative)",
			{
				providerId,
				modelId,
			},
		);
		return false;
	}

	// tool_call: true in models.dev means the model supports tool calling,
	// which is what AI SDK uses for generateObject() when native JSON isn't available
	return model.tool_call;
}

/**
 * Get the raw cached data (for debugging)
 */
export function getCachedData(): ModelsDevApiResponse | null {
	return cachedData;
}

/**
 * Model capability hints for UI display
 */
export interface ModelCapabilityHints {
	/** Whether the model supports temperature adjustment */
	supportsTemperature: boolean;
	/** Whether the model supports extended thinking/reasoning */
	supportsReasoning: boolean;
	/** Whether the model supports tool calling (structured output) */
	supportsToolCalls: boolean;
	/** Maximum output tokens for this model */
	maxOutputTokens: number;
	/** Maximum context window for this model */
	maxContextTokens: number;
	/** Default temperature for this model (if known) */
	defaultTemperature?: number;
}

/**
 * Get capability hints for a model to display appropriate settings in UI
 *
 * @param providerId - The models.dev provider ID (e.g., "openai", "anthropic")
 * @param modelId - The model ID (e.g., "gpt-4o", "claude-sonnet-4-5")
 * @returns Capability hints for the model, or defaults if model not found
 */
export function getModelCapabilityHints(
	providerId: string,
	modelId: string,
): ModelCapabilityHints {
	const model = getModel(providerId, modelId);

	if (!model) {
		// Return reasonable defaults for unknown models
		return {
			supportsTemperature: true,
			supportsReasoning: false,
			supportsToolCalls: true,
			maxOutputTokens: DEFAULT_OUTPUT_LIMIT,
			maxContextTokens: DEFAULT_CONTEXT_LIMIT,
			defaultTemperature: 0.7,
		};
	}

	return {
		supportsTemperature: model.temperature,
		supportsReasoning: model.reasoning,
		supportsToolCalls: model.tool_call,
		maxOutputTokens: model.limit.output,
		maxContextTokens: model.limit.context,
		defaultTemperature: model.temperature ? 0.7 : undefined,
	};
}
