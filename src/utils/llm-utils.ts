import { generalSettings, saveGeneralSettings } from './storage-utils';

export async function initializeLLMSettings(): Promise<void> {
	const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
	const modelSelect = document.getElementById('openai-model') as HTMLSelectElement;

	if (apiKeyInput && modelSelect) {
		apiKeyInput.value = generalSettings.openaiApiKey || '';
		modelSelect.value = generalSettings.openaiModel || 'gpt-3.5-turbo';

		apiKeyInput.addEventListener('change', () => {
			generalSettings.openaiApiKey = apiKeyInput.value;
			saveGeneralSettings();
		});

		modelSelect.addEventListener('change', () => {
			generalSettings.openaiModel = modelSelect.value;
			saveGeneralSettings();
		});
	}
}

export async function sendToLLM(prompt: string, content: string): Promise<string> {
	const apiKey = generalSettings.openaiApiKey;
	const model = generalSettings.openaiModel || 'gpt-3.5-turbo';

	if (!apiKey) {
		throw new Error('OpenAI API key is not set');
	}

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: model,
			messages: [
				{ role: 'system', content: 'You are a helpful assistant.' },
				{ role: 'user', content: `${prompt}\n\nContent: ${content}` }
			]
		})
	});

	if (!response.ok) {
		throw new Error(`OpenAI API error: ${response.statusText}`);
	}

	const data = await response.json();
	return data.choices[0].message.content;
}