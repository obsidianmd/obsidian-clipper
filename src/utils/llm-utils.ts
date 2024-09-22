import { generalSettings, ModelConfig } from './storage-utils';
import { PromptVariable, Template } from '../types/types';
import { replaceVariables } from './content-extractor';
import { applyFilters } from './filters';
import { formatDuration } from './string-utils';

const RATE_LIMIT_RESET_TIME = 60000; // 1 minute in milliseconds
let lastRequestTime = 0;

export async function sendToLLM(userPrompt: string, content: string, promptVariables: PromptVariable[], model: ModelConfig, apiKey: string): Promise<{ userResponse: any; promptResponses: any[] }> {
	if (!apiKey) {
		throw new Error(`API key is not set for model ${model.name}`);
	}

	const now = Date.now();
	if (now - lastRequestTime < RATE_LIMIT_RESET_TIME) {
		throw new Error(`Rate limit cooldown. Please wait ${Math.ceil((RATE_LIMIT_RESET_TIME - (now - lastRequestTime)) / 1000)} seconds before trying again.`);
	}

	try {
		const systemContent = {
			variables: promptVariables.map(({ key, prompt }) => ({ key, prompt })),
			instructions: "You are a helpful assistant. Please respond to each variable prompt. Format your response as a JSON object with 'variable_responses' for the variable prompts. Make your responses concise."
		};

		let requestBody: any;
		let headers: HeadersInit = {
			'Content-Type': 'application/json',
		};

		if (model.provider === 'Anthropic') {
			requestBody = {
				model: model.id,
				max_tokens: 800,
				messages: [
					{ role: 'user', content: `${userPrompt}` }
				],
				system: JSON.stringify(systemContent)
			};
			headers = {
				...headers,
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true'
			};
		} else {
			requestBody = {
				model: model.id,
				messages: [
					{ role: 'system', content: JSON.stringify(systemContent) },
					{ role: 'user', content: `${userPrompt}` }
				]
			};
			headers = {
				...headers,
				'Authorization': `Bearer ${apiKey}`
			};
		}

		console.log(`Sending request to ${model.provider || 'Custom'} API:`, requestBody);

		const response = await fetch(model.baseUrl, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			if (response.status === 429) {
				lastRequestTime = now;
				throw new Error(`${model.provider || 'API'} rate limit exceeded. Please try again in about a minute.`);
			} else {
				const errorData = await response.json();
				console.error(`${model.provider || 'API'} error response:`, errorData);
				throw new Error(`${model.provider || 'API'} error: ${response.statusText} ${errorData.error?.message || ''}`);
			}
		}

		const data = await response.json();
		console.log(`${model.provider || 'API'} response:`, data);

		lastRequestTime = now;

		let llmResponseContent: string;
		if (model.provider === 'Anthropic') {
			llmResponseContent = JSON.stringify(data);
		} else {
			llmResponseContent = data.choices[0].message.content;
		}
		console.log('Raw LLM response:', llmResponseContent);

		return model.provider === 'Anthropic' 
			? parseAnthropicResponse(llmResponseContent, promptVariables)
			: parseLLMResponse(llmResponseContent, promptVariables);
	} catch (error) {
		console.error(`Error sending to ${model.provider || 'Custom'} LLM:`, error);
		throw error;
	}
}

function parseLLMResponse(responseContent: string, promptVariables: PromptVariable[]): { userResponse: any; promptResponses: any[] } {
	let parsedResponse;
	try {
		// Remove code block markers if they exist
		const cleanedResponse = responseContent.replace(/^```json\n|\n```$/g, '');
		parsedResponse = JSON.parse(cleanedResponse);
	} catch (parseError) {
		console.warn('Failed to parse LLM response as JSON. Using raw response.');
		return {
			userResponse: responseContent,
			promptResponses: []
		};
	}

	const userResponse = parsedResponse.user_response || '';
	let promptResponses: any[] = [];

	if (parsedResponse.variable_responses) {
		promptResponses = promptVariables.map(variable => {
			const response = parsedResponse.variable_responses[variable.key] || parsedResponse.variable_responses[variable.prompt];
			return {
				key: variable.key,
				prompt: variable.prompt,
				user_response: response !== undefined ? response : ''
			};
		});
	}

	return {
		userResponse: promptResponses.find(r => r.key === 'prompt_1')?.user_response || userResponse,
		promptResponses
	};
}

function parseAnthropicResponse(responseContent: string, promptVariables: PromptVariable[]): { userResponse: any; promptResponses: any[] } {
	let parsedResponse;
	try {
		// Parse the entire Anthropic response
		const anthropicResponse = JSON.parse(responseContent);
		
		// Extract the text content from the response
		const textContent = anthropicResponse.content[0]?.text;
		
		if (!textContent) {
			throw new Error('No text content found in Anthropic response');
		}
		
		// Find the JSON object within the text content
		const jsonMatch = textContent.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			parsedResponse = JSON.parse(jsonMatch[0]);
		} else {
			throw new Error('No JSON found in Anthropic response');
		}
	} catch (parseError) {
		console.warn('Failed to parse Anthropic response:', parseError);
		return {
			userResponse: responseContent,
			promptResponses: []
		};
	}

	const userResponse = parsedResponse.user_response || '';
	let promptResponses: any[] = [];

	if (parsedResponse.variable_responses) {
		promptResponses = promptVariables.map(variable => ({
			key: variable.key,
			prompt: variable.prompt,
			user_response: parsedResponse.variable_responses[variable.key] || ''
		}));
	}

	return {
		userResponse,
		promptResponses
	};
}

export async function processLLM(
	promptToUse: string,
	contentToProcess: string,
	promptVariables: PromptVariable[],
	updateUI: (response: string) => void,
	updateFields: (variables: PromptVariable[], responses: any[]) => void,
	model: ModelConfig,
	template: Template
): Promise<void> {
	try {
		if (!model.apiKey) {
			throw new Error(`No API key is set for model ${model.name}. Please set an API key in the extension settings.`);
		}

		if (promptVariables.length === 0) {
			throw new Error('No prompt variables found. Please add at least one prompt variable to your template.');
		}

		// Use the template context if available, otherwise fall back to the default prompt context
		const contextToUse = template.context || generalSettings.defaultPromptContext || "You are a helpful assistant. Please analyze the following content and provide a concise summary.";

		const { userResponse, promptResponses } = await sendToLLM(contextToUse, contentToProcess, promptVariables, model, model.apiKey);
		console.log('LLM Response:', { userResponse, promptResponses });

		// Convert userResponse to string if it's an array or object
		const stringResponse = typeof userResponse === 'object' ? JSON.stringify(userResponse, null, 2) : userResponse;
		updateUI(stringResponse);
		
		// Update fields with all prompt responses
		updateFields(promptVariables, promptResponses);

	} catch (error) {
		console.error('Error getting LLM response:', error);
		if (error instanceof Error) {
			throw new Error(`${error.message}`);
		} else {
			throw new Error('An unknown error occurred while processing the LLM request.');
		}
	}
}

export function collectPromptVariables(template: Template | null): PromptVariable[] {
	const promptMap = new Map<string, PromptVariable>();
	const promptRegex = /{{prompt:"(.*?)"(\|.*?)?}}/g;
	let match;

	function addPrompt(prompt: string, filters: string) {
		if (!promptMap.has(prompt)) {
			const key = `prompt_${promptMap.size + 1}`;
			promptMap.set(prompt, { key, prompt, filters });
		}
	}

	if (template?.noteContentFormat) {
		while ((match = promptRegex.exec(template.noteContentFormat)) !== null) {
			addPrompt(match[1], match[2] || '');
		}
	}

	if (template?.properties) {
		for (const property of template.properties) {
			let propertyValue = property.value;
			while ((match = promptRegex.exec(propertyValue)) !== null) {
				addPrompt(match[1], match[2] || '');
			}
		}
	}

	// Add this section to collect prompts from all input fields
	const allInputs = document.querySelectorAll('input, textarea');
	allInputs.forEach((input) => {
		if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
			let inputValue = input.value;
			while ((match = promptRegex.exec(inputValue)) !== null) {
				addPrompt(match[1], match[2] || '');
			}
		}
	});

	return Array.from(promptMap.values());
}

export async function initializeLLMComponents(template: Template, variables: { [key: string]: string }, tabId: number, currentUrl: string) {
	const interpreterContainer = document.getElementById('interpreter');
	const interpretBtn = document.getElementById('interpret-btn');
	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;
	const modelSelect = document.getElementById('model-select') as HTMLSelectElement;

	const promptVariables = collectPromptVariables(template);

	// Hide interpreter if it's disabled or there are no prompt variables
	if (!generalSettings.interpreterEnabled || promptVariables.length === 0) {
		if (interpreterContainer) interpreterContainer.style.display = 'none';
		if (interpretBtn) interpretBtn.style.display = 'none';
		return;
	}

	if (interpreterContainer) interpreterContainer.style.display = 'flex';
	if (interpretBtn) interpretBtn.style.display = 'inline-block';
	
	if (promptContextTextarea) {
		let promptToDisplay = template.context || generalSettings.defaultPromptContext;
		promptToDisplay = await replaceVariables(tabId, promptToDisplay, variables, currentUrl);
		promptContextTextarea.value = promptToDisplay;

		promptContextTextarea.addEventListener('input', () => {
			template.context = promptContextTextarea.value;
		});
	}

	if (template) {
		if (interpretBtn) {
			interpretBtn.addEventListener('click', async () => {
				const selectedModelId = modelSelect.value;
				const modelConfig = generalSettings.models.find(m => m.id === selectedModelId);
				if (!modelConfig) {
					throw new Error(`Model configuration not found for ${selectedModelId}`);
				}
				await handleLLMProcessing(template, variables, tabId, currentUrl, modelConfig);
			});
		}
		if (modelSelect) {
			modelSelect.style.display = 'inline-block';
			modelSelect.innerHTML = generalSettings.models
				.filter(model => model.enabled)
				.map(model => 
					`<option value="${model.id}">${model.name}</option>`
				).join('');
			modelSelect.value = generalSettings.interpreterModel || (generalSettings.models[0]?.id ?? '');
		}
	}
}

export async function handleLLMProcessing(
	template: Template,
	variables: { [key: string]: string },
	tabId: number,
	currentUrl: string,
	modelConfig: ModelConfig
): Promise<void> {
	const interpreterContainer = document.getElementById('interpreter');
	const interpretBtn = document.getElementById('interpret-btn') as HTMLButtonElement;
	const interpreterErrorMessage = document.getElementById('interpreter-error') as HTMLDivElement;
	const llmTimer = document.getElementById('llm-timer') as HTMLSpanElement;
	const clipButton = document.getElementById('clip-button') as HTMLButtonElement;
	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;

	try {
		// Hide any previous error message
		interpreterErrorMessage.style.display = 'none';
		interpreterErrorMessage.textContent = '';

		// Remove any previous done or error classes
		interpreterContainer?.classList.remove('done', 'error');

		let apiKey: string | undefined;
		if (modelConfig.provider === 'OpenAI') {
			apiKey = generalSettings.openaiApiKey;
		} else if (modelConfig.provider === 'Anthropic') {
			apiKey = generalSettings.anthropicApiKey;
		} else {
			apiKey = modelConfig.apiKey;
		}

		if (!apiKey) {
			throw new Error(`No API key is set for ${modelConfig.provider || 'the selected model'}. Please set an API key in the extension settings.`);
		}

		const promptVariables = collectPromptVariables(template);

		if (promptVariables.length === 0) {
			throw new Error('No prompt variables found. Please add at least one prompt variable to your template.');
		}

		// Use the content from the prompt-context textarea
		const contextToUse = promptContextTextarea.value || generalSettings.defaultPromptContext || "You are a helpful assistant. Please analyze the following content and provide a concise summary.";

		const contentToProcess = variables.content || '';

		// Start the timer
		const startTime = performance.now();
		let timerInterval: number;

		// Change button text and add class
		interpretBtn.textContent = 'thinking';
		interpretBtn.classList.add('processing');

		// Disable the clip button
		clipButton.disabled = true;

		// Show and update the timer
		llmTimer.style.display = 'inline';
		llmTimer.textContent = '0ms';

		// Update the timer text with elapsed time
		timerInterval = window.setInterval(() => {
			const elapsedTime = performance.now() - startTime;
			llmTimer.textContent = formatDuration(elapsedTime);
		}, 10);

		const { userResponse, promptResponses } = await sendToLLM(contextToUse, contentToProcess, promptVariables, modelConfig, apiKey);
		console.log('LLM Response:', { userResponse, promptResponses });

		// Stop the timer and log the final time
		clearInterval(timerInterval);
		const endTime = performance.now();
		const totalTime = endTime - startTime;
		console.log(`LLM processing completed in ${formatDuration(totalTime)}`);

		// Update the final time in the timer element
		llmTimer.textContent = formatDuration(totalTime);

		// Revert button text and remove class
		interpretBtn.textContent = 'done';
		interpretBtn.classList.remove('processing');
		interpretBtn.classList.add('done');
		interpretBtn.disabled = true;

		// Add done class to interpreter container
		interpreterContainer?.classList.add('done');

		// Update UI with response
		updateLLMResponse(userResponse);
		
		// Update fields with all prompt responses
		updateFieldsWithLLMResponses(promptVariables, promptResponses);

		// Re-enable the clip button
		clipButton.disabled = false;

	} catch (error) {
		console.error('Error processing LLM:', error);
		
		// Revert button text and remove class in case of error
		interpretBtn.textContent = 'error';
		interpretBtn.classList.remove('processing');
		interpretBtn.classList.add('error');
		interpretBtn.disabled = true;

		// Add error class to interpreter container
		interpreterContainer?.classList.add('error');

		// Hide the timer
		llmTimer.style.display = 'none';

		// Display the error message
		interpreterErrorMessage.textContent = error instanceof Error ? error.message : 'An unknown error occurred while processing the LLM request.';
		interpreterErrorMessage.style.display = 'block';

		// Re-enable the clip button
		clipButton.disabled = false;

		if (error instanceof Error) {
			throw new Error(`${error.message}`);
		} else {
			throw new Error('An unknown error occurred while processing the LLM request.');
		}
	}
}

function updateLLMResponse(response: string) {
	const interpreterErrorMessage = document.getElementById('interperter-error');
	if (interpreterErrorMessage) {
		interpreterErrorMessage.style.display = 'none';
		interpreterErrorMessage.textContent = '';
	}
}

export function updateFieldsWithLLMResponses(promptVariables: PromptVariable[], promptResponses: any[]) {
	const allInputs = document.querySelectorAll('input, textarea');
	allInputs.forEach((input) => {
		if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
			input.value = input.value.replace(/{{prompt:"(.*?)"(\|.*?)?}}/g, (match, promptText, filters) => {
				const variable = promptVariables.find(v => v.prompt === promptText);
				if (!variable) return match;

				const response = promptResponses.find(r => r.key === variable.key);
				if (response && response.user_response !== undefined) {
					let value = response.user_response;
					
					// Handle array or object responses
					if (typeof value === 'object') {
						try {
							value = JSON.stringify(value, null, 2);
						} catch (error) {
							console.error('Error stringifying object:', error);
							value = String(value);
						}
					}

					if (filters) {
						value = applyFilters(value, filters.slice(1));
					}
					
					return value;
				}
				return match; // Return original if no match found
			});
		}
	});
}