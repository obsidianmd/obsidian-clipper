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
	'ollama': 'http://127.0.0.1:11434/v1',
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
	// Normalize provider type - ollama uses openai-compatible
	const cacheKey = providerType === 'ollama' ? 'openai' : providerType;
	
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
		// - OpenAI (native)
		// - Azure OpenAI (with custom headers)
		// - Ollama (local, exposes /v1 endpoint)
		// - OpenAI-compatible (DeepSeek, Perplexity, OpenRouter, xAI, etc.)
		case 'openai':
		case 'azure':
		case 'ollama':
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
 * Detect provider type from URL and name
 */
export function detectProviderType(baseUrl: string, name: string): SupportedProvider {
	const url = (baseUrl || '').toLowerCase();
	const n = name.toLowerCase();

	// Check URL patterns first (more reliable)
	if (url.includes('api.anthropic.com')) return 'anthropic';
	if (url.includes('openai.azure.com')) return 'azure';
	if (url.includes('generativelanguage.googleapis.com')) return 'google';
	if (url.includes('127.0.0.1:11434') || url.includes('localhost:11434')) return 'ollama';
	
	// Check for OpenAI specifically (not just openai-compatible)
	if (url.includes('api.openai.com')) return 'openai';

	// Fall back to name-based detection
	if (n.includes('anthropic') || n.includes('claude')) return 'anthropic';
	if (n.includes('gemini') || n.includes('google')) return 'google';
	if (n.includes('ollama')) return 'ollama';
	if (n.includes('azure')) return 'azure';
	if (n === 'openai') return 'openai';

	// Default to OpenAI-compatible for everything else
	// (DeepSeek, Perplexity, OpenRouter, xAI, Meta, Hugging Face, etc.)
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
		case 'ollama':
			// Ollama supports OpenAI-compatible API
			return createOllamaModel(config, modelId);
		case 'openai':
		case 'openai-compatible':
		default:
			return createOpenAIModel(config, modelId);
	}
}

/**
 * Create Anthropic model instance
 */
async function createAnthropicModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createAnthropic = await loadProviderFactory('anthropic') as typeof import('@ai-sdk/anthropic').createAnthropic;
	const anthropic = createAnthropic({
		apiKey: config.apiKey,
		headers: {
			'anthropic-dangerous-direct-browser-access': 'true',
			...config.headers
		}
	});
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
 * Create Ollama model instance using OpenAI-compatible API
 * Ollama exposes an OpenAI-compatible endpoint at /v1
 */
async function createOllamaModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createOpenAI = await loadProviderFactory('ollama') as typeof import('@ai-sdk/openai').createOpenAI;
	
	// Default to standard Ollama URL if not provided
	let baseUrl = config.baseUrl || 'http://127.0.0.1:11434';
	
	// Clean up the URL - remove old API paths if present
	baseUrl = baseUrl
		.replace(/\/api\/chat\/?$/, '')
		.replace(/\/api\/?$/, '')
		.replace(/\/v1\/?$/, '');
	
	// Ollama's OpenAI-compatible endpoint is at /v1
	const openaiCompatibleUrl = `${baseUrl}/v1`;
	
	const ollama = createOpenAI({
		baseURL: openaiCompatibleUrl,
		apiKey: 'ollama', // Ollama doesn't require an API key, but the SDK needs something
	});
	
	return ollama(modelId);
}

/**
 * Create OpenAI or OpenAI-compatible model instance
 */
async function createOpenAIModel(config: ProviderConfig, modelId: string): Promise<LanguageModel> {
	const createOpenAI = await loadProviderFactory('openai') as typeof import('@ai-sdk/openai').createOpenAI;
	const options: Parameters<typeof createOpenAI>[0] = {
		apiKey: config.apiKey
	};

	// Only set baseURL if it's different from default OpenAI
	if (config.baseUrl && !config.baseUrl.includes('api.openai.com')) {
		// Clean up the URL - remove /chat/completions suffix as the SDK adds it
		const baseUrl = config.baseUrl.replace(/\/chat\/completions\/?$/, '');
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

	const openai = createOpenAI(options);
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
