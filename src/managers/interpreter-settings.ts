import { initializeToggles, updateToggleState } from '../utils/ui-utils';
import { ModelConfig, generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeIcons } from '../icons/icons';

export function updatePromptContextVisibility(): void {
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const promptContextContainer = document.getElementById('prompt-context-container');

	if (promptContextContainer) {
		promptContextContainer.style.display = interpreterToggle.checked ? 'block' : 'none';
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

		if (apiKeyInput) apiKeyInput.value = generalSettings.openaiApiKey || '';
		if (anthropicApiKeyInput) anthropicApiKeyInput.value = generalSettings.anthropicApiKey || '';
		if (interpreterToggle) {
			interpreterToggle.checked = generalSettings.interpreterEnabled;
			updateToggleState(interpreterToggle.parentElement as HTMLElement, interpreterToggle);
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
			defaultPromptContextInput.value = generalSettings.defaultPromptContext || "You are a helpful assistant. Please analyze the following content and provide a concise summary.";
		}

		initializeModelList();
	});

	const addModelBtn = document.getElementById('add-model-btn');
	if (addModelBtn) {
		addModelBtn.addEventListener('click', (event) => addModelToList(event));
	}
}

function initializeModelList() {
	const modelList = document.getElementById('model-list');
	if (!modelList) return;

	modelList.innerHTML = '';
	generalSettings.models.forEach((model, index) => {
		const modelItem = createModelListItem(model, index);
		modelList.appendChild(modelItem);
	});
}

function createModelListItem(model: ModelConfig, index: number): HTMLElement {
	const modelItem = document.createElement('div');
	modelItem.className = 'model-list-item';
	modelItem.innerHTML = `
		<div class="model-list-item-info">
			<div class="model-name">${model.name}</div>
			<div class="model-provider">${model.provider || 'Custom'}</div>
		</div>
		<div class="model-list-item-actions">
			${model.provider !== 'OpenAI' && model.provider !== 'Anthropic' ? `
				<button class="edit-model-btn clickable-icon" data-index="${index}" aria-label="Edit model">
					<i data-lucide="pen-line"></i>
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
	checkbox.addEventListener('change', () => {
		if (generalSettings.models && generalSettings.models[index]) {
			generalSettings.models[index].enabled = checkbox.checked;
			saveSettings();
		} else {
			console.error(`Model at index ${index} not found in generalSettings.models`);
			checkbox.checked = !checkbox.checked;
		}
	});

	if (model.provider !== 'OpenAI' && model.provider !== 'Anthropic') {
		const editBtn = modelItem.querySelector('.edit-model-btn');
		if (editBtn) {
			editBtn.addEventListener('click', () => editModel(index));
		}

		const deleteBtn = modelItem.querySelector('.delete-model-btn');
		if (deleteBtn) {
			deleteBtn.addEventListener('click', () => deleteModel(index));
		}
	}

	initializeIcons(modelItem);

	return modelItem;
}

function addModelToList(event: Event) {
	event.preventDefault();
	const modelList = document.getElementById('model-list');
	if (!modelList) return;

	const newModel: ModelConfig = {
		id: Date.now().toString(),
		name: '',
		provider: '',
		baseUrl: '',
		enabled: true
	};

	const modelItem = createModelForm(newModel);
	modelList.appendChild(modelItem);
}

function editModel(index: number) {
	const modelList = document.getElementById('model-list');
	if (!modelList) return;

	const modelToEdit = generalSettings.models[index];
	const modelItem = createModelForm(modelToEdit, index);

	const oldModelItem = modelList.children[index];
	modelList.replaceChild(modelItem, oldModelItem);
}

function createModelForm(model: ModelConfig, index?: number): HTMLElement {
	const modelForm = document.createElement('div');
	modelForm.className = 'setting-item';
	modelForm.innerHTML = `
		<form class="model-form">
			<input type="text" name="name" placeholder="Model name" value="${model.name}" required>
			<input type="text" name="provider" placeholder="Provider (optional)" value="${model.provider || ''}">
			<input type="text" name="baseUrl" placeholder="Base URL" value="${model.baseUrl || ''}" required>
			<input type="password" name="apiKey" placeholder="API key (optional)" value="${model.apiKey || ''}">
			<button type="button" class="save-btn mod-cta">Save</button>
			<button type="button" class="cancel-btn">Cancel</button>
		</form>
	`;

	const form = modelForm.querySelector('form');
	const saveBtn = modelForm.querySelector('.save-btn');
	saveBtn?.addEventListener('click', (e) => {
		e.preventDefault();
		const formData = new FormData(form as HTMLFormElement);
		const updatedModel: ModelConfig = {
			id: model.id || Date.now().toString(),
			name: formData.get('name') as string,
			provider: formData.get('provider') as string || undefined,
			baseUrl: formData.get('baseUrl') as string,
			apiKey: formData.get('apiKey') as string || undefined,
			enabled: model.enabled
		};

		if (!updatedModel.name || !updatedModel.baseUrl) {
			alert('Model Name and Base URL are required.');
			return;
		}

		if (index !== undefined) {
			generalSettings.models[index] = updatedModel;
		} else {
			generalSettings.models.push(updatedModel);
		}

		saveSettings();
		initializeModelList();
	});

	const cancelBtn = modelForm.querySelector('.cancel-btn');
	cancelBtn?.addEventListener('click', () => {
		const modelList = document.getElementById('model-list');
		if (modelList && index !== undefined) {
			const existingItem = createModelListItem(generalSettings.models[index], index);
			modelList.replaceChild(existingItem, modelForm);
		} else if (modelList) {
			modelList.removeChild(modelForm);
		}
	});

	return modelForm;
}

function deleteModel(index: number) {
	const modelToDelete = generalSettings.models[index];
	if (modelToDelete.provider === 'OpenAI' || modelToDelete.provider === 'Anthropic') {
		console.warn('Attempted to delete a default model. This operation is not allowed.');
		return;
	}

	if (confirm('Are you sure you want to delete this model?')) {
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