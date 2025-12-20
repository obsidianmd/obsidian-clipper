/**
 * Interpreter Service - Core LLM communication using AI SDK
 *
 * This is the main orchestration module that coordinates:
 * - Schema building (schema-builder.ts)
 * - Prompt construction (prompt-builder.ts)
 * - Response parsing (response-parser.ts)
 * - Provider communication (provider-factory.ts)
 *
 * Uses dynamic imports to lazy-load the AI SDK only when needed.
 */

import { debugLog } from '../utils/debug';
import { createLanguageModel, detectProviderType } from './provider-factory';
import {
	getModel,
	calculateCost,
	initializeRegistry,
	isInitialized,
	validateContextWithDetails,
	supportsStructuredOutput,
} from './model-registry';
import { countTokens } from '../utils/token-counter';
import {
	InterpreterResult,
	InterpreterOptions,
	UsageInfo,
	PromptLocation,
} from './types';
import { buildDynamicSchema, PromptInfo } from './schema-builder';
import { buildSystemPrompt, buildPromptContent } from './prompt-builder';
import {
	parseJsonFromText,
	getResponseValue,
	getResponseKeys,
	ParsedResponse,
} from './response-parser';

/**
 * Default model settings
 * 
 * DEFAULT_MAX_TOKENS: 16384 - A reasonable default that works for most models.
 * Higher values may cause issues with smaller context windows.
 * 
 * DEFAULT_TEMPERATURE: 0.5 - Balanced between creativity and consistency.
 * Lower values (0.0-0.3) produce more deterministic output.
 * Higher values (0.7-1.0) produce more varied output.
 */
const DEFAULT_MAX_TOKENS = 16384;
const DEFAULT_TEMPERATURE = 0.5;

/**
 * Anthropic thinking budget tokens by reasoning effort level
 * 
 * These control how much "thinking" the model does for Claude's extended thinking feature.
 * Higher values allow for more complex reasoning but increase latency and cost.
 */
const ANTHROPIC_THINKING_BUDGET: Record<'low' | 'medium' | 'high', number> = {
	low: 5000,
	medium: 15000,
	high: 30000,
};

// Cache for dynamically loaded AI SDK functions
let generateObjectFn: typeof import('ai').generateObject | null = null;
let generateTextFn: typeof import('ai').generateText | null = null;

/**
 * Lazily load the AI SDK's generateObject function
 */
async function getGenerateObject(): Promise<typeof import('ai').generateObject> {
	if (!generateObjectFn) {
		const ai = await import(
			/* webpackChunkName: "ai-core" */
			'ai'
		);
		generateObjectFn = ai.generateObject;
	}
	return generateObjectFn;
}

/**
 * Lazily load the AI SDK's generateText function (for fallback)
 */
async function getGenerateText(): Promise<typeof import('ai').generateText> {
	if (!generateTextFn) {
		const ai = await import(
			/* webpackChunkName: "ai-core" */
			'ai'
		);
		generateTextFn = ai.generateText;
	}
	return generateTextFn;
}

/**
 * Build provider-specific options for reasoning/thinking features
 */
function buildReasoningOptions(
	providerType: string,
	reasoningEffort: 'low' | 'medium' | 'high'
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> | undefined {
	if (providerType === 'anthropic') {
		// Anthropic uses thinking with budgetTokens
		return {
			anthropic: {
				thinking: {
					type: 'enabled',
					budgetTokens: ANTHROPIC_THINKING_BUDGET[reasoningEffort],
				},
			},
		};
	} else if (providerType === 'openai' || providerType === 'openai-compatible') {
		// OpenAI uses reasoningEffort for o1/o3/GPT-5 models
		return {
			openai: {
				reasoningEffort: reasoningEffort,
			},
		};
	} else if (providerType === 'google') {
		// Google Gemini uses thinkingConfig
		const thinkingLevel = reasoningEffort === 'low' ? 'low' : 'high';
		return {
			google: {
				thinkingConfig: {
					thinkingLevel: thinkingLevel,
				},
			},
		};
	}
	return undefined;
}

/**
 * Map common HTTP error codes to user-friendly messages
 */
function handleApiError(error: Error, options: InterpreterOptions): never {
	// Check for common error patterns
	if (error.message.includes('401') || error.message.includes('unauthorized')) {
		throw new Error(`API key is invalid or expired for ${options.providerId}`);
	}
	if (error.message.includes('403')) {
		// Check if this might be a local server (like Ollama) that needs CORS configured
		const isLocalServer =
			options.baseUrl &&
			(options.baseUrl.includes('127.0.0.1') || options.baseUrl.includes('localhost'));
		if (isLocalServer) {
			throw new Error(
				`Local server rejected the request (403 Forbidden). ` +
					`If using Ollama, set OLLAMA_ORIGINS environment variable. ` +
					`See instructions at https://help.obsidian.md/web-clipper/interpreter`
			);
		}
		throw new Error(`Access forbidden for ${options.providerId}: ${error.message}`);
	}
	if (error.message.includes('429')) {
		throw new Error(
			`Rate limit exceeded for ${options.providerId}. Please wait and try again.`
		);
	}
	if (
		error.message.includes('500') ||
		error.message.includes('502') ||
		error.message.includes('503')
	) {
		throw new Error(
			`${options.providerId} service is temporarily unavailable. Please try again later.`
		);
	}
	throw error;
}

/**
 * Interpret content using AI SDK
 *
 * Rate limiting is handled automatically by the AI SDK's built-in retry logic.
 *
 * @param options - Interpreter configuration
 * @returns Promise with prompt responses and usage info
 */
export async function interpret(options: InterpreterOptions): Promise<InterpreterResult> {
	debugLog('InterpreterService', 'Starting interpretation', {
		providerId: options.providerId,
		modelId: options.providerModelId,
		promptCount: options.promptVariables.length,
	});

	// Ensure registry is initialized
	if (!isInitialized()) {
		await initializeRegistry();
	}

	// Get model capabilities for smart defaults
	const capabilities = getModel(options.providerId, options.providerModelId);

	// Use modelSettings if provided, with backwards compatibility for deprecated options
	const modelSettings = options.modelSettings;
	const maxTokens =
		modelSettings?.maxTokens ??
		options.maxTokens ??
		capabilities?.limit.output ??
		DEFAULT_MAX_TOKENS;
	const temperature =
		modelSettings?.temperature ?? options.temperature ?? DEFAULT_TEMPERATURE;

	// Check if reasoning is enabled and supported
	const reasoningEnabled = modelSettings?.reasoningEnabled && capabilities?.reasoning;
	const reasoningEffort = modelSettings?.reasoningEffort ?? 'medium';

	// Build prompt info for schema and system prompt generation
	const promptInfos: PromptInfo[] = options.promptVariables.map((v) => ({
		key: v.key,
		prompt: v.prompt,
		location: v.location,
		propertyName: v.propertyName,
		propertyType: v.propertyType,
	}));

	// Build the prompt content showing which prompts need responses
	const promptContent = buildPromptContent(options.promptVariables);

	// Build dynamic system prompt with JSON schema
	const systemPrompt = buildSystemPrompt(promptInfos);

	// Estimate token count and validate against context window
	const fullPrompt = systemPrompt + options.context + JSON.stringify(promptContent);
	const estimatedTokens = countTokens(fullPrompt);

	const contextValidation = validateContextWithDetails(
		options.providerId,
		options.providerModelId,
		estimatedTokens
	);

	debugLog('InterpreterService', 'Context validation', {
		estimatedTokens,
		contextLimit: contextValidation.contextLimit,
		percentUsed: contextValidation.percentUsed?.toFixed(1) + '%',
		isValid: contextValidation.isValid,
	});

	if (!contextValidation.isValid && contextValidation.contextLimit) {
		throw new Error(
			`Input too large for ${options.providerModelId}. ` +
				`Estimated ${estimatedTokens.toLocaleString()} tokens exceeds ` +
				`context limit of ${contextValidation.contextLimit.toLocaleString()} tokens. ` +
				`Try reducing the context or using a model with a larger context window.`
		);
	}

	// Create AI SDK model instance
	const providerConfig = {
		type: options.providerType,
		apiKey: options.apiKey,
		baseUrl: options.baseUrl,
	};
	const model = await createLanguageModel(providerConfig, options.providerModelId);

	// Check if model supports structured output (tool calling / JSON mode)
	const useStructuredOutput = supportsStructuredOutput(
		options.providerId,
		options.providerModelId
	);

	// Build provider-specific options for reasoning
	const providerOptions = reasoningEnabled
		? buildReasoningOptions(options.providerType, reasoningEffort)
		: undefined;

	debugLog('InterpreterService', 'Sending request', {
		maxTokens,
		temperature,
		promptContent,
		useStructuredOutput,
		reasoningEnabled,
		reasoningEffort: reasoningEnabled ? reasoningEffort : undefined,
		providerOptions,
	});

	try {
		let parsedResponse: ParsedResponse;
		let usage:
			| {
					inputTokens?: number;
					outputTokens?: number;
					totalTokens?: number;
			  }
			| undefined;

		if (useStructuredOutput) {
			// Path 1: Use generateObject for structured output (preferred)
			const [generateObject, promptResponseSchema] = await Promise.all([
				getGenerateObject(),
				buildDynamicSchema(promptInfos),
			]);

			debugLog('InterpreterService', 'Calling generateObject', {
				modelId: options.providerModelId,
				schemaKeys: Object.keys(promptResponseSchema.shape || {}),
			});

			try {
				const result = await generateObject({
					model,
					schema: promptResponseSchema,
					system: systemPrompt,
					messages: [
						{ role: 'user', content: options.context },
						{ role: 'user', content: JSON.stringify(promptContent) },
					],
					maxOutputTokens: maxTokens,
					temperature,
					...(providerOptions && { providerOptions }),
				});

				debugLog('InterpreterService', 'generateObject returned', {
					hasObject: !!result.object,
					hasUsage: !!result.usage,
					finishReason: result.finishReason,
				});

				parsedResponse = result.object;
				usage = result.usage;
			} catch (genError) {
				// Extract AI SDK specific error properties
				const aiError = genError as Error & {
					cause?: unknown;
					text?: string;
					response?: unknown;
					usage?: unknown;
					finishReason?: string;
				};

				debugLog('InterpreterService', 'generateObject failed', {
					error: aiError.message || String(genError),
					errorName: aiError.name || 'unknown',
					cause: aiError.cause,
					finishReason: aiError.finishReason,
					hasText: !!aiError.text,
					textPreview: aiError.text?.substring(0, 500),
					response: aiError.response,
					usage: aiError.usage,
				});
				throw genError;
			}

			debugLog('InterpreterService', 'Received structured response', {
				responseKeys: getResponseKeys(parsedResponse),
			});
		} else {
			// Path 2: Fallback to generateText + manual JSON parsing
			// For models without tool calling support (e.g., Perplexity sonar, some reasoning models)
			debugLog(
				'InterpreterService',
				'Using text fallback (model lacks tool_call support)'
			);

			const generateText = await getGenerateText();

			const result = await generateText({
				model,
				system: systemPrompt,
				messages: [
					{ role: 'user', content: options.context },
					{ role: 'user', content: JSON.stringify(promptContent) },
				],
				maxOutputTokens: maxTokens,
				temperature,
				...(providerOptions && { providerOptions }),
			});

			// Parse JSON from the text response
			parsedResponse = parseJsonFromText(result.text);
			usage = result.usage;

			debugLog('InterpreterService', 'Parsed text response', {
				responseKeys: getResponseKeys(parsedResponse),
				rawTextLength: result.text.length,
			});
		}

		// Build usage info with cost calculation
		let usageInfo: UsageInfo | undefined;
		if (usage) {
			const inputTokens = usage.inputTokens ?? 0;
			const outputTokens = usage.outputTokens ?? 0;
			const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

			const cost = calculateCost(options.providerId, options.providerModelId, {
				promptTokens: inputTokens,
				completionTokens: outputTokens,
			});

			usageInfo = {
				promptTokens: inputTokens,
				completionTokens: outputTokens,
				totalTokens,
				estimatedCost: cost,
			};
		}

		// Map to expected response format
		const promptResponses = options.promptVariables.map((v) => ({
			key: v.key,
			prompt: v.prompt,
			user_response: getResponseValue(parsedResponse, v.location, v.key),
		}));

		return {
			promptResponses,
			usage: usageInfo,
		};
	} catch (error) {
		// Log the error with context
		console.error('InterpreterService error:', error);
		debugLog('InterpreterService', 'Error during interpretation', {
			error: error instanceof Error ? error.message : String(error),
			providerId: options.providerId,
			modelId: options.providerModelId,
		});

		// Re-throw with more context
		if (error instanceof Error) {
			handleApiError(error, options);
		}
		throw new Error(
			`An unknown error occurred while processing the interpreter request.`
		);
	}
}

/**
 * Convert legacy sendToLLM parameters to InterpreterOptions
 * This helper makes migration easier by accepting the old function signature
 */
export function createInterpreterOptions(
	providerId: string,
	providerModelId: string,
	apiKey: string,
	baseUrl: string | undefined,
	providerName: string,
	promptVariables: {
		key: string;
		prompt: string;
		filters?: string;
		location?: PromptLocation;
	}[],
	context: string
): InterpreterOptions {
	return {
		providerId,
		providerModelId,
		apiKey,
		baseUrl,
		providerType: detectProviderType(baseUrl || '', providerName),
		// Default to 'note_content' location for legacy callers
		promptVariables: promptVariables.map((v) => ({
			...v,
			location: v.location || ('note_content' as PromptLocation),
		})),
		context,
	};
}
