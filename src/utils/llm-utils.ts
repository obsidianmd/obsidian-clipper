import { generalSettings } from './storage-utils';
import { PromptVariable, Template } from '../types/types';
import { replaceVariables } from './content-extractor';
import { applyFilters } from './filters';

const RATE_LIMIT_RESET_TIME = 60000; // 1 minute in milliseconds
let lastRequestTime = 0;

async function sendToAnthropic(userPrompt: string, content: string, promptVariables: PromptVariable[]): Promise<{ userResponse: any; promptResponses: any[] }> {
	const apiKey = generalSettings.anthropicApiKey;
	const model = generalSettings.interpreterModel;

	if (!apiKey) {
		throw new Error('Anthropic API key is not set');
	}

	try {
		const systemContent = {
			variables: promptVariables.map(({ key, prompt }) => ({ key, prompt })),
			instructions: "Please respond to the user prompt and each variable prompt. Format your response as a JSON object with 'user_response' for the main prompt and 'variable_responses' for the variable prompts."
		};

		const requestBody = {
			model: model,
			max_tokens: 1000,
			messages: [
				{ role: 'user', content: `${userPrompt}\n\nContent: ${content}` }
			],
			system: JSON.stringify(systemContent)
		};

		console.log('Sending request to Anthropic API:', requestBody);

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true'
			},
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorData = await response.json();
			console.error('Anthropic API error response:', errorData);
			throw new Error(`Anthropic API error: ${response.statusText} ${errorData.error?.message || ''}`);
		}

		const data = await response.json();
		console.log('Anthropic API response:', data);

		const llmResponseContent = data.content[0].text;
		console.log('Raw LLM response:', llmResponseContent);

		return parseAnthropicResponse(llmResponseContent, promptVariables);
	} catch (error) {
		console.error('Error sending to Anthropic LLM:', error);
		throw error;
	}
}

function parseAnthropicResponse(responseContent: string, promptVariables: PromptVariable[]): { userResponse: any; promptResponses: any[] } {
	let parsedResponse;
	try {
		// First, try to parse the entire response as JSON
		parsedResponse = JSON.parse(responseContent);
	} catch (parseError) {
		console.warn('Failed to parse entire LLM response as JSON. Attempting to extract JSON from the response.');
		// If that fails, try to extract JSON from the response
		const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
		if (jsonMatch) {
			try {
				parsedResponse = JSON.parse(jsonMatch[0]);
			} catch (extractError) {
				console.warn('Failed to extract JSON from LLM response. Using raw response.');
				parsedResponse = { user_response: responseContent };
			}
		} else {
			console.warn('No JSON found in LLM response. Using raw response.');
			parsedResponse = { user_response: responseContent };
		}
	}

	const userResponse = parsedResponse.user_response || '';
	let promptResponses: any[] = [];

	if (parsedResponse.variable_responses) {
		promptResponses = promptVariables.map(variable => ({
			key: variable.key,
			prompt: variable.prompt,
			user_response: parsedResponse.variable_responses[variable.key] || parsedResponse.variable_responses[variable.prompt] || ''
		}));
	}

	return {
		userResponse: promptResponses.find(r => r.key === 'prompt_1')?.user_response || userResponse,
		promptResponses
	};
}

async function sendToOpenAI(userPrompt: string, content: string, promptVariables: PromptVariable[]): Promise<{ userResponse: any; promptResponses: any[] }> {
	const apiKey = generalSettings.openaiApiKey;
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
			model: generalSettings.interpreterModel || 'gpt-4o-mini',
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

		return parseOpenAIResponse(llmResponseContent, promptVariables);
	} catch (error) {
		console.error('Error sending to OpenAI LLM:', error);
		throw error;
	}
}

function parseOpenAIResponse(responseContent: string, promptVariables: PromptVariable[]): { userResponse: any; promptResponses: any[] } {
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

export async function sendToLLM(userPrompt: string, content: string, promptVariables: PromptVariable[]): Promise<{ userResponse: any; promptResponses: any[] }> {
	const model = generalSettings.interpreterModel || 'gpt-4o-mini';

	if (model.startsWith('claude-')) {
		return sendToAnthropic(userPrompt, content, promptVariables);
	} else {
		return sendToOpenAI(userPrompt, content, promptVariables);
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
		if (!generalSettings.openaiApiKey && !generalSettings.anthropicApiKey) {
			throw new Error('No API key is set. Please set an API key in the extension settings.');
		}

		if (promptVariables.length === 0) {
			throw new Error('No prompt variables found. Please add at least one prompt variable to your template.');
		}

		const { userResponse, promptResponses } = await sendToLLM(promptToUse, contentToProcess, promptVariables);
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

	if (template && template.prompt) {
		if (interpreterContainer) interpreterContainer.style.display = 'flex';
		if (promptContextTextarea) {
			let promptToDisplay = await replaceVariables(tabId, template.prompt, variables, currentUrl);
			promptContextTextarea.value = promptToDisplay;
		}
		if (interpretBtn) {
			interpretBtn.addEventListener('click', () => handleLLMProcessing(template, variables, tabId, currentUrl));
		}
	} else {
		if (interpreterContainer) interpreterContainer.style.display = 'none';
	}
}

export async function handleLLMProcessing(template: Template, variables: { [key: string]: string }, tabId: number, currentUrl: string) {
	const interpretBtn = document.getElementById('interpret-btn') as HTMLButtonElement;
	const interpreterErrorMessage = document.getElementById('interpreter-error') as HTMLDivElement;
	
	try {
		// Hide any previous error message
		interpreterErrorMessage.style.display = 'none';
		interpreterErrorMessage.textContent = '';

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
			interpretBtn.textContent = 'Processing';
			interpretBtn.classList.add('processing');

			await processLLM(
				promptToUse,
				contentToProcess,
				promptVariables,
				updateLLMResponse,
				updateFieldsWithLLMResponses
			);

			// Revert button text and remove class
			interpretBtn.textContent = 'Process with LLM';
			interpretBtn.classList.remove('processing');
		} else {
			throw new Error('Missing tab ID, URL, or prompt');
		}
	} catch (error) {
		console.error('Error processing LLM:', error);
		
		// Revert button text and remove class in case of error
		interpretBtn.textContent = 'Process with LLM';
		interpretBtn.classList.remove('processing');

		// Display the error message
		interpreterErrorMessage.textContent = error instanceof Error ? error.message : 'An unknown error occurred while processing the LLM request.';
		interpreterErrorMessage.style.display = 'block';
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
				const response = promptResponses.find(r => r.prompt === promptText);
				if (response && response.user_response !== undefined) {
					let value = response.user_response;
					
					if (filters) {
						const filterNames = filters.slice(1).split('|').filter(Boolean);
						value = applyFilters(value, filterNames);
					}
					
					// Handle array or object responses
					if (typeof value === 'object') {
						try {
							value = JSON.stringify(value, null, 2);
						} catch (error) {
							console.error('Error stringifying object:', error);
							value = String(value);
						}
					}
					
					return value;
				}
				return match; // Return original if no match found
			});
		}
	});
}