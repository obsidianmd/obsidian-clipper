/**
 * AI SDK Module Exports
 * 
 * This module provides a unified interface for LLM communication using the Vercel AI SDK.
 * 
 * Architecture:
 * - interpreter-service.ts: Core orchestration
 * - schema-builder.ts: Zod schema generation
 * - prompt-builder.ts: System prompt construction
 * - response-parser.ts: JSON parsing and response mapping
 * - provider-factory.ts: AI SDK provider instantiation
 * - model-registry.ts: Model capabilities from models.dev
 * 
 * Public API:
 * - interpret(): Main function to send prompts to LLM
 * - initializeRegistry(): Initialize model capabilities cache
 * - getContextLimit(): Get context window size for a model
 * - getModelCost(): Get pricing info for a model
 * - detectProviderType(): Auto-detect provider from URL/name
 */

// Main interpreter service
export { interpret } from './interpreter-service';

// Provider factory - only export what's needed externally
export { detectProviderType, getDefaultBaseUrl, cleanupApiUrl } from './provider-factory';

// Schema builder - export for advanced usage
export { buildDynamicSchema } from './schema-builder';
export type { PromptInfo } from './schema-builder';

// Prompt builder - export for advanced usage
export { buildSystemPrompt, buildPromptContent } from './prompt-builder';

// Response parser - export for advanced usage
export { parseJsonFromText, getResponseValue, getResponseKeys } from './response-parser';
export type { ParsedResponse, PromptResponseValue as ParsedResponseValue } from './response-parser';

// Model registry - public API only
export {
	initializeRegistry,
	refreshRegistry,
	getModel,
	getProviderModels,
	getProviderDetails,
	getContextLimit,
	getModelCost,
	calculateCost,
	isInitialized,
	supportsStructuredOutput,
	getModelCapabilityHints
} from './model-registry';

export type { ContextValidation, ProviderDetails, ModelCapabilityHints } from './model-registry';

// Types
export type {
	SupportedProvider,
	ModelCapabilities,
	ProviderInfo,
	UsageInfo,
	InterpreterResult,
	InterpreterOptions,
	PromptResponse,
	PromptResponseValue
} from './types';

// Runtime type guards
export { isSupportedProvider, SUPPORTED_PROVIDERS } from './types';
