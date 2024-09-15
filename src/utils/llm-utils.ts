import { generalSettings } from './storage-utils';
import { PromptVariable } from '../types/types';

export function initializeLLMSettings(): void {
	const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
	const modelSelect = document.getElementById('openai-model') as HTMLSelectElement;

	if (apiKeyInput && modelSelect) {
		apiKeyInput.value = generalSettings.openaiApiKey || '';
		modelSelect.value = generalSettings.openaiModel || 'gpt-3.5-turbo';
	}
}

const RATE_LIMIT_RESET_TIME = 60000; // 1 minute in milliseconds
let lastRequestTime = 0;

export async function sendToLLM(userPrompt: string, content: string, promptVariables: PromptVariable[]): Promise<{ userResponse: string; promptResponses: { [key: string]: string } }> {
	const apiKey = generalSettings.openaiApiKey;
	const model = generalSettings.openaiModel || 'gpt-3.5-turbo';

	if (!apiKey) {
		throw new Error('OpenAI API key is not set');
	}

	// Simple cooldown
	const now = Date.now();
	if (now - lastRequestTime < RATE_LIMIT_RESET_TIME) {
		throw new Error(`Rate limit cooldown. Please wait ${Math.ceil((RATE_LIMIT_RESET_TIME - (now - lastRequestTime)) / 1000)} seconds before trying again.`);
	}

	try {
		const systemContent = {
			variables: promptVariables.map(({ key, prompt }) => ({ key, prompt })),
			instructions: "Please respond to the user prompt and each variable prompt. Format your response as a JSON object with 'user_response' for the main prompt and 'variable_responses' for the variable prompts."
		};

		const requestBody = {
			model: model,
			messages: [
				{ role: 'system', content: JSON.stringify(systemContent) },
				{ role: 'user', content: `${userPrompt}\n\nContent: ${content}` }
			]
		};

		console.log('Sending request to OpenAI API:', requestBody);

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			if (response.status === 429) {
				lastRequestTime = now; // Set the last request time on rate limit error
				throw new Error('OpenAI API rate limit exceeded. Please try again in about a minute.');
			} else {
				const errorData = await response.json();
				console.error('OpenAI API error response:', errorData);
				throw new Error(`OpenAI API error: ${response.statusText}. ${errorData.error?.message || ''}`);
			}
		}

		const data = await response.json();
		console.log('OpenAI API response:', data);

		lastRequestTime = now; // Set the last request time on successful request

		const llmResponse = JSON.parse(data.choices[0].message.content);
		return {
			userResponse: llmResponse.user_response || '',
			promptResponses: llmResponse.variable_responses || {}
		};
	} catch (error) {
		console.error('Error in sendToLLM:', error);
		throw error;
	}
}