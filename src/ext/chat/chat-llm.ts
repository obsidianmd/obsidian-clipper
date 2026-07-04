import { generalSettings } from '../../utils/storage-utils';
import { ModelConfig, Provider } from '../../types/types';
import { debugLog } from '../../utils/debug';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface ChatCompleteOptions {
	model: ModelConfig;
	messages: ChatMessage[];
	system?: string;
	maxTokens?: number;
	temperature?: number;
	signal?: AbortSignal;
}

const RATE_LIMIT_RESET_MS = 60000;
let lastRequestTime = 0;

function findProvider(model: ModelConfig): Provider {
	const provider = generalSettings.providers.find(p => p.id === model.providerId);
	if (!provider) throw new Error(`Provider not found for model ${model.name}`);
	return provider;
}

function checkRateLimit(): void {
	const now = Date.now();
	if (now - lastRequestTime < RATE_LIMIT_RESET_MS) {
		const waitSec = Math.ceil((RATE_LIMIT_RESET_MS - (now - lastRequestTime)) / 1000);
		throw new Error(`Rate limit cooldown. Please wait ${waitSec} seconds before trying again.`);
	}
}

function buildRequest(provider: Provider, model: ModelConfig, messages: ChatMessage[], systemMsg: string, extra: { maxTokens?: number; temperature?: number; format?: string }) {
	const { maxTokens = 1600, temperature, format } = extra;
	const systemMessage: ChatMessage = { role: 'system', content: systemMsg };

	const isHugging = provider.name.toLowerCase().includes('hugging');
	const isAzure = provider.baseUrl.includes('openai.azure.com');
	const isAnthropic = provider.name.toLowerCase().includes('anthropic');
	const isPerplexity = provider.name.toLowerCase().includes('perplexity');
	const isOllama = provider.name.toLowerCase().includes('ollama');

	let requestUrl: string;
	let requestBody: any;
	let headers: HeadersInit = { 'Content-Type': 'application/json' };

	if (isHugging) {
		requestUrl = provider.baseUrl.replace('{model-id}', model.providerModelId);
		requestBody = {
			model: model.providerModelId,
			messages: [systemMessage, ...messages],
			max_tokens: maxTokens,
			stream: false
		};
		headers = { ...headers, 'Authorization': `Bearer ${provider.apiKey}` };
	} else if (isAzure) {
		requestUrl = provider.baseUrl;
		requestBody = {
			messages: [systemMessage, ...messages],
			max_tokens: maxTokens,
			stream: false
		};
		headers = { ...headers, 'api-key': provider.apiKey };
	} else if (isAnthropic) {
		requestUrl = provider.baseUrl;
		const anthropicMessages = messages.filter(m => m.role !== 'system');
		requestBody = {
			model: model.providerModelId,
			max_tokens: maxTokens,
			messages: anthropicMessages.length > 0 ? anthropicMessages : [{ role: 'user', content: 'Hello' }],
			temperature: temperature ?? 0.5,
			system: systemMsg
		};
		headers = {
			...headers,
			'x-api-key': provider.apiKey,
			'anthropic-version': '2023-06-01',
			'anthropic-dangerous-direct-browser-access': 'true'
		};
	} else if (isPerplexity) {
		requestUrl = provider.baseUrl;
		requestBody = {
			model: model.providerModelId,
			max_tokens: maxTokens,
			messages: [systemMessage, ...messages],
			temperature: temperature ?? 0.3
		};
		headers = {
			...headers,
			'HTTP-Referer': 'https://obsidian.md/',
			'X-Title': 'Obsidian Web Clipper',
			'Authorization': `Bearer ${provider.apiKey}`
		};
	} else if (isOllama) {
		requestUrl = provider.baseUrl;
		const ollamaBody: any = {
			model: model.providerModelId,
			messages: [systemMessage, ...messages],
			temperature: temperature ?? 0.5,
			stream: false
		};
		if (format) ollamaBody.format = format;
		ollamaBody.num_ctx = 120000;
		requestBody = ollamaBody;
	} else {
		requestUrl = provider.baseUrl;
		requestBody = {
			model: model.providerModelId,
			messages: [systemMessage, ...messages]
		};
		headers = {
			...headers,
			'HTTP-Referer': 'https://obsidian.md/',
			'X-Title': 'Obsidian Web Clipper',
			'Authorization': `Bearer ${provider.apiKey}`
		};
	}

	return { requestUrl, requestBody, headers, isAnthropic, isOllama };
}

function extractReply(data: any, isAnthropic: boolean, isOllama: boolean): string {
	if (isAnthropic) return data.content?.[0]?.text || '';
	if (isOllama) return data.message?.content || '';
	return data.choices?.[0]?.message?.content || '';
}

export async function chatComplete(options: ChatCompleteOptions): Promise<string> {
	const { model, messages, system = '', maxTokens, temperature, signal } = options;
	const provider = findProvider(model);

	if (provider.apiKeyRequired && !provider.apiKey) {
		throw new Error(`API key is not set for provider ${provider.name}`);
	}

	checkRateLimit();
	const requestStart = Date.now();

	const { requestUrl, requestBody, headers, isAnthropic, isOllama } = buildRequest(
		provider, model, messages, system, { maxTokens, temperature }
	);

	debugLog('LLM', `Sending chat request to ${provider.name}:`, requestBody);

	const response = await fetch(requestUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify(requestBody),
		signal
	});

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`${provider.name} error response:`, errorText);
		if (isOllama && response.status === 403) {
			throw new Error(
				'Ollama cannot process requests originating from a browser extension without setting OLLAMA_ORIGINS. ' +
				'See instructions at https://help.obsidian.md/web-clipper/interpreter'
			);
		}
		throw new Error(`${provider.name} error: ${response.statusText} ${errorText}`);
	}

	const data = await response.json();
	debugLog('LLM', `Parsed ${provider.name} response:`, data);

	const reply = extractReply(data, isAnthropic, isOllama);
	if (!reply) throw new Error(`Empty response from ${provider.name}`);

	lastRequestTime = requestStart;
	return reply;
}

export function getLastRequestTime(): number {
	return lastRequestTime;
}

export function resetRateLimit(): void {
	lastRequestTime = 0;
}
