import { initializeToggles, updateToggleState, initializeSettingToggle } from '../utils/ui-utils';
import { ModelConfig, Provider } from '../types/types';
import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeIcons } from '../icons/icons';
import { showModal, hideModal } from '../utils/modal-utils';
import { getMessage, translatePage } from '../utils/i18n';
import { debugLog } from '../utils/debug';

interface PresetProvider {
	id: string;
	name: string;
	baseUrl: string;
	apiKeyUrl?: string;
	modelsList?: string;
}

const PRESET_PROVIDERS: Record<string, PresetProvider> = {
	anthropic: {
		id: 'anthropic',
		name: 'Anthropic',
		baseUrl: 'https://api.anthropic.com/v1/messages',
		apiKeyUrl: 'https://console.anthropic.com/settings/keys',
		modelsList: 'https://docs.anthropic.com/en/docs/about-claude/models'
	},
	azure: {
		id: 'azure-openai',
		name: 'Azure OpenAI',
		baseUrl: 'https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version=2024-10-21',
		apiKeyUrl: 'https://oai.azure.com/portal/',
		modelsList: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models'
	},
	deepseek: {
		id: 'deepseek',
		name: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/v1/chat/completions',
		apiKeyUrl: 'https://platform.deepseek.com/api_keys',
		modelsList: 'https://api-docs.deepseek.com/quick_start/pricing',
	},
	google: {
		id: 'google',
		name: 'Google Gemini',
		baseUrl: 'https://generativelanguage.googleapis.com/v1beta/chat/completions',
		apiKeyUrl: 'https://aistudio.google.com/apikey'
	},
	huggingface: {
		id: 'huggingface',
		name: 'Hugging Face',
		baseUrl: 'https://api-inference.huggingface.co/models/{model-id}/chat/completions',
		apiKeyUrl: 'https://huggingface.co/settings/tokens',
		modelsList: 'https://huggingface.co/models?pipeline_tag=text-generation&sort=trending'
	},
	ollama: {
		id: 'ollama',
		name: 'Ollama',
		baseUrl: 'http://127.0.0.1:11434/api/chat',
		modelsList: 'https://ollama.com/search'
	},
	openai: {
		id: 'openai',
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1/chat/completions',
		apiKeyUrl: 'https://platform.openai.com/api-keys',
		modelsList: 'https://platform.openai.com/docs/models'
	},
	openrouter: {
		id: 'openrouter',
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
		apiKeyUrl: 'https://openrouter.ai/settings/keys',
		modelsList: 'https://openrouter.ai/models'
	}
};

export function updatePromptContextVisibility(): void {
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const promptContextContainer = document.getElementById('prompt-context-container');
	const interpreterSection = document.getElementById('interpreter-section');

	if (promptContextContainer) {
		promptContextContainer.style.display = interpreterToggle.checked ? 'block' : 'none';
	}

	if (interpreterSection) {
		interpreterSection.classList.toggle('is-disabled', !interpreterToggle.checked);
	}
}

export function initializeInterpreterSettings(): void {
	const interpreterSettingsForm = document.getElementById('interpreter-settings-form');
	if (interpreterSettingsForm) {
		interpreterSettingsForm.addEventListener('input', debounce(saveInterpreterSettingsFromForm, 500));
	}

	// First load settings and initialize everything
	loadSettings().then(() => {
		debugLog('Interpreter', 'Loaded settings:', generalSettings);

		// Initialize providers first since models depend on them
		initializeProviderList();
		initializeModelList();

		// Initialize toggles and other UI elements
		initializeInterpreterToggles();

		const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;
		if (defaultPromptContextInput) {
			defaultPromptContextInput.value = generalSettings.defaultPromptContext;
		}

		updatePromptContextVisibility();
		initializeToggles();
		initializeAutoSave();
	});

	// Set up button event listeners
	const addModelBtn = document.getElementById('add-model-btn');
	if (addModelBtn) {
		addModelBtn.addEventListener('click', (event) => addModelToList(event));
	}

	const addProviderBtn = document.getElementById('add-provider-btn');
	if (addProviderBtn) {
		addProviderBtn.addEventListener('click', (event) => addProviderToList(event));
	}

	initializeResetProvidersButton();
}

function initializeInterpreterToggles(): void {
	initializeSettingToggle('interpreter-toggle', generalSettings.interpreterEnabled, (checked) => {
		saveSettings({ ...generalSettings, interpreterEnabled: checked });
		updatePromptContextVisibility();
	});

	initializeSettingToggle('interpreter-auto-run-toggle', generalSettings.interpreterAutoRun, (checked) => {
		saveSettings({ ...generalSettings, interpreterAutoRun: checked });
	});
}

function initializeProviderList() {
	debugLog('Providers', 'Initializing provider list with:', generalSettings.providers);
	const providerList = document.getElementById('provider-list');
	if (!providerList) {
		console.error('Provider list element not found');
		return;
	}

	// Sort providers alphabetically by name
	const sortedProviders = [...generalSettings.providers].sort((a, b) => 
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	providerList.innerHTML = '';
	sortedProviders.forEach((provider, index) => {
		const providerItem = createProviderListItem(provider, index);
		providerList.appendChild(providerItem);
	});

	initializeIcons(providerList);
	debugLog('Providers', 'Provider list initialized');
}

function createProviderListItem(provider: Provider, index: number): HTMLElement {
	const providerItem = document.createElement('div');
	providerItem.className = 'provider-list-item';
	providerItem.dataset.index = index.toString();
	providerItem.dataset.providerId = provider.id;

	providerItem.innerHTML = `
		<div class="provider-list-item-info">
			<div class="provider-name">
				<div class="provider-icon-container">
					<span class="provider-icon icon-${provider.name.toLowerCase().replace(/\s+/g, '-')}"></span>
				</div>
				<div class="provider-name-text">
					${provider.name}
				</div>
			</div>
			${!provider.apiKey ? `<span class="provider-no-key"><i data-lucide="alert-triangle"></i> <span class="mh">${getMessage('apiKeyMissing')}</span></span>` : ''}
		</div>
		<div class="provider-list-item-actions">
			<button class="edit-provider-btn clickable-icon" data-provider-id="${provider.id}" aria-label="Edit provider">
				<i data-lucide="pen-line"></i>
			</button>
			<button class="delete-provider-btn clickable-icon" data-provider-id="${provider.id}" aria-label="Delete provider">
				<i data-lucide="trash-2"></i>
			</button>
		</div>
	`;

	const editBtn = providerItem.querySelector('.edit-provider-btn');
	if (editBtn) {
		editBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const providerId = editBtn.getAttribute('data-provider-id');
			if (providerId) {
				const providerIndex = generalSettings.providers.findIndex(p => p.id === providerId);
				if (providerIndex !== -1) {
					editProvider(providerIndex);
				}
			}
		});
	}

	const duplicateBtn = providerItem.querySelector('.duplicate-provider-btn');
	if (duplicateBtn) {
		duplicateBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const providerId = duplicateBtn.getAttribute('data-provider-id');
			if (providerId) {
				const providerIndex = generalSettings.providers.findIndex(p => p.id === providerId);
				if (providerIndex !== -1) {
					duplicateProvider(providerIndex);
				}
			}
		});
	}

	const deleteBtn = providerItem.querySelector('.delete-provider-btn');
	if (deleteBtn) {
		deleteBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const providerId = deleteBtn.getAttribute('data-provider-id');
			if (providerId) {
				const providerIndex = generalSettings.providers.findIndex(p => p.id === providerId);
				if (providerIndex !== -1) {
					deleteProvider(providerIndex);
				}
			}
		});
	}

	return providerItem;
}

// Add provider management functions
function addProviderToList(event: Event) {
	event.preventDefault();
	debugLog('Providers', 'Adding new provider');
	const newProvider: Provider = {
		id: Date.now().toString(),
		name: '',
		baseUrl: '',
		apiKey: ''
	};
	showProviderModal(newProvider);
}

function editProvider(index: number) {
	const providerToEdit = generalSettings.providers[index];
	showProviderModal(providerToEdit, index);
}

function duplicateProvider(index: number) {
	const providerToDuplicate = generalSettings.providers[index];
	const duplicatedProvider: Provider = {
		...providerToDuplicate,
		id: Date.now().toString(),
		name: `${providerToDuplicate.name} (copy)`,
		apiKey: ''
	};

	generalSettings.providers.push(duplicatedProvider);
	saveSettings();
	initializeProviderList();

	// Show edit modal for the new provider
	const newIndex = generalSettings.providers.length - 1;
	showProviderModal(duplicatedProvider, newIndex);
}

function deleteProvider(index: number): void {
	const providerToDelete = generalSettings.providers[index];
	
	// Check if any models are using this provider
	const modelsUsingProvider = generalSettings.models.filter(m => m.providerId === providerToDelete.id);
	if (modelsUsingProvider.length > 0) {
		alert(getMessage('cannotDeleteProvider', [providerToDelete.name, modelsUsingProvider.length.toString()]));
		return;
	}

	if (confirm(getMessage('deleteProviderConfirm'))) {
		generalSettings.providers.splice(index, 1);
		saveSettings();
		initializeProviderList();
	}
}

async function showProviderModal(provider: Provider, index?: number) {
	debugLog('Providers', 'Showing provider modal:', { provider, index });
	const modal = document.getElementById('provider-modal');
	if (!modal) return;

	await translatePage();
	initializeIcons(modal);

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.setAttribute('data-i18n', index !== undefined ? 'editProvider' : 'addProviderTitle');
	}

	const form = modal.querySelector('#provider-form') as HTMLFormElement;
	if (form) {
		const nameInput = form.querySelector('[name="name"]') as HTMLInputElement;
		const baseUrlInput = form.querySelector('[name="baseUrl"]') as HTMLInputElement;
		const apiKeyInput = form.querySelector('[name="apiKey"]') as HTMLInputElement;
		const presetSelect = form.querySelector('[name="preset"]') as HTMLSelectElement;
		const nameContainer = nameInput.closest('.setting-item') as HTMLElement;
		const apiKeyContainer = form.querySelector('.setting-item:has([name="apiKey"]) .setting-item-description') as HTMLElement;

		if (!apiKeyContainer) {
			console.error('API key description container not found');
			return;
		}

		if (presetSelect) {
			presetSelect.innerHTML = `<option value="">${getMessage('custom')}</option>`;
			Object.entries(PRESET_PROVIDERS).forEach(([id, preset]) => {
				presetSelect.innerHTML += `<option value="${id}">${preset.name}</option>`;
			});

			// When editing, try to find matching preset
			if (index !== undefined) {
				const matchingPreset = Object.entries(PRESET_PROVIDERS).find(([_, preset]) => 
					preset.name === provider.name
				);
				presetSelect.value = matchingPreset ? matchingPreset[0] : '';
			} else {
				// Set Anthropic as default for new providers
				presetSelect.value = 'anthropic';
			}

			// Hide/show name field based on preset selection
			const updateNameVisibility = () => {
				nameContainer.style.display = presetSelect.value ? 'none' : 'block';
				if (presetSelect.value) {
					const selectedPreset = PRESET_PROVIDERS[presetSelect.value as keyof typeof PRESET_PROVIDERS];
					nameInput.value = selectedPreset.name;
					baseUrlInput.value = selectedPreset.baseUrl;

					// Update API key link
					if (selectedPreset.apiKeyUrl) {
						const message = getMessage('getApiKeyHere').replace('$1', selectedPreset.name);
						apiKeyContainer.innerHTML = `${getMessage('providerApiKeyDescription')} <a href="${selectedPreset.apiKeyUrl}" target="_blank">${message}</a>`;
					} else {
						apiKeyContainer.innerHTML = getMessage('providerApiKeyDescription');
					}
				} else {
					apiKeyContainer.innerHTML = getMessage('providerApiKeyDescription');
				}
			};

			presetSelect.addEventListener('change', updateNameVisibility);
			updateNameVisibility(); // Initial visibility update
			
			// Only set these values if editing an existing provider
			if (index !== undefined) {
				nameInput.value = provider.name;
				baseUrlInput.value = provider.baseUrl;
				apiKeyInput.value = provider.apiKey;
			}
		}
	}

	const confirmBtn = modal.querySelector('.provider-confirm-btn');
	const cancelBtn = modal.querySelector('.provider-cancel-btn');

	// Remove existing event listeners
	const newConfirmBtn = confirmBtn?.cloneNode(true);
	const newCancelBtn = cancelBtn?.cloneNode(true);
	if (confirmBtn && newConfirmBtn) {
		confirmBtn.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
	}
	if (cancelBtn && newCancelBtn) {
		cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn);
	}

	// Add new event listeners
	newConfirmBtn?.addEventListener('click', () => {
		const formData = new FormData(form);
		const updatedProvider: Provider = {
			id: provider.id,
			name: formData.get('name') as string,
			baseUrl: formData.get('baseUrl') as string,
			apiKey: formData.get('apiKey') as string
		};

		debugLog('Providers', 'Saving provider:', updatedProvider);

		if (!updatedProvider.name || !updatedProvider.baseUrl) {
			alert(getMessage('providerRequiredFields'));
			return;
		}

		if (index !== undefined) {
			generalSettings.providers[index] = updatedProvider;
		} else {
			generalSettings.providers.push(updatedProvider);
		}

		debugLog('Providers', 'Updated providers list:', generalSettings.providers);

		saveSettings().then(() => {
			debugLog('Providers', 'Settings saved');
			initializeProviderList();
			hideModal(modal);
		}).catch(error => {
			console.error('Failed to save settings:', error);
			alert(getMessage('failedToSaveProvider'));
		});
	});

	newCancelBtn?.addEventListener('click', () => {
		hideModal(modal);
	});

	showModal(modal);
}

export function initializeModelList() {
	const modelList = document.getElementById('model-list');
	if (!modelList) return;

	modelList.innerHTML = '';
	generalSettings.models.forEach((model, index) => {
		const modelItem = createModelListItem(model, index);
		modelList.appendChild(modelItem);
	});

	initializeIcons(modelList);
}

function createModelListItem(model: ModelConfig, index: number): HTMLElement {
	const modelItem = document.createElement('div');
	modelItem.className = 'model-list-item';
	modelItem.draggable = true;
	modelItem.dataset.index = index.toString();

	const provider = generalSettings.providers.find(p => p.id === model.providerId);
	const providerName = provider?.name || `<span class="model-provider-unknown"><i data-lucide="alert-triangle"></i> ${getMessage('unknownProvider')}</span>`;

	modelItem.innerHTML = `
		<div class="drag-handle">
			<i data-lucide="grip-vertical"></i>
		</div>
		<div class="model-list-item-info">
			<div class="model-name">${model.name}</div>
			<div class="model-provider mh">${providerName}</div>
		</div>
		<div class="model-list-item-actions">
			<button class="edit-model-btn clickable-icon" data-index="${index}" aria-label="Edit model">
				<i data-lucide="pen-line"></i>
			</button>
			<button class="duplicate-model-btn clickable-icon" data-index="${index}" aria-label="Duplicate model">
				<i data-lucide="copy-plus"></i>
			</button>
			<button class="delete-model-btn clickable-icon" data-index="${index}" aria-label="Delete model">
				<i data-lucide="trash-2"></i>
			</button>
			<div class="checkbox-container mod-small">
				<input type="checkbox" id="model-${index}" ${model.enabled ? 'checked' : ''}>
			</div>
		</div>
	`;

	const checkbox = modelItem.querySelector(`#model-${index}`) as HTMLInputElement;
	const checkboxContainer = modelItem.querySelector('.checkbox-container') as HTMLElement;
	
	if (checkbox && checkboxContainer) {
		initializeToggles(modelItem);
		checkbox.addEventListener('change', () => {
			generalSettings.models[index].enabled = checkbox.checked;
			saveSettings();
		});
	}

	const duplicateBtn = modelItem.querySelector('.duplicate-model-btn');
	if (duplicateBtn) {
		duplicateBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			duplicateModel(index);
		});
	}

	const editBtn = modelItem.querySelector('.edit-model-btn');
	if (editBtn) {
		editBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			editModel(index);
		});
	}

	const deleteBtn = modelItem.querySelector('.delete-model-btn');
	if (deleteBtn) {
		deleteBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			deleteModel(index);
		});
	}

	initializeIcons(modelItem);

	return modelItem;
}

function addModelToList(event: Event) {
	event.preventDefault();
	const newModel: ModelConfig = {
		id: Date.now().toString(),
		providerId: '',
		providerModelId: '',
		name: '',
		enabled: true
	};
	showModelModal(newModel);
}

function editModel(index: number) {
	const modelToEdit = generalSettings.models[index];
	showModelModal(modelToEdit, index);
}

function showModelModal(model: ModelConfig, index?: number) {
	const modal = document.getElementById('model-modal');
	if (!modal) return;

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.setAttribute('data-i18n', index !== undefined ? 'editModel' : 'addModelTitle');
		translatePage().then(() => {
			initializeIcons(modal);
		});
	}

	const form = modal.querySelector('#model-form') as HTMLFormElement;
	if (!form) {
		console.error('Model form not found');
		return;
	}

	// Get all form elements
	const nameInput = form.querySelector('[name="name"]') as HTMLInputElement;
	const providerModelIdInput = form.querySelector('[name="providerModelId"]') as HTMLInputElement;
	const providerSelect = form.querySelector('#model-provider') as HTMLSelectElement;

	// Check if all required elements exist
	if (!nameInput || !providerModelIdInput || !providerSelect) {
		console.error('Required form elements not found:', {
			nameInput: !!nameInput,
			providerModelIdInput: !!providerModelIdInput,
			providerSelect: !!providerSelect
		});
		return;
	}

	// Set form values
	nameInput.value = model.name;
	providerModelIdInput.value = model.providerModelId || '';

	// Populate provider select with alphabetically sorted providers
	providerSelect.innerHTML = '<option value="" data-i18n="selectProvider">Select a provider</option>';
	const sortedProviders = [...generalSettings.providers].sort((a, b) => 
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);
	sortedProviders.forEach(provider => {
		const option = document.createElement('option');
		option.value = provider.id;
		
		option.textContent = provider.name;
		providerSelect.appendChild(option);
	});
	providerSelect.value = model.providerId;

	// Handle buttons
	const confirmBtn = modal.querySelector('.model-confirm-btn');
	const cancelBtn = modal.querySelector('.model-cancel-btn');

	if (!confirmBtn || !cancelBtn) {
		console.error('Modal buttons not found');
		return;
	}

	// Remove existing event listeners
	const newConfirmBtn = confirmBtn.cloneNode(true);
	const newCancelBtn = cancelBtn.cloneNode(true);
	confirmBtn.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
	cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn);

	// Add new event listeners
	newConfirmBtn.addEventListener('click', () => {
		const formData = new FormData(form);
		const updatedModel: ModelConfig = {
			id: model.id,
			providerId: formData.get('providerId') as string,
			providerModelId: formData.get('providerModelId') as string,
			name: formData.get('name') as string,
			enabled: model.enabled
		};

		if (!updatedModel.name || !updatedModel.providerId || !updatedModel.providerModelId) {
			alert(getMessage('modelRequiredFields'));
			return;
		}

		if (index !== undefined) {
			generalSettings.models[index] = updatedModel;
		} else {
			generalSettings.models.push(updatedModel);
		}

		saveSettings();
		initializeModelList();
		hideModal(modal);
	});

	newCancelBtn.addEventListener('click', () => {
		hideModal(modal);
	});

	showModal(modal);
	
	translatePage().then(() => {
		initializeIcons(modal);
	});
}

function deleteModel(index: number) {
	if (confirm(getMessage('deleteModelConfirm'))) {
		generalSettings.models.splice(index, 1);
		saveSettings();
		initializeModelList();
	}
}

function initializeAutoSave(): void {
	const interpreterSettingsForm = document.getElementById('interpreter-settings-form');
	if (interpreterSettingsForm) {
		interpreterSettingsForm.addEventListener('input', debounce(saveInterpreterSettingsFromForm, 500));
	}
}

function saveInterpreterSettingsFromForm(): void {
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;
	const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;

	const updatedSettings = {
		interpreterEnabled: interpreterToggle.checked,
		interpreterAutoRun: interpreterAutoRunToggle.checked,
		defaultPromptContext: defaultPromptContextInput.value
	};

	saveSettings(updatedSettings);
}

function debounce(func: Function, delay: number): (...args: any[]) => void {
	let timeoutId: NodeJS.Timeout;
	return (...args: any[]) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

function duplicateModel(index: number) {
	const modelToDuplicate = generalSettings.models[index];
	const duplicatedModel: ModelConfig = {
		...modelToDuplicate,
		id: Date.now().toString(),
		name: `${modelToDuplicate.name} (copy)`
	};

	generalSettings.models.push(duplicatedModel);
	saveSettings();
	initializeModelList();

	// Show edit modal for the new model
	const newIndex = generalSettings.models.length - 1;
	showModelModal(duplicatedModel, newIndex);
}

function initializeResetProvidersButton(): void {
	const resetProvidersBtn = document.getElementById('reset-providers-btn');
	if (resetProvidersBtn) {
		resetProvidersBtn.addEventListener('click', async () => {
			try {
				// Keep custom providers
				const defaultProviderIds = ['openai', 'anthropic'];
				const customProviders = generalSettings.providers.filter(p => !defaultProviderIds.includes(p.id));
				
				// Reset default providers while preserving API keys
				const defaultProviders = defaultProviderIds.map(id => {
					const defaultProvider = PRESET_PROVIDERS[id];
					const existing = generalSettings.providers.find(p => p.id === id);
					return {
						id,
						name: defaultProvider.name,
						baseUrl: defaultProvider.baseUrl,
						apiKey: existing?.apiKey || ''
					};
				});

				// Combine default and custom providers
				generalSettings.providers = [...defaultProviders, ...customProviders];

				// Create default models
				const defaultModels: ModelConfig[] = [
					{
						id: 'gpt-4o-mini',
						providerId: 'openai',
						providerModelId: 'gpt-4o-mini',
						name: 'GPT-4o Mini',
						enabled: true
					},
					{
						id: 'gpt-4o',
						providerId: 'openai',
						providerModelId: 'gpt-4o',
						name: 'GPT-4o',
						enabled: true
					},
					{
						id: 'claude-3-5-sonnet',
						providerId: 'anthropic',
						providerModelId: 'claude-3-5-sonnet-latest',
						name: 'Claude 3.5 Sonnet',
						enabled: true
					},
					{
						id: 'claude-3-5-haiku',
						providerId: 'anthropic',
						providerModelId: 'claude-3-5-haiku-latest',
						name: 'Claude 3.5 Haiku',
						enabled: true
					}
				];

				// Keep custom models
				const defaultModelIds = defaultModels.map(m => m.id);
				const customModels = generalSettings.models.filter(m => !defaultModelIds.includes(m.id));
				generalSettings.models = [...defaultModels, ...customModels];
				
				await saveSettings();
				// Reinitialize the lists
				initializeProviderList();
				initializeModelList();
			} catch (error) {
				console.error('Failed to reset providers and models:', error);
				alert(getMessage('failedToResetProviders'));
			}
		});
	}
}
