import { generalSettings } from './storage-utils';
import { PromptVariable, Template } from '../types/types';
import { replaceVariables } from './content-extractor';
import { applyFilters } from './filters';

export function initializeLLMSettings(): void {
	const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
	const modelSelect = document.getElementById('default-model') as HTMLSelectElement;

	if (apiKeyInput && modelSelect) {
		apiKeyInput.value = generalSettings.openaiApiKey || '';
		modelSelect.value = generalSettings.openaiModel || 'gpt-4o-mini';
	}
}

const RATE_LIMIT_RESET_TIME = 60000; // 1 minute in milliseconds
let lastRequestTime = 0;

export async function sendToLLM(userPrompt: string, content: string, promptVariables: PromptVariable[]): Promise<{ userResponse: string; promptResponses: any[] }> {
	const apiKey = generalSettings.openaiApiKey;
	const model = generalSettings.openaiModel || 'gpt-4o-mini';

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
				throw new Error(`OpenAI API error: ${response.statusText} ${errorData.error?.message || ''}`);
			}
		}

		const data = await response.json();
		console.log('OpenAI API response:', data);

		lastRequestTime = now; // Set the last request time on successful request

		const llmResponseContent = data.choices[0].message.content;
		console.log('Raw LLM response:', llmResponseContent);

		let parsedResponse;
		try {
			// Check if the response is already a JSON object
			if (typeof llmResponseContent === 'object' && llmResponseContent !== null) {
				parsedResponse = llmResponseContent;
			} else {
				// Remove code block markers if they exist
				const cleanedResponse = llmResponseContent.replace(/^```json\n|\n```$/g, '');
				parsedResponse = JSON.parse(cleanedResponse);
			}
		} catch (parseError) {
			console.warn('Failed to parse LLM response as JSON. Using raw response.');
			return {
				userResponse: llmResponseContent,
				promptResponses: []
			};
		}

		const userResponse = parsedResponse.user_response || '';
		let promptResponses: any[] = [];

		if (parsedResponse.variable_responses) {
			if (Array.isArray(parsedResponse.variable_responses)) {
				promptResponses = promptVariables.map((variable, index) => {
					const response = parsedResponse.variable_responses[index];
					return {
						key: variable.key,
						prompt: variable.prompt,
						user_response: response ? response.user_response : ''
					};
				});
			} else if (typeof parsedResponse.variable_responses === 'object') {
				promptResponses = promptVariables.map(variable => {
					const response = parsedResponse.variable_responses[variable.key];
					return {
						key: variable.key,
						prompt: variable.prompt,
						user_response: response || ''
					};
				});
			}
		}

		return {
			userResponse,
			promptResponses
		};
	} catch (error) {
		console.error('Error sending to LLM:', error);
		throw error;
	}
}

export async function processLLM(
	promptToUse: string,
	contentToProcess: string,
	promptVariables: PromptVariable[],
	updateUI: (response: string) => void,
	updateFields: (variables: PromptVariable[], responses: any[]) => void
): Promise<void> {
	try {
		if (!generalSettings.openaiApiKey) {
			console.warn('OpenAI API key is not set. Skipping LLM processing.');
			throw new Error('OpenAI API key is not set. Please set it in the extension settings.');
		}

		const { userResponse, promptResponses } = await sendToLLM(promptToUse, contentToProcess, promptVariables);
		console.log('LLM Response:', { userResponse, promptResponses });

		updateUI(userResponse);
		
		// Only update fields if promptResponses is not empty
		if (promptResponses.length > 0) {
			updateFields(promptVariables, promptResponses);
		} else {
			console.warn('No prompt responses received from LLM.');
		}

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
	const llmContainer = document.getElementById('llm-container');
	const processLlmBtn = document.getElementById('process-llm-btn');
	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;

	if (template && template.prompt) {
		if (llmContainer) llmContainer.style.display = 'flex';
		if (promptContextTextarea) {
			let promptToDisplay = await replaceVariables(tabId, template.prompt, variables, currentUrl);
			promptContextTextarea.value = promptToDisplay;
		}
		if (processLlmBtn) {
			processLlmBtn.addEventListener('click', () => handleLLMProcessing(template, variables, tabId, currentUrl));
		}
	} else {
		if (llmContainer) llmContainer.style.display = 'none';
	}
}

export async function handleLLMProcessing(template: Template, variables: { [key: string]: string }, tabId: number, currentUrl: string) {
	const processLlmBtn = document.getElementById('process-llm-btn') as HTMLButtonElement;
	const llmErrorMessage = document.getElementById('llm-error-message') as HTMLDivElement;
	
	try {
		// Hide any previous error message
		llmErrorMessage.style.display = 'none';
		llmErrorMessage.textContent = '';

		const contentToProcess = variables.content || '';
		const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;
		
		if (tabId && currentUrl && promptContextTextarea) {
			let promptToUse = promptContextTextarea.value;

			const promptVariables = collectPromptVariables(template);

			console.log('Unique prompts to be sent to LLM:', { 
				userPrompt: promptToUse, 
				promptVariables: promptVariables.map(({ key, prompt }) => ({ key, prompt }))
			});

			// Change button text and add class
			processLlmBtn.textContent = 'Processing';
			processLlmBtn.classList.add('processing');

			await processLLM(
				promptToUse,
				contentToProcess,
				promptVariables,
				updateLLMResponse,
				updateFieldsWithLLMResponses
			);

			// Revert button text and remove class
			processLlmBtn.textContent = 'Process with LLM';
			processLlmBtn.classList.remove('processing');
		} else {
			console.log('Skipping LLM processing: missing tab ID, URL, or prompt');
			throw new Error('Skipping LLM processing: missing tab ID, URL, or prompt');
		}
	} catch (error) {
		console.error('Error processing LLM:', error);
		
		// Revert button text and remove class in case of error
		processLlmBtn.textContent = 'Process with LLM';
		processLlmBtn.classList.remove('processing');

		// Display the error message
		llmErrorMessage.textContent = error instanceof Error ? error.message : 'An unknown error occurred while processing the LLM request.';
		llmErrorMessage.style.display = 'block';

		if (error instanceof Error) {
			throw error;
		} else {
			throw new Error('An unknown error occurred while processing the LLM request.');
		}
	}
}

function updateLLMResponse(response: string) {
	const llmErrorMessage = document.getElementById('llm-error-message');
	if (llmErrorMessage) {
		llmErrorMessage.style.display = 'none';
		llmErrorMessage.textContent = '';
	}

	const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement;
	if (noteContentField) {
		noteContentField.value = `${noteContentField.value}`;
	}
}

export function updateFieldsWithLLMResponses(promptVariables: PromptVariable[], promptResponses: any[]) {
	const allInputs = document.querySelectorAll('input, textarea');
	allInputs.forEach((input) => {
		if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
			input.value = input.value.replace(/{{prompt:"(.*?)"(\|.*?)?}}/g, (match, promptText, filters) => {
				const response = promptResponses.find(r => r.prompt === promptText);
				if (response && response.user_response) {
					let value = response.user_response;
					if (filters) {
						const filterNames = filters.slice(1).split('|');
						value = applyFilters(value, filterNames);
					}
					return value;
				}
				return match;
			});
		}
	});
}