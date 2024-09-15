import { generalSettings } from './storage-utils';

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

interface PromptVariable {
  key: string;
  prompt: string;
}

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
		const systemContent = JSON.stringify(promptVariables.reduce((acc: { [key: string]: string }, { key, prompt }) => {
			acc[key] = prompt;
			return acc;
		}, {}));

		const requestBody = {
			model: model,
			messages: [
					{ role: 'system', content: `You are a helpful assistant. Please respond to the following prompts in JSON format: ${systemContent}` },
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
		return data.choices[0].message.content;
	} catch (error) {
		console.error('Error in sendToLLM:', error);
		throw error;
	}
}