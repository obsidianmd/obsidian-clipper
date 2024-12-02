import { initializeToggles, updateToggleState } from '../utils/ui-utils';
import { ModelConfig, Provider } from '../types/types';
import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeIcons } from '../icons/icons';
import { showModal, hideModal } from '../utils/modal-utils';
import { getMessage, translatePage } from '../utils/i18n';
import { debugLog } from '../utils/debug';

const PRESET_PROVIDERS = {
	openai: {
		id: 'openai',
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1/chat/completions'
	},
	anthropic: {
		id: 'anthropic',
		name: 'Anthropic',
		baseUrl: 'https://api.anthropic.com/v1/messages'
	},
	ollama: {
		id: 'ollama',
		name: 'Ollama',
		baseUrl: 'http://127.0.0.1:11434/api/chat'
	},
	openrouter: {
		id: 'openrouter',
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1/chat/completions'
	},
	azure: {
		id: 'azure',
		name: 'Azure',
		baseUrl: '' // User must provide their Azure endpoint
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
		const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
		const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;
		const interpreterSection = document.getElementById('interpreter-section');

		if (interpreterToggle) {
			interpreterToggle.checked = generalSettings.interpreterEnabled;
			updateToggleState(interpreterToggle.parentElement as HTMLElement, interpreterToggle);
			
			if (interpreterSection) {
				interpreterSection.classList.toggle('is-disabled', !interpreterToggle.checked);
			}

			interpreterToggle.addEventListener('change', () => {
				saveInterpreterSettingsFromForm();
				updatePromptContextVisibility();
				updateToggleState(interpreterToggle.parentElement as HTMLElement, interpreterToggle);
			});
		}

		if (interpreterAutoRunToggle) {
			interpreterAutoRunToggle.checked = generalSettings.interpreterAutoRun;
			updateToggleState(interpreterAutoRunToggle.parentElement as HTMLElement, interpreterAutoRunToggle);

			interpreterAutoRunToggle.addEventListener('change', () => {
				saveInterpreterSettingsFromForm();
				updateToggleState(interpreterAutoRunToggle.parentElement as HTMLElement, interpreterAutoRunToggle);
			});
		}

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
}

function initializeProviderList() {
	debugLog('Providers', 'Initializing provider list with:', generalSettings.providers);
	const providerList = document.getElementById('provider-list');
	if (!providerList) {
		console.error('Provider list element not found');
		return;
	}

	providerList.innerHTML = '';
	generalSettings.providers.forEach((provider, index) => {
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

	providerItem.innerHTML = `
		<div class="provider-list-item-info">
			<div class="provider-name">${provider.name}</div>
		</div>
		<div class="provider-list-item-actions">
			<button class="edit-provider-btn clickable-icon" data-index="${index}" aria-label="Edit provider">
				<i data-lucide="pen-line"></i>
			</button>
			<button class="duplicate-provider-btn clickable-icon" data-index="${index}" aria-label="Duplicate provider">
				<i data-lucide="copy-plus"></i>
			</button>
			<button class="delete-provider-btn clickable-icon" data-index="${index}" aria-label="Delete provider">
				<i data-lucide="trash-2"></i>
			</button>
		</div>
	`;

	const editBtn = providerItem.querySelector('.edit-provider-btn');
	if (editBtn) {
		editBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			editProvider(index);
		});
	}

	const duplicateBtn = providerItem.querySelector('.duplicate-provider-btn');
	if (duplicateBtn) {
		duplicateBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			duplicateProvider(index);
		});
	}

	const deleteBtn = providerItem.querySelector('.delete-provider-btn');
	if (deleteBtn) {
		deleteBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			deleteProvider(index);
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

function deleteProvider(index: number) {
	const providerToDelete = generalSettings.providers[index];
	
	// Check if any models are using this provider
	const modelsUsingProvider = generalSettings.models.filter(m => m.providerId === providerToDelete.id);
	if (modelsUsingProvider.length > 0) {
		alert(`Cannot delete provider "${providerToDelete.name}" because it is being used by ${modelsUsingProvider.length} model(s).`);
		return;
	}

	if (confirm(getMessage('deleteProviderConfirm'))) {
		generalSettings.providers.splice(index, 1);
		saveSettings();
		initializeProviderList();
	}
}

function showProviderModal(provider: Provider, index?: number) {
	debugLog('Providers', 'Showing provider modal:', { provider, index });
	const modal = document.getElementById('provider-modal');
	if (!modal) return;

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.setAttribute('data-i18n', index !== undefined ? 'editProvider' : 'addProviderTitle');
		translatePage().then(() => {
			initializeIcons(modal);
		});
	}

	const form = modal.querySelector('#provider-form') as HTMLFormElement;
	if (form) {
		const nameInput = form.querySelector('[name="name"]') as HTMLInputElement;
		const baseUrlInput = form.querySelector('[name="baseUrl"]') as HTMLInputElement;
		const apiKeyInput = form.querySelector('[name="apiKey"]') as HTMLInputElement;
		const presetSelect = form.querySelector('[name="preset"]') as HTMLSelectElement;

		if (presetSelect) {
			presetSelect.innerHTML = '<option value="">Custom</option>';
			Object.entries(PRESET_PROVIDERS).forEach(([id, preset]) => {
				presetSelect.innerHTML += `<option value="${id}">${preset.name}</option>`;
			});

			presetSelect.addEventListener('change', () => {
				const selectedPreset = PRESET_PROVIDERS[presetSelect.value as keyof typeof PRESET_PROVIDERS];
				if (selectedPreset) {
					nameInput.value = selectedPreset.name;
					baseUrlInput.value = selectedPreset.baseUrl;
				}
			});
		}

		nameInput.value = provider.name;
		baseUrlInput.value = provider.baseUrl;
		apiKeyInput.value = provider.apiKey;
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
			alert('Provider name and Base URL are required.');
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
			alert('Failed to save provider. Please try again.');
		});
	});

	newCancelBtn?.addEventListener('click', () => {
		hideModal(modal);
	});

	showModal(modal);
	
	// Translate the modal content after showing it
	translatePage().then(() => {
		// Re-initialize icons after translation
		initializeIcons(modal);
	});
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
	const providerName = provider?.name || 'Unknown';

	modelItem.innerHTML = `
		<div class="drag-handle">
			<i data-lucide="grip-vertical"></i>
		</div>
		<div class="model-list-item-info">
			<div class="model-name">${model.name}</div>
			<div class="model-provider">${providerName}</div>
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

	// Allow editing all models now
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
	if (form) {
		const nameInput = form.querySelector('[name="name"]') as HTMLInputElement;
		const modelIdInput = form.querySelector('[name="providerId"]') as HTMLInputElement;
		const providerSelect = form.querySelector('#model-provider') as HTMLSelectElement;

		nameInput.value = model.name;
		modelIdInput.value = model.providerId;

		// Populate provider select
		providerSelect.innerHTML = '<option value="" data-i18n="selectProvider">Select a provider</option>';
		generalSettings.providers.forEach(provider => {
			const option = document.createElement('option');
			option.value = provider.id;
			option.textContent = provider.name;
			providerSelect.appendChild(option);
		});
		providerSelect.value = model.providerId;

		// Update modelIdInput when provider changes
		providerSelect.addEventListener('change', () => {
			modelIdInput.value = providerSelect.value;
		});
	}

	const confirmBtn = modal.querySelector('.model-confirm-btn');
	const cancelBtn = modal.querySelector('.model-cancel-btn');

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
		const updatedModel: ModelConfig = {
			id: model.id,
			providerId: formData.get('providerId') as string,
			name: formData.get('name') as string,
			enabled: model.enabled
		};

		if (!updatedModel.name || !updatedModel.providerId) {
			alert('Model name and Provider are required.');
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

	newCancelBtn?.addEventListener('click', () => {
		hideModal(modal);
	});

	showModal(modal);
	
	translatePage().then(() => {
		initializeIcons(modal);
	});
}

function deleteModel(index: number) {
	const modelToDelete = generalSettings.models[index];
	
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

function addPresetProvider(presetId: keyof typeof PRESET_PROVIDERS) {
	const preset = PRESET_PROVIDERS[presetId];
	const newProvider: Provider = {
		...preset,
		id: Date.now().toString(),
		apiKey: ''
	};

	generalSettings.providers.push(newProvider);
	saveSettings();
	initializeProviderList();

	// Show edit modal for the new provider
	const newIndex = generalSettings.providers.length - 1;
	showProviderModal(newProvider, newIndex);
}