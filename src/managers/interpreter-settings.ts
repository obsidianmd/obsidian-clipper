import { initializeToggles, updateToggleState } from '../utils/ui-utils';
import { ModelConfig, generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeIcons } from '../icons/icons';
import { showModal, hideModal } from '../utils/modal-utils';
import { getMessage, translatePage } from '../utils/i18n';

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
	loadSettings().then(() => {
		const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
		const anthropicApiKeyInput = document.getElementById('anthropic-api-key') as HTMLInputElement;
		const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
		const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;
		const interpreterSection = document.getElementById('interpreter-section');

		if (apiKeyInput) apiKeyInput.value = generalSettings.openaiApiKey || '';
		if (anthropicApiKeyInput) anthropicApiKeyInput.value = generalSettings.anthropicApiKey || '';
		if (interpreterToggle) {
			interpreterToggle.checked = generalSettings.interpreterEnabled;
			updateToggleState(interpreterToggle.parentElement as HTMLElement, interpreterToggle);
			
			// Set initial disabled state
			if (interpreterSection) {
				interpreterSection.classList.toggle('is-disabled', !interpreterToggle.checked);
			}
		}
		if (interpreterAutoRunToggle) {
			interpreterAutoRunToggle.checked = generalSettings.interpreterAutoRun;
			updateToggleState(interpreterAutoRunToggle.parentElement as HTMLElement, interpreterAutoRunToggle);
		}
		initializeToggles();
		initializeAutoSave();

		if (interpreterToggle) {
			interpreterToggle.addEventListener('change', () => {
				saveInterpreterSettingsFromForm();
				updatePromptContextVisibility();
				updateToggleState(interpreterToggle.parentElement as HTMLElement, interpreterToggle);
			});
		}
		if (interpreterAutoRunToggle) {
			interpreterAutoRunToggle.addEventListener('change', () => {
				saveInterpreterSettingsFromForm();
				updateToggleState(interpreterAutoRunToggle.parentElement as HTMLElement, interpreterAutoRunToggle);
			});
		}
		updatePromptContextVisibility();

		const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;
		if (defaultPromptContextInput) {
			defaultPromptContextInput.value = generalSettings.defaultPromptContext;
		}

		initializeModelList();
	});

	const addModelBtn = document.getElementById('add-model-btn');
	if (addModelBtn) {
		addModelBtn.addEventListener('click', (event) => addModelToList(event));
	}
}

export function initializeModelList() {
	const modelList = document.getElementById('model-list');
	if (!modelList) return;

	modelList.innerHTML = '';
	generalSettings.models.forEach((model, index) => {
		const modelItem = createModelListItem(model, index);
		modelList.appendChild(modelItem);
	});

	// Initialize icons for the entire list after all items are added
	initializeIcons(modelList);
}

function createModelListItem(model: ModelConfig, index: number): HTMLElement {
	const modelItem = document.createElement('div');
	modelItem.className = 'model-list-item';
	modelItem.draggable = true;
	modelItem.dataset.index = index.toString();

	modelItem.innerHTML = `
		<div class="drag-handle">
			<i data-lucide="grip-vertical"></i>
		</div>
		<div class="model-list-item-info">
			<div class="model-name">${model.name}</div>
			<div class="model-provider">${model.provider || 'Custom'}</div>
		</div>
		<div class="model-list-item-actions">
			${model.provider !== 'OpenAI' && model.provider !== 'Anthropic' ? `
				<button class="edit-model-btn clickable-icon" data-index="${index}" aria-label="Edit model">
					<i data-lucide="pen-line"></i>
				</button>
				<button class="duplicate-model-btn clickable-icon" data-index="${index}" aria-label="Duplicate model">
					<i data-lucide="copy-plus"></i>
				</button>
				<button class="delete-model-btn clickable-icon" data-index="${index}" aria-label="Delete model">
					<i data-lucide="trash-2"></i>
				</button>
			` : ''}
			<div class="checkbox-container mod-small">
				<input type="checkbox" id="model-${index}" ${model.enabled ? 'checked' : ''}>
			</div>
		</div>
	`;

	const checkbox = modelItem.querySelector(`#model-${index}`) as HTMLInputElement;
	const checkboxContainer = modelItem.querySelector('.checkbox-container') as HTMLElement;
	
	if (checkbox && checkboxContainer) {
		updateToggleState(checkboxContainer, checkbox);

		checkbox.addEventListener('change', () => {
			if (generalSettings.models && generalSettings.models[index]) {
				generalSettings.models[index].enabled = checkbox.checked;
				updateToggleState(checkboxContainer, checkbox);
				saveSettings();
			} else {
				console.error(`Model at index ${index} not found in generalSettings.models`);
				checkbox.checked = !checkbox.checked;
				updateToggleState(checkboxContainer, checkbox);
			}
		});

		checkboxContainer.addEventListener('click', (event) => {
			event.preventDefault();
			checkbox.checked = !checkbox.checked;
			checkbox.dispatchEvent(new Event('change'));
		});
	}

	if (model.provider !== 'OpenAI' && model.provider !== 'Anthropic') {
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
		provider: '',
		baseUrl: '',
		enabled: true
	};
	showModelModal(newModel);
}

function editModel(index: number) {
	const modelToEdit = generalSettings.models[index];
	showModelModal(modelToEdit, index);
}

function showModelModal(model: ModelConfig, index?: number): void {
	const modal = document.getElementById('model-modal');
	if (!modal) return;

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.textContent = index !== undefined ? getMessage('editModel') : getMessage('addModelTitle');
	}

	const form = modal.querySelector('#model-form') as HTMLFormElement;
	if (form) {
		const nameInput = form.querySelector('[name="name"]') as HTMLInputElement;
		const providerInput = form.querySelector('[name="provider"]') as HTMLInputElement;
		const baseUrlInput = form.querySelector('[name="baseUrl"]') as HTMLInputElement;
		const apiKeyInput = form.querySelector('[name="apiKey"]') as HTMLInputElement;
		const providerIdInput = form.querySelector('[name="providerId"]') as HTMLInputElement;

		nameInput.value = model.name;
		providerInput.value = model.provider || '';
		baseUrlInput.value = model.baseUrl || '';
		apiKeyInput.value = model.apiKey || '';
		providerIdInput.value = model.providerId || '';
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
		const providerId = formData.get('providerId') as string;
		const updatedModel: ModelConfig = {
			id: model.id || Date.now().toString(),
			providerId: providerId,
			name: formData.get('name') as string,
			provider: formData.get('provider') as string || undefined,
			baseUrl: formData.get('baseUrl') as string,
			
			apiKey: formData.get('apiKey') as string || undefined,
			enabled: model.enabled
		};

		if (!updatedModel.name || !updatedModel.baseUrl || !updatedModel.providerId) {
			alert('Model name, Base URL, and Model ID are required.');
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
	
	// Translate the modal content after showing it
	translatePage().then(() => {
		// Re-initialize icons after translation
		initializeIcons(modal);
	});
}

function deleteModel(index: number) {
	const modelToDelete = generalSettings.models[index];
	if (modelToDelete.provider === 'OpenAI' || modelToDelete.provider === 'Anthropic') {
		console.warn('Attempted to delete a default model. This operation is not allowed.');
		return;
	}

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
	const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
	const anthropicApiKeyInput = document.getElementById('anthropic-api-key') as HTMLInputElement;
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;
	const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;

	const updatedSettings = {
		openaiApiKey: apiKeyInput.value,
		anthropicApiKey: anthropicApiKeyInput.value,
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
		name: `${modelToDuplicate.name} (copy)`,
		enabled: true
	};

	generalSettings.models.push(duplicatedModel);
	saveSettings();
	initializeModelList();

	// Show edit modal for the new model
	const newIndex = generalSettings.models.length - 1;
	showModelModal(duplicatedModel, newIndex);
}