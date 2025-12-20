/**
 * Provider Factory - Creates AI SDK provider instances from user configuration
 * 
 * Uses dynamic imports to lazy-load provider packages only when needed,
 * reducing initial bundle size.
 */

// Use LanguageModelV2 from the provider package for proper typing
import type { LanguageModelV2 } from '@ai-sdk/provider';

type LanguageModel = LanguageModelV2;
import { debugLog } from '../utils/debug';
import { SupportedProvider, ProviderConfig } from './types';

/**
 * Clean up API URL by removing common path suffixes.
 * This normalizes URLs that may have been entered with various API path formats.
 * 
 * Examples:
 *   https://api.example.com/v1/chat/completions -> https://api.example.com
 *   https://api.example.com/v1/messages -> https://api.example.com
 *   http://localhost:11434/api/chat -> http://localhost:11434
 * 
 * @param url - The URL to clean up
 * @returns The base URL without API path suffixes
 */
export function cleanupApiUrl(url: string): string {
	try {
		const parsed = new URL(url);
		// Remove common API path suffixes - matches multi-segment paths like /v1/chat/completions
		// The pattern matches any sequence of these segments at the end of the path
		parsed.pathname = parsed.pathname.replace(
			/(?:\/(?:v1|v1beta|api|chat|completions|messages|responses))+\/?$/i,
			''
		);
		// Remove trailing slash
		return parsed.toString().replace(/\/$/, '');
	} catch {
		// If URL parsing fails, fall back to string replacement
		return url
			.replace(/(?:\/(?:v1|v1beta|api|chat|completions|messages|responses))+\/?$/gi, '')
			.replace(/\/$/, '');
	}
}

// Type for provider factory functions
type AnthropicFactory = typeof import('@ai-sdk/anthropic').createAnthropic;
type GoogleFactory = typeof import('@ai-sdk/google').createGoogleGenerativeAI;
type OpenAIFactory = typeof import('@ai-sdk/openai').createOpenAI;

// Cache for loaded provider factories to avoid re-importing
const providerCache = new Map<string, AnthropicFactory | GoogleFactory | OpenAIFactory>();

/**
 * Default base URLs for well-known providers
 * Centralized here to avoid duplication across the codebase
 */
const DEFAULT_BASE_URLS: Record<string, string> = {
	'anthropic': 'https://api.anthropic.com/v1/messages',
	'openai': 'https://api.openai.com/v1/chat/completions',
	'google': 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
	'azure': 'https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21',
	'xai': 'https://api.x.ai/v1/chat/completions',
	'perplexity': 'https://api.perplexity.ai/chat/completions',
	'deepseek': 'https://api.deepseek.com/v1/chat/completions',
	'openrouter': 'https://openrouter.ai/api/v1/chat/completions',
	'meta': 'https://api.llama.com/v1/chat/completions',
};

/**
 * Get the default base URL for a provider
 * @param providerId - The provider ID (e.g., "openai", "anthropic")
 * @returns The default base URL or empty string if not known
 */
export function getDefaultBaseUrl(providerId: string): string {
	return DEFAULT_BASE_URLS[providerId] || '';
}

/**
 * Dynamically load a provider factory
 */
async function loadProviderFactory(providerType: SupportedProvider): Promise<unknown> {
	// Normalize provider type for caching
	const cacheKey = providerType === 'openai-responses' ? 'openai' : providerType;
	
	if (providerCache.has(cacheKey)) {
		return providerCache.get(cacheKey)!;
	}

	let factory: unknown;

	switch (providerType) {
		case 'anthropic': {
			const { createAnthropic } = await import(
				/* webpackChunkName: "ai-anthropic" */
				'@ai-sdk/anthropic'
			);
			factory = createAnthropic;
			break;
		}
		case 'google': {
			const { createGoogleGenerativeAI } = await import(
				/* webpackChunkName: "ai-google" */
				'@ai-sdk/google'
			);
			factory = createGoogleGenerativeAI;
			break;
		}
		// All OpenAI-compatible providers use the same factory:
		// - OpenAI (native chat/completions)
		// - OpenAI responses API (v1/responses)
		// - Azure OpenAI (with custom headers)
		// - OpenAI-compatible (DeepSeek, Perplexity, OpenRouter, xAI, Ollama, etc.)
		case 'openai':
		case 'openai-responses':
		case 'azure':
		case 'openai-compatible':
		default: {
			const { createOpenAI } = await import(
				/* webpackChunkName: "ai-openai" */
				'@ai-sdk/openai'
			);
			factory = createOpenAI;
			break;
		}
	}

	providerCache.set(cacheKey, factory as AnthropicFactory | GoogleFactory | OpenAIFactory);
	return factory;
}

/**
 * Detect API type from URL path
 * This enables custom providers to work with different API formats based on their URL
 */
function detectApiTypeFromPath(baseUrl: string): SupportedProvider | null {
	const url = (baseUrl || '').toLowerCase();
	
	// Check for specific API paths
	if (url.includes('/v1/messages') || url.includes('/messages')) {
		return 'anthropic';
	}
	if (url.includes('/v1/responses') || url.includes('/responses')) {
		return 'openai-responses';
	}
	if (url.includes('/v1/chat/completions') || url.includes('/chat/completions')) {
		return 'openai-compatible';
	}
	
	return null;
}

/**
 * Detect provider type from URL and name
 * 
 * Detection priority:
 * 1. Well-known provider domains (api.anthropic.com, api.openai.com, etc.)
 * 2. URL path patterns (/v1/messages -> anthropic, /v1/responses -> openai-responses, /v1/chat/completions -> openai-compatible)
 * 3. Provider name matching
 * 4. Default to openai-compatible
 */
export function detectProviderType(baseUrl: string, name: string): SupportedProvider {
	const url = (baseUrl || '').toLowerCase();
	const n = name.toLowerCase();

	// Check well-known provider domains first (most reliable)
	if (url.includes('api.anthropic.com')) return 'anthropic';
	if (url.includes('openai.azure.com')) return 'azure';
	if (url.includes('generativelanguage.googleapis.com')) return 'google';
	if (url.includes('api.openai.com')) return 'openai';

	// Check URL path for API type detection (for custom providers)
	const pathBasedType = detectApiTypeFromPath(baseUrl);
	if (pathBasedType) return pathBasedType;

	// Fall back to name-based detection
	if (n.includes('anthropic') || n.includes('claude')) return 'anthropic';
	if (n.includes('gemini') || n.includes('google')) return 'google';
	if (n.includes('azure')) return 'azure';
	if (n === 'openai') return 'openai';

	// Default to OpenAI-compatible for everything else
	// (DeepSeek, Perplexity, OpenRouter, xAI, Meta, Hugging Face, Ollama, etc.)
	return 'openai-compatible';
}

/**
 * Create an AI SDK language model instance (async due to dynamic imports)
 */
export async function createLanguageModel(
	config: ProviderConfig,
	modelId: string
): Promise<LanguageModel> {
	debugLog('ProviderFactory', 'Creating model', {
		type: config.type,
		modelId,
		hasApiKey: !!config.apiKey,
		baseUrl: config.baseUrl
	});

	switch (config.type) {
		case 'anthropic':
			return createAnthropicModel(config, modelId);
		case 'google':
			return createGoogleModel(config, modelId);
		case 'azure':
			return createAzureModel(config, modelId);
		case 'openai':
		case 'openai-responses':
		case 'openai-compatible':
		default:
			return createOpenAIModel(config, modelId);
	}
}

/**
 * Create Anthropic model instance
 * Also used for custom providers using the Anthropic /v1/messages API
 */
async function createAnthropicModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createAnthropic = await loadProviderFactory('anthropic') as typeof import('@ai-sdk/anthropic').createAnthropic;
	
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const options: any = {
		apiKey: config.apiKey,
		headers: {
			'anthropic-dangerous-direct-browser-access': 'true',
			...config.headers
		}
	};
	
	// Support custom base URL for Anthropic-compatible providers
	if (config.baseUrl && !config.baseUrl.includes('api.anthropic.com')) {
		// Clean up URL - remove /messages suffix as the SDK adds it
		let baseUrl = config.baseUrl.replace(/\/messages\/?$/, '');
		// Also handle /v1/messages -> /v1
		baseUrl = baseUrl.replace(/\/v1\/messages\/?$/, '/v1');
		options.baseURL = baseUrl;
	}
	
	const anthropic = createAnthropic(options);
	return anthropic(modelId);
}

/**
 * Create Google Generative AI model instance
 */
async function createGoogleModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createGoogleGenerativeAI = await loadProviderFactory('google') as typeof import('@ai-sdk/google').createGoogleGenerativeAI;
	const google = createGoogleGenerativeAI({
		apiKey: config.apiKey
	});
	return google(modelId);
}

/**
 * Create Azure OpenAI model instance
 */
async function createAzureModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createOpenAI = await loadProviderFactory('azure') as typeof import('@ai-sdk/openai').createOpenAI;
	// Azure OpenAI uses a different URL format and api-key header
	// The baseUrl already contains the deployment info, so we don't need modelId
	const openai = createOpenAI({
		apiKey: config.apiKey,
		baseURL: extractAzureBaseUrl(config.baseUrl || ''),
		headers: {
			'api-key': config.apiKey,
			...config.headers
		}
	});
	
	// For Azure, the "model" is actually the deployment name
	// Extract it from the baseUrl or use the modelId
	const deploymentName = extractAzureDeploymentName(config.baseUrl || '') || modelId;
	return openai(deploymentName);
}

/**
 * Create OpenAI or OpenAI-compatible model instance
 * Handles both chat/completions and responses API endpoints
 */
async function createOpenAIModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createOpenAI = await loadProviderFactory('openai') as typeof import('@ai-sdk/openai').createOpenAI;
	const options: Parameters<typeof createOpenAI>[0] = {
		apiKey: config.apiKey
	};

	// Only set baseURL if it's different from default OpenAI
	if (config.baseUrl && !config.baseUrl.includes('api.openai.com')) {
		// Clean up the URL - remove API-specific suffixes as the SDK adds them
		// Supports: /chat/completions, /responses, /messages
		let baseUrl = config.baseUrl
			.replace(/\/chat\/completions\/?$/, '')
			.replace(/\/responses\/?$/, '')
			.replace(/\/messages\/?$/, '');
		
		options.baseURL = baseUrl;
	}

	// Add common headers for OpenAI-compatible providers
	if (config.headers || config.type === 'openai-compatible') {
		options.headers = {
			'HTTP-Referer': 'https://obsidian.md/',
			'X-Title': 'Obsidian Web Clipper',
			...config.headers
		};
	}

	// For local servers without API key (like Ollama), use a placeholder
	if (!config.apiKey && config.baseUrl && (
		config.baseUrl.includes('127.0.0.1') || 
		config.baseUrl.includes('localhost')
	)) {
		options.apiKey = 'local';
	}

	const openai = createOpenAI(options);
	
	// Use the appropriate API based on provider type:
	// - 'openai-responses': Use the Responses API (/v1/responses)
	// - 'openai': Use the Responses API for official OpenAI (default in SDK 2.x)
	// - 'openai-compatible': Use the Chat Completions API (/v1/chat/completions)
	//   This is critical for third-party providers like Ollama, llamacpp, LM Studio, etc.
	if (config.type === 'openai-compatible') {
		return openai.chat(modelId);
	}
	
	// For official OpenAI and openai-responses, use the default (Responses API)
	return openai(modelId);
}

/**
 * Extract the base URL for Azure (without the deployment path)
 */
function extractAzureBaseUrl(url: string): string {
	// Azure URL format: https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=...
	// We need: https://{resource-name}.openai.azure.com/openai
	const match = url.match(/(https:\/\/[^/]+\.openai\.azure\.com\/openai)/);
	return match ? match[1] : url;
}

/**
 * Extract the deployment name from Azure URL
 */
function extractAzureDeploymentName(url: string): string | null {
	// Azure URL format: https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=...
	const match = url.match(/\/deployments\/([^/]+)/);
	return match ? match[1] : null;
}
