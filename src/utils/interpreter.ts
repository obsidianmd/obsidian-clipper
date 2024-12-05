import { generalSettings, saveSettings } from './storage-utils';
import { PromptVariable, Template, ModelConfig } from '../types/types';
import { compileTemplate } from './template-compiler';
import { applyFilters } from './filters';
import { formatDuration } from './string-utils';
import { adjustNoteNameHeight } from './ui-utils';
import { debugLog } from './debug';
import { getMessage } from './i18n';
import { updateTokenCount } from './token-counter';

const RATE_LIMIT_RESET_TIME = 60000; // 1 minute in milliseconds
let lastRequestTime = 0;

// Store event listeners for cleanup
const eventListeners = new WeakMap<HTMLElement, { [key: string]: EventListener }>();

export async function sendToLLM(promptContext: string, content: string, promptVariables: PromptVariable[], model: ModelConfig): Promise<{ promptResponses: any[] }> {
	debugLog('Interpreter', 'Sending request to LLM...');
	
	// Find the provider for this model
	const provider = generalSettings.providers.find(p => p.id === model.providerId);
	if (!provider) {
		throw new Error(`Provider not found for model ${model.name}`);
	}

	// Get API key from provider
	if (!provider.apiKey) {
		throw new Error(`API key is not set for provider ${provider.name}`);
	}

	const now = Date.now();
	if (now - lastRequestTime < RATE_LIMIT_RESET_TIME) {
		throw new Error(`Rate limit cooldown. Please wait ${Math.ceil((RATE_LIMIT_RESET_TIME - (now - lastRequestTime)) / 1000)} seconds before trying again.`);
	}

	try {
		const systemContent = 
			`You are a helpful assistant. Please respond with one JSON object named \`prompts_responses\` — no explanatory text before or after. Use the keys provided, e.g. \`prompt_1\`, \`prompt_2\`, and fill in the values. Values should be Markdown strings unless otherwise specified. Make your responses concise. For example, your response should look like: {"prompts_responses":{"prompt_1":"tag1, tag2, tag3","prompt_2":"- bullet1\n- bullet 2\n- bullet3"}}`;
		
		const promptContent = {	
			prompts: promptVariables.reduce((acc, { key, prompt }) => {
				acc[key] = prompt;
				return acc;
			}, {} as { [key: string]: string })
		};

		let requestBody: any;
		let headers: HeadersInit = {
			'Content-Type': 'application/json',
		};

		if (provider.baseUrl.includes('openai.azure.com')) {
			requestBody = {
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				temperature: 0.5,
				max_tokens: 800,
				stream: false
			};
			headers = {
				...headers,
				'api-key': provider.apiKey
			};
		} else if (provider.id === 'anthropic') {
			requestBody = {
				model: model.providerModelId,
				max_tokens: 800,
				messages: [
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				temperature: 0.5,
				system: systemContent
			};
			headers = {
				...headers,
				'x-api-key': provider.apiKey,
				'anthropic-version': '2023-06-01',
				'anthropic-dangerous-direct-browser-access': 'true'
			};
		} else if (provider.name.toLowerCase().includes('ollama')) {
			requestBody = {
				model: model.providerModelId,
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				format: 'json',
				temperature: 0.5,
				stream: false
			};
		} else {
			// Default OpenAI-compatible request format
			requestBody = {
				model: model.providerModelId,
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				temperature: 0.7
			};
			headers = {
				...headers,
				"HTTP-Referer": 'https://obsidian.md/',
				"X-Title": 'Obsidian Web Clipper',
				'Authorization': `Bearer ${provider.apiKey}`
			};
		}

		debugLog('Interpreter', `Sending request to ${provider.name} API:`, requestBody);

		const response = await fetch(provider.baseUrl, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`${provider.name} error response:`, errorText);
			throw new Error(`${provider.name} error: ${response.statusText} ${errorText}`);
		}

		const responseText = await response.text();
		debugLog('Interpreter', `Raw ${provider.name} response:`, responseText);

		let data;
		try {
			data = JSON.parse(responseText);
		} catch (error) {
			console.error('Error parsing JSON response:', error);
			throw new Error(`Failed to parse response from ${provider.name}`);
		}

		debugLog('Interpreter', `Parsed ${provider.name} response:`, data);

		lastRequestTime = now;

		let llmResponseContent: string;
		if (provider.id === 'anthropic') {
			llmResponseContent = data.content[0]?.text || JSON.stringify(data);
		} else if (provider.name.toLowerCase().includes('ollama')) {
			const messageContent = data.message?.content;
			if (messageContent) {
				try {
					const parsedContent = JSON.parse(messageContent);
					llmResponseContent = JSON.stringify(parsedContent);
				} catch (error) {
					llmResponseContent = messageContent;
				}
			} else {
				llmResponseContent = JSON.stringify(data);
			}
		} else {
			llmResponseContent = data.choices[0]?.message?.content || JSON.stringify(data);
		}
		debugLog('Interpreter', 'Processed LLM response:', llmResponseContent);

		return parseLLMResponse(llmResponseContent, promptVariables);
	} catch (error) {
		console.error(`Error sending to ${provider.name} LLM:`, error);
		throw error;
	}
}

interface LLMResponse {
	prompts_responses: { [key: string]: string };
}

function parseLLMResponse(responseContent: string, promptVariables: PromptVariable[]): { promptResponses: any[] } {
	try {
		let parsedResponse: LLMResponse;
		
		// If responseContent is already an object, stringify it first to normalize it
		if (typeof responseContent === 'object') {
			responseContent = JSON.stringify(responseContent);
		}

		// First try parsing the entire response
		try {
			// Replace any raw newlines in strings with \n before parsing
			const sanitizedContent = responseContent.replace(/(?<=":)(\s*"[^"]*(?:\r?\n)[^"]*")(?=,?)/g, (match) => {
				return match.replace(/\r?\n/g, '\\n');
			});
			parsedResponse = JSON.parse(sanitizedContent);
		} catch (e) {
			// If that fails, try to find and parse JSON content
			const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('No JSON object found in response');
			}
			// Sanitize the matched JSON string
			const sanitizedMatch = jsonMatch[0].replace(/(?<=":)(\s*"[^"]*(?:\r?\n)[^"]*")(?=,?)/g, (match) => {
				return match.replace(/\r?\n/g, '\\n');
			});
			parsedResponse = JSON.parse(sanitizedMatch);
		}

		// If we don't have prompts_responses, return empty array
		if (!parsedResponse.prompts_responses) {
			debugLog('Interpreter', 'No prompts_responses found in parsed response');
			return { promptResponses: [] };
		}

		// Map the responses to their prompts
		const promptResponses = promptVariables.map(variable => ({
			key: variable.key,
			prompt: variable.prompt,
			user_response: parsedResponse.prompts_responses[variable.key] || ''
		}));

		debugLog('Interpreter', 'Mapped prompt responses:', promptResponses);
		return { promptResponses };
	} catch (parseError) {
		debugLog('Interpreter', 'Failed to parse response as JSON:', parseError);
		return { promptResponses: [] };
	}
}

export function collectPromptVariables(template: Template | null): PromptVariable[] {
	const promptMap = new Map<string, PromptVariable>();
	const promptRegex = /{{(?:prompt:)?"(.*?)"(\|.*?)?}}/g;
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

export async function initializeInterpreter(template: Template, variables: { [key: string]: string }, tabId: number, currentUrl: string) {
	const interpreterContainer = document.getElementById('interpreter');
	const interpretBtn = document.getElementById('interpret-btn');
	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;
	const modelSelect = document.getElementById('model-select') as HTMLSelectElement;

	function removeOldListeners(element: HTMLElement, eventType: string) {
		const listeners = eventListeners.get(element);
		if (listeners && listeners[eventType]) {
			element.removeEventListener(eventType, listeners[eventType]);
		}
	}

	function storeListener(element: HTMLElement, eventType: string, listener: EventListener) {
		let listeners = eventListeners.get(element);
		if (!listeners) {
			listeners = {};
			eventListeners.set(element, listeners);
		}
		removeOldListeners(element, eventType);
		listeners[eventType] = listener;
		element.addEventListener(eventType, listener);
	}

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
		const tokenCounter = document.getElementById('token-counter');
		
		const inputListener = () => {
			template.context = promptContextTextarea.value;
			if (tokenCounter) {
				updateTokenCount(promptContextTextarea.value, tokenCounter);
			}
		};
		
		storeListener(promptContextTextarea, 'input', inputListener);

		let promptToDisplay =
			template.context
			|| generalSettings.defaultPromptContext
			|| '{{fullHtml|remove_html:("#navbar,.footer,#footer,header,footer,style,script")|strip_tags:("script,h1,h2,h3,h4,h5,h6,meta,a,ol,ul,li,p,em,strong,i,b,s,strike,u,sup,sub,img,video,audio,math,table,cite,td,th,tr,caption")|strip_attr:("alt,src,href,id,content,property,name,datetime,title")}}';
		promptToDisplay = await compileTemplate(tabId, promptToDisplay, variables, currentUrl);
		promptContextTextarea.value = promptToDisplay;
		
		// Initial token count
		if (tokenCounter) {
			updateTokenCount(promptContextTextarea.value, tokenCounter);
		}
	}

	if (template) {
		// Only add click listener if auto-run is disabled
		if (interpretBtn && !generalSettings.interpreterAutoRun) {
			const clickListener = async () => {
				const selectedModelId = modelSelect.value;
				const modelConfig = generalSettings.models.find(m => m.id === selectedModelId);
				if (!modelConfig) {
					throw new Error(`Model configuration not found for ${selectedModelId}`);
				}
				await handleInterpreterUI(template, variables, tabId, currentUrl, modelConfig);
			};
			storeListener(interpretBtn, 'click', clickListener);
		}

		if (modelSelect) {
			const changeListener = async () => {
				generalSettings.interpreterModel = modelSelect.value;
				await saveSettings();
			};
			storeListener(modelSelect, 'change', changeListener);

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

export async function handleInterpreterUI(
	template: Template,
	variables: { [key: string]: string },
	tabId: number,
	currentUrl: string,
	modelConfig: ModelConfig
): Promise<void> {
	const interpreterContainer = document.getElementById('interpreter');
	const interpretBtn = document.getElementById('interpret-btn') as HTMLButtonElement;
	const interpreterErrorMessage = document.getElementById('interpreter-error') as HTMLDivElement;
	const responseTimer = document.getElementById('interpreter-timer') as HTMLSpanElement;
	const clipButton = document.getElementById('clip-btn') as HTMLButtonElement;
	const moreButton = document.getElementById('more-btn') as HTMLButtonElement;
	const promptContextTextarea = document.getElementById('prompt-context') as HTMLTextAreaElement;

	try {
		// Hide any previous error message
		interpreterErrorMessage.style.display = 'none';
		interpreterErrorMessage.textContent = '';

		// Remove any previous done or error classes
		interpreterContainer?.classList.remove('done', 'error');

		// Find the provider for this model
		const provider = generalSettings.providers.find(p => p.id === modelConfig.providerId);
		if (!provider) {
			throw new Error(`Provider not found for model ${modelConfig.name}`);
		}

		if (!provider.apiKey) {
			throw new Error(`No API key is set for ${provider.name}. Please set an API key in the extension settings.`);
		}

		const promptVariables = collectPromptVariables(template);

		if (promptVariables.length === 0) {
			throw new Error('No prompt variables found. Please add at least one prompt variable to your template.');
		}

		const contextToUse = promptContextTextarea.value;
		const contentToProcess = variables.content || '';

		// Start the timer
		const startTime = performance.now();
		let timerInterval: number;

		// Change button text and add class
		interpretBtn.textContent = getMessage('thinking');
		interpretBtn.classList.add('processing');

		// Disable the clip button
		clipButton.disabled = true;
		moreButton.disabled = true;

		// Show and update the timer
		responseTimer.style.display = 'inline';
		responseTimer.textContent = '0ms';

		// Update the timer text with elapsed time
		timerInterval = window.setInterval(() => {
			const elapsedTime = performance.now() - startTime;
			responseTimer.textContent = formatDuration(elapsedTime);
		}, 10);

		const { promptResponses } = await sendToLLM(contextToUse, contentToProcess, promptVariables, modelConfig);
		debugLog('Interpreter', 'LLM response:', { promptResponses });

		// Stop the timer and update UI
		clearInterval(timerInterval);
		const endTime = performance.now();
		const totalTime = endTime - startTime;
		responseTimer.textContent = formatDuration(totalTime);

		// Update button state
		interpretBtn.textContent = getMessage('done');
		interpretBtn.classList.remove('processing');
		interpretBtn.classList.add('done');
		interpretBtn.disabled = true;

		// Add done class to container
		interpreterContainer?.classList.add('done');
		
		// Update fields with responses
		replacePromptVariables(promptVariables, promptResponses);

		// Re-enable clip button
		clipButton.disabled = false;
		moreButton.disabled = false;

		// Adjust height for noteNameField after content is replaced
		const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement | null;
		if (noteNameField instanceof HTMLTextAreaElement) {
			adjustNoteNameHeight(noteNameField);
		}

	} catch (error) {
		console.error('Error processing LLM:', error);
		
		// Revert button text and remove class in case of error
		interpretBtn.textContent = getMessage('error');
		interpretBtn.classList.remove('processing');
		interpretBtn.classList.add('error');
		interpretBtn.disabled = true;

		// Add error class to interpreter container
		interpreterContainer?.classList.add('error');

		// Hide the timer
		responseTimer.style.display = 'none';

		// Display the error message
		interpreterErrorMessage.textContent = error instanceof Error ? error.message : 'An unknown error occurred while processing the interpreter request.';
		interpreterErrorMessage.style.display = 'block';

		// Re-enable the clip button
		clipButton.disabled = false;
		moreButton.disabled = false;

		if (error instanceof Error) {
			throw new Error(`${error.message}`);
		} else {
			throw new Error('An unknown error occurred while processing the interpreter request.');
		}
	}
}

// Similar to replaceVariables, but happens after the LLM response is received
export function replacePromptVariables(promptVariables: PromptVariable[], promptResponses: any[]) {
	const allInputs = document.querySelectorAll('input, textarea');
	allInputs.forEach((input) => {
		if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
			input.value = input.value.replace(/{{(?:prompt:)?"(.*?)"(\|.*?)?}}/g, (match, promptText, filters) => {
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

			// Adjust height for noteNameField after updating its value
			if (input.id === 'note-name-field' && input instanceof HTMLTextAreaElement) {
				adjustNoteNameHeight(input);
			}
		}
	});
}