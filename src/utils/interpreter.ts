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

	// Only check for API key if the provider requires it
	if (provider.apiKeyRequired && !provider.apiKey) {
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

		let requestUrl: string;
		let requestBody: any;
		let headers: HeadersInit = {
			'Content-Type': 'application/json',
		};

		if (provider.name.toLowerCase().includes('hugging')) {
			// Replace {model-id} in baseUrl with the actual model ID
			requestUrl = provider.baseUrl.replace('{model-id}', model.providerModelId);
			requestBody = {
				model: model.providerModelId,
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				max_tokens: 1600,
				stream: false
			};					
			headers = {
				...headers,
				'Authorization': `Bearer ${provider.apiKey}`
			};
		} else if (provider.baseUrl.includes('openai.azure.com')) {
			requestUrl = provider.baseUrl;
			requestBody = {
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				max_tokens: 1600,
				stream: false
			};
			headers = {
				...headers,
				'api-key': provider.apiKey
			};
		} else if (provider.name.toLowerCase().includes('anthropic')) {
			requestUrl = provider.baseUrl;
			requestBody = {
				model: model.providerModelId,
				max_tokens: 1600,
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
		} else if (provider.name.toLowerCase().includes('perplexity')) {
			requestUrl = provider.baseUrl;
			requestBody = {
				model: model.providerModelId,
				max_tokens: 1600,
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `
						"${promptContext}"
						"${JSON.stringify(promptContent)}"`
					}
				]
			};
			headers = {
				...headers,
				'HTTP-Referer': 'https://obsidian.md/',
				'X-Title': 'Obsidian Web Clipper',
				'Authorization': `Bearer ${provider.apiKey}`
			};
		} else if (provider.name.toLowerCase().includes('ollama')) {
			requestUrl = provider.baseUrl;
			requestBody = {
				model: model.providerModelId,
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				],
				format: 'json',
				num_ctx: 120000,
				temperature: 0.5,
				stream: false
			};
		} else {
			// Default request format
			requestUrl = provider.baseUrl;
			requestBody = {
				model: model.providerModelId,
				messages: [
					{ role: 'system', content: systemContent },
					{ role: 'user', content: `${promptContext}` },
					{ role: 'user', content: `${JSON.stringify(promptContent)}` }
				]
			};
			headers = {
				...headers,
				'HTTP-Referer': 'https://obsidian.md/',
				'X-Title': 'Obsidian Web Clipper',
				'Authorization': `Bearer ${provider.apiKey}`
			};
		}

		debugLog('Interpreter', `Sending request to ${provider.name} API:`, requestBody);

		const response = await fetch(requestUrl, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`${provider.name} error response:`, errorText);
			
			// Add specific message for Ollama 403 errors
			if (provider.name.toLowerCase().includes('ollama') && response.status === 403) {
				throw new Error(
					`Ollama cannot process requests originating from a browser extension without setting OLLAMA_ORIGINS. ` +
					`See instructions at https://help.obsidian.md/web-clipper/interpreter`
				);
			}
			
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
		if (provider.name.toLowerCase().includes('anthropic')) {
			// Handle Anthropic's nested content structure
			const textContent = data.content[0]?.text;
			if (textContent) {
				try {
					// Try to parse the inner content first
					const parsed = JSON.parse(textContent);
					llmResponseContent = JSON.stringify(parsed);
				} catch {
					// If parsing fails, use the raw text
					llmResponseContent = textContent;
				}
			} else {
				llmResponseContent = JSON.stringify(data);
			}
		} else if (provider.name.toLowerCase().includes('ollama')) {
			const messageContent = data.message?.content;
			if (messageContent) {
				try {
					const parsed = JSON.parse(messageContent);
					llmResponseContent = JSON.stringify(parsed);
				} catch {
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
		
		// If responseContent is already an object, convert to string
		if (typeof responseContent === 'object') {
			responseContent = JSON.stringify(responseContent);
		}

		// Helper function to sanitize JSON string
		const sanitizeJsonString = (str: string) => {
			// First, normalize all newlines to \n
			let result = str.replace(/\r\n/g, '\n');
			
			// Escape newlines properly
			result = result.replace(/\n/g, '\\n');
			
			// Escape quotes that are part of the content
			result = result.replace(/(?<!\\)"/g, '\\"');
			
			// Then unescape the quotes that are JSON structural elements
			result = result.replace(/(?<=[{[,:]\s*)\\"/g, '"')
				.replace(/\\"(?=\s*[}\],:}])/g, '"');
			
			return result
				// Replace curly quotes
				.replace(/[""]/g, '\\"')
				// Remove any bad control characters
				.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '')
				// Remove any whitespace between quotes and colons
				.replace(/"\s*:/g, '":')
				.replace(/:\s*"/g, ':"')
				// Fix any triple or more backslashes
				.replace(/\\{3,}/g, '\\\\');
		};

		// First try to parse the content directly
		try {
			const sanitizedContent = sanitizeJsonString(responseContent);
			debugLog('Interpreter', 'Sanitized content:', sanitizedContent);
			parsedResponse = JSON.parse(sanitizedContent);
		} catch (e) {
			// If direct parsing fails, try to extract and parse the JSON content
			const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('No JSON object found in response');
			}

			// Try parsing with minimal sanitization first
			try {
				const minimalSanitized = jsonMatch[0]
					.replace(/[""]/g, '"')
					.replace(/\r\n/g, '\\n')
					.replace(/\n/g, '\\n');
				parsedResponse = JSON.parse(minimalSanitized);
			} catch (minimalError) {
				// If minimal sanitization fails, try full sanitization
				const sanitizedMatch = sanitizeJsonString(jsonMatch[0]);
				debugLog('Interpreter', 'Fully sanitized match:', sanitizedMatch);
				
				try {
					parsedResponse = JSON.parse(sanitizedMatch);
				} catch (fullError) {
					// Last resort: try to manually rebuild the JSON structure
					const prompts_responses: { [key: string]: string } = {};
					
					// Extract each prompt response separately
					promptVariables.forEach((variable, index) => {
						const promptKey = `prompt_${index + 1}`;
						const promptRegex = new RegExp(`"${promptKey}"\\s*:\\s*"([^]*?)(?:"\\s*,|"\\s*})`, 'g');
						const match = promptRegex.exec(jsonMatch[0]);
						if (match) {
							let content = match[1]
								.replace(/"/g, '\\"')
								.replace(/\r\n/g, '\\n')
								.replace(/\n/g, '\\n');
							prompts_responses[promptKey] = content;
						}
					});

					const rebuiltJson = JSON.stringify({ prompts_responses });
					debugLog('Interpreter', 'Rebuilt JSON:', rebuiltJson);
					parsedResponse = JSON.parse(rebuiltJson);
				}
			}
		}

		// Validate the response structure
		if (!parsedResponse?.prompts_responses) {
			debugLog('Interpreter', 'No prompts_responses found in parsed response', parsedResponse);
			return { promptResponses: [] };
		}

		// Convert escaped newlines to actual newlines and clean up code blocks in responses
		Object.keys(parsedResponse.prompts_responses).forEach(key => {
			if (typeof parsedResponse.prompts_responses[key] === 'string') {
				parsedResponse.prompts_responses[key] = parsedResponse.prompts_responses[key]
					.replace(/\\n/g, '\n')
					.replace(/\r/g, '')
					.replace(/^```(?:json|markdown)?\n?/, '') // Remove opening code blocks
					.replace(/\n?```$/, ''); // Remove closing code blocks
			}
		});

		// Map the responses to their prompts
		const promptResponses = promptVariables.map(variable => ({
			key: variable.key,
			prompt: variable.prompt,
			user_response: parsedResponse.prompts_responses[variable.key] || ''
		}));

		debugLog('Interpreter', 'Successfully mapped prompt responses:', promptResponses);
		return { promptResponses };
	} catch (parseError) {
		console.error('Failed to parse LLM response:', parseError);
		debugLog('Interpreter', 'Parse error details:', {
			error: parseError,
			responseContent: responseContent
		});
		return { promptResponses: [] };
	}
}

// Map raw placeholder (quoted text or unquoted var name) -> prompt key
const placeholderKeyMap = new Map<string, string>();

// Track issues found while collecting prompts (e.g., missing variables for unquoted references)
export type PromptCollectionError = {
    type: 'missingVariable';
    variable: string; // the unquoted var name
    placeholder: string; // the literal placeholder to search for (e.g., {{prompt:var}})
    withFilters?: string; // the placeholder including any filters for better location
};

export let lastPromptCollectionErrors: PromptCollectionError[] = [];

export function collectPromptVariables(
    template: Template | null,
    variables?: { [key: string]: any },
    currentUrl?: string
): PromptVariable[] {
	const promptMap = new Map<string, PromptVariable>();
    // Allow optional whitespace before filters and before closing braces
    const promptRegex = /{{(?:prompt:)?(?:"((?:\\.|[^"\\])*)"|([^|}]+))\s*(\|[\s\S]*?)?\s*}}/g;
	let match: RegExpExecArray | null;

	placeholderKeyMap.clear();
	lastPromptCollectionErrors = [];
	const seenMissing = new Set<string>();

	function resolveVariable(path: string): { value: string | undefined; found: boolean } {
		if (!variables) return { value: path, found: false };
		const getNestedValue = (obj: any, p: string): any => {
			const keys = p.split('.');
			return keys.reduce((value, key) => {
				if (value === undefined || value === null) return undefined;
				if (key.includes('[') && key.includes(']')) {
					const [arrayKey, indexStr] = key.split(/[\[\]]/);
					const index = parseInt(indexStr, 10);
					const arr = (value as any)[arrayKey];
					return Array.isArray(arr) ? arr[index] : undefined;
				}
				return (value as any)[key];
			}, obj);
		};
		let value: any;
		const trimmed = path.trim();
		if (trimmed.includes('.') || trimmed.includes('[')) {
			value = getNestedValue(variables, trimmed);
		} else {
			value = (variables as any)[`{{${trimmed}}}`];
			if (value === undefined) value = (variables as any)[trimmed];
		}
		if (value === undefined) return { value: undefined, found: false };
		
		const str = value === null
			? ''
			: typeof value === 'object'
				? JSON.stringify(value)
				: String(value);
		
		
		return { value: str, found: true };
	}

	function addPrompt(placeholder: string, finalPrompt: string, filters: string) {
		if (!promptMap.has(finalPrompt)) {
			const key = `prompt_${promptMap.size + 1}`;
			promptMap.set(finalPrompt, { key, prompt: finalPrompt, filters });
			placeholderKeyMap.set(placeholder, key);
		} else {
			const existing = promptMap.get(finalPrompt)!;
			placeholderKeyMap.set(placeholder, existing.key);
		}
	}

    const scanText = (text: string) => {
        while ((match = promptRegex.exec(text)) !== null) {
            const quoted = match[1];
            const unquoted = match[2];
            const filters = match[3] || '';
            const placeholder = (quoted ?? unquoted ?? '').trim();
            let finalPrompt = quoted ? quoted.trim().replace(/\\\"/g, '"') : '';
            if (!finalPrompt && unquoted) {
                const { value, found } = resolveVariable(unquoted);
                if (!found) {
                    const trimmed = unquoted.trim();
                    if (!seenMissing.has(trimmed)) {
                        seenMissing.add(trimmed);
                        const literal = `{{prompt:${trimmed}}}`;
                        const literalWithFilters = `{{prompt:${trimmed}${filters}}}`;
                        lastPromptCollectionErrors.push({ type: 'missingVariable', variable: trimmed, placeholder: literal, withFilters: literalWithFilters });
                    }
                    // Still register a prompt so the interpreter UI is available;
                    // we'll abort before sending to LLM and show errors.
                    finalPrompt = trimmed;
                } else {
                    finalPrompt = (value ?? '').toString();
                }
            }
            // If a quoted prompt was empty or an unquoted var was missing, we may need a fallback.
            // But if an unquoted var was FOUND and resolves to an empty string, treat it as a valid (empty) prompt
            // so it doesn't get replaced by the raw placeholder name.
            if (!finalPrompt) {
                if (unquoted) {
                    // finalPrompt is empty. If unquoted existed, it means we either resolved to empty string
                    // or we already recorded a missing variable (handled above). Keep empty string when resolved.
                    // Only fallback for the case where we never had a usable placeholder (should be rare).
                    // Do nothing: keep empty string as the final prompt to avoid inserting the var name.
                } else {
                    finalPrompt = placeholder; // fallback for empty quoted prompt edge-case
                }
            }
            addPrompt(placeholder, finalPrompt, filters);
        }
    };

    // Prefer current UI state first — scan all inputs/textarea for up-to-date prompts
    const allInputs = document.querySelectorAll('input, textarea');
    allInputs.forEach((input) => {
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            scanText(input.value);
        }
    });

    // If no prompts were found in the UI, fall back to the template definition
    if (promptMap.size === 0) {
        if (template?.noteContentFormat) scanText(template.noteContentFormat);

        if (template?.properties) {
            for (const property of template.properties) {
                scanText(property.value);
            }
        }
    }

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

	const promptVariables = collectPromptVariables(template, variables, currentUrl);

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
			
			// Filter enabled models
			const enabledModels = generalSettings.models.filter(model => model.enabled);
			
			modelSelect.innerHTML = enabledModels
				.map(model => 
					`<option value="${model.id}">${model.name}</option>`
				).join('');

			// Check if last selected model exists and is enabled
			const lastSelectedModel = enabledModels.find(model => model.id === generalSettings.interpreterModel);
			
			if (!lastSelectedModel && enabledModels.length > 0) {
				// If last selected model is not available/enabled, use first enabled model
				generalSettings.interpreterModel = enabledModels[0].id;
				await saveSettings();
			}

			modelSelect.value = generalSettings.interpreterModel || (enabledModels[0]?.id ?? '');
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
		(interpretBtn as HTMLButtonElement).classList.remove('done', 'error', 'processing');
		// Ensure the interpret button is enabled for a fresh run (important when coming from Retry)
		interpretBtn.disabled = false;

		// Hide any existing retry button at the start of a run
		let retryBtn = document.getElementById('interpreter-retry-btn') as HTMLButtonElement | null;
		if (retryBtn) {
			retryBtn.style.display = 'none';
			retryBtn.disabled = true;
			// reset any inline margins from prior runs
			retryBtn.style.marginLeft = '4px';
			// make sure it doesn't inherit disabled styles on next show
			retryBtn.classList.remove('done', 'processing');
		}

		// Find the provider for this model
		const provider = generalSettings.providers.find(p => p.id === modelConfig.providerId);
		if (!provider) {
			throw new Error(`Provider not found for model ${modelConfig.name}`);
		}

		// Only check for API key if the provider requires it
		if (provider.apiKeyRequired && !provider.apiKey) {
			throw new Error(`API key is not set for provider ${provider.name}`);
		}

		const promptVariables = collectPromptVariables(template, variables, currentUrl);

		if (promptVariables.length === 0) {
			throw new Error('No prompt variables found. Please add at least one prompt variable to your template.');
		}

		// If there are collection errors (e.g., missing variables), show an error and abort
		if (lastPromptCollectionErrors.length > 0) {
			const details = lastPromptCollectionErrors.map(err => err.placeholder);

			// Set error state UI and show Retry button (with separator)
			interpretBtn.textContent = `${getMessage('error')} |`;
			interpretBtn.classList.remove('processing');
			interpretBtn.classList.add('error');
			interpretBtn.disabled = true;

			interpreterContainer?.classList.add('error');
			responseTimer.style.display = 'none';
			interpreterErrorMessage.textContent = `Missing variables in prompts:\n${details.join('\n')}`;
			interpreterErrorMessage.style.display = 'block';

			// Ensure a Retry button exists, styled like Interpret, placed next to it, and wired
			if (!retryBtn) {
				retryBtn = document.createElement('button');
				retryBtn.id = 'interpreter-retry-btn';
				retryBtn.setAttribute('data-i18n', 'retry');
				retryBtn.textContent = (typeof getMessage === 'function') ? getMessage('Retry') : 'retry';
				// Copy classes/styles from interpret button for consistent look
				retryBtn.className = (interpretBtn as HTMLButtonElement).className;
				retryBtn.classList.remove('error', 'done', 'processing');
				// tighter spacing next to error label
				retryBtn.style.marginLeft = '4px';
				// ensure retry remains enabled/clickable even if interpret is disabled
				retryBtn.disabled = false;
				const parent = interpretBtn.parentElement;
				if (parent) {
					parent.insertBefore(retryBtn, interpretBtn.nextSibling);
				} else {
					(interpreterContainer as HTMLElement)?.appendChild(retryBtn);
				}
			}
			retryBtn.onclick = async () => {
				// Re-run the full interpreter flow
				await handleInterpreterUI(template, variables, tabId, currentUrl, modelConfig);
			};
			retryBtn.style.display = 'inline-block';
			retryBtn.disabled = false;

			// Re-enable clip buttons to allow user to fix and retry
			clipButton.disabled = false;
			moreButton.disabled = false;
			return; // Abort sending to LLM
		}

		const contextToUse = promptContextTextarea.value;
		const contentToProcess = variables.content || '';

		// Start the timer
		const startTime = performance.now();
		let timerInterval: number;

		// Change button text and add class (ensure non-error state for purple accent)
		(interpretBtn as HTMLButtonElement).classList.remove('error', 'done');
		interpreterContainer?.classList.remove('error', 'done');
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
		interpretBtn.textContent = getMessage('done').toLowerCase();
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
		
		// Revert button text and remove class in case of error (with separator)
		interpretBtn.textContent = `${getMessage('error')} |`;
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

		// Offer a Retry button after generic errors as well
		let retryBtn = document.getElementById('interpreter-retry-btn') as HTMLButtonElement | null;
		if (!retryBtn) {
			retryBtn = document.createElement('button');
			retryBtn.id = 'interpreter-retry-btn';
			retryBtn.setAttribute('data-i18n', 'retry');
			retryBtn.textContent = (typeof getMessage === 'function') ? getMessage('retry') : 'Retry';
			// Match Interpret button styling and placement
			retryBtn.className = (interpretBtn as HTMLButtonElement).className;
			retryBtn.classList.remove('error', 'done', 'processing');
			retryBtn.style.marginLeft = '8px';
			const parent = interpretBtn.parentElement;
			if (parent) parent.insertBefore(retryBtn, interpretBtn.nextSibling);
			else (interpreterContainer as HTMLElement)?.appendChild(retryBtn);
		}
		retryBtn.onclick = async () => {
			await handleInterpreterUI(template, variables, tabId, currentUrl, modelConfig);
		};
		retryBtn.style.display = 'inline-block';
		retryBtn.disabled = false;

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
					input.value = input.value.replace(/{{(?:prompt:)?(?:"((?:\\.|[^"\\])*)"|([^|}]+))\s*(\|[\s\S]*?)?\s*}}/g, (match, quotedText, unquotedVar, filters) => {
					let key: string | undefined;
					if (quotedText) {
						const variable = promptVariables.find(v => v.prompt === quotedText);
						key = variable?.key;
						if (!key) {
							key = placeholderKeyMap.get(quotedText);
						}
					} else if (unquotedVar) {
						key = placeholderKeyMap.get(unquotedVar.trim());
					}

					if (!key) return match;

					const response = promptResponses.find(r => r.key === key);
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
