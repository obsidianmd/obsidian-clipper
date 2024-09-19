import { generalSettings } from './storage-utils';
import { PromptVariable, Template } from '../types/types';
import { replaceVariables } from './content-extractor';
import { applyFilters } from './filters';
import { formatDuration } from './string-utils';
import { modelList } from './model-list';

const RATE_LIMIT_RESET_TIME = 60000; // 1 minute in milliseconds
let lastRequestTime = 0;

async function sendToAnthropic(userPrompt: string, content: string, promptVariables: PromptVariable[], model: string): Promise<{ userResponse: any; promptResponses: any[] }> {
	const apiKey = generalSettings.anthropicApiKey;

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

async function sendToOpenAI(userPrompt: string, content: string, promptVariables: PromptVariable[], model: string): Promise<{ userResponse: any; promptResponses: any[] }> {
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

export async function sendToLLM(userPrompt: string, content: string, promptVariables: PromptVariable[], model: string): Promise<{ userResponse: any; promptResponses: any[] }> {
	if (model.startsWith('claude-')) {
		return sendToAnthropic(userPrompt, content, promptVariables, model);
	} else {
		return sendToOpenAI(userPrompt, content, promptVariables, model);
	}
}

export async function processLLM(
	promptToUse: string,
	contentToProcess: string,
	promptVariables: PromptVariable[],
	updateUI: (response: string) => void,
	updateFields: (variables: PromptVariable[], responses: any[]) => void,
	model: string,
	template: Template
): Promise<void> {
	try {
		if (!generalSettings.openaiApiKey && !generalSettings.anthropicApiKey) {
			throw new Error('No API key is set. Please set an API key in the extension settings.');
		}

		if (promptVariables.length === 0) {
			throw new Error('No prompt variables found. Please add at least one prompt variable to your template.');
		}

		// Use the template context if available, otherwise fall back to the default prompt context
		const contextToUse = template.context || generalSettings.defaultPromptContext || "You are a helpful assistant. Please analyze the following content and provide a concise summary.";

		const { userResponse, promptResponses } = await sendToLLM(contextToUse, contentToProcess, promptVariables, model);
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
		return;
	}

	if (interpreterContainer) interpreterContainer.style.display = 'flex';
	
	if (promptContextTextarea) {
		let promptToDisplay = template.context || generalSettings.defaultPromptContext;
		promptToDisplay = await replaceVariables(tabId, promptToDisplay, variables, currentUrl);
		promptContextTextarea.value = promptToDisplay;
	}

	if (template) {
		if (interpretBtn) {
			interpretBtn.addEventListener('click', () => handleLLMProcessing(template, variables, tabId, currentUrl, modelSelect.value));
		}
		if (modelSelect) {
			modelSelect.style.display = 'inline-block';
			modelSelect.innerHTML = modelList.map(model => 
				`<option value="${model.value}">${model.label}</option>`
			).join('');
			modelSelect.value = generalSettings.interpreterModel || modelList[0].value;
		}
	}
}

export async function handleLLMProcessing(template: Template, variables: { [key: string]: string }, tabId: number, currentUrl: string, selectedModel: string) {
	const interpreterContainer = document.getElementById('interpreter');
	const interpretBtn = document.getElementById('interpret-btn') as HTMLButtonElement;
	const interpreterErrorMessage = document.getElementById('interpreter-error') as HTMLDivElement;
	const llmTimer = document.getElementById('llm-timer') as HTMLSpanElement;
	const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
	const clipButton = document.getElementById('clip-button') as HTMLButtonElement;
	
	try {
		// Hide any previous error message
		interpreterErrorMessage.style.display = 'none';
		interpreterErrorMessage.textContent = '';

		// Remove any previous done or error classes
		interpreterContainer?.classList.remove('done', 'error');

		const contentToProcess = variables.content || '';
		const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;
		
		if (tabId && currentUrl && promptContextTextarea) {
			let promptToUse = promptContextTextarea.value;

			const promptVariables = collectPromptVariables(template);

			console.log('Unique prompts to be sent to LLM:', { 
				userPrompt: promptToUse, 
				promptVariables: promptVariables.map(({ key, prompt }) => ({ key, prompt })),
				model: selectedModel
			});

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

			await processLLM(
				promptToUse,
				contentToProcess,
				promptVariables,
				updateLLMResponse,
				updateFieldsWithLLMResponses,
				selectedModel,
				template
			);

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

			// Re-enable the clip button
			clipButton.disabled = false;
		} else {
			throw new Error('Missing tab ID, URL, or prompt');
		}
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