import { initializeToggles, updateToggleState, initializeSettingToggle } from '../utils/ui-utils';
import { ModelConfig, Provider } from '../types/types';
import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { initializeIcons } from '../icons/icons';
import { showModal, hideModal } from '../utils/modal-utils';
import { getMessage, translatePage } from '../utils/i18n';
import { debugLog } from '../utils/debug';

export interface PresetProvider {
	id: string;
	name: string;
	baseUrl: string;
	apiKeyUrl?: string;
	apiKeyRequired?: boolean;
	modelsList?: string;
	popularModels?: Array<{
		id: string;
		name: string;
		recommended?: boolean;
	}>;
}

const PROVIDERS_URL = 'https://raw.githubusercontent.com/obsidianmd/obsidian-clipper/refs/heads/main/providers.json';
const PRESET_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PRESET_RETRY_DELAY = 60 * 1000; // 1 minute

let cachedPresets: Record<string, PresetProvider> | null = null;
let lastFetchTime = 0;
let lastErrorTime = 0;
let isFetching = false;

async function fetchPresetProviders(): Promise<Record<string, PresetProvider>> {
	debugLog('Providers', 'Fetching preset providers from URL:', PROVIDERS_URL);
	try {
		const response = await fetch(PROVIDERS_URL);
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		// Add the preset ID to each provider object
		for (const key in data) {
			if (Object.prototype.hasOwnProperty.call(data, key)) {
				data[key].id = key;
			}
		}
		debugLog('Providers', 'Successfully fetched presets:', data);
		return data as Record<string, PresetProvider>;
	} catch (error) {
		console.error('Failed to fetch preset providers:', error);
		throw error; // Re-throw to be handled by getPresetProviders
	}
}

export async function getPresetProviders(): Promise<Record<string, PresetProvider>> {
	const now = Date.now();

	if (cachedPresets && (now - lastFetchTime < PRESET_CACHE_DURATION)) {
		debugLog('Providers', 'Returning cached presets');
		return cachedPresets;
	}

	// Prevent concurrent fetches and retry immediately after an error only after delay
	if (isFetching || (lastErrorTime > 0 && now - lastErrorTime < PRESET_RETRY_DELAY)) {
		debugLog('Providers', 'Fetching is already in progress or recently failed, returning cached (possibly stale) presets or empty object');
		return cachedPresets || {}; // Return potentially stale cache or empty if first fetch failed
	}

	isFetching = true;
	try {
		const presets = await fetchPresetProviders();
		cachedPresets = presets;
		lastFetchTime = Date.now();
		lastErrorTime = 0; // Reset error time on success
		debugLog('Providers', 'Presets cached successfully');
		return cachedPresets;
	} catch (error) {
		console.error('Failed to load or cache preset providers:', error);
		lastErrorTime = Date.now();
		// Return the potentially stale cache if available, otherwise an empty object
		return cachedPresets || {}; 
	} finally {
		isFetching = false;
	}
}

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
		// Note: input event might not be ideal for the whole form if it triggers too often.
		// Consider attaching debounced savers only to specific inputs like textareas.
		// Toggles save immediately via their own handlers.
	}

	// First load settings and initialize everything
	loadSettings().then(async () => {
		debugLog('Interpreter', 'Loaded settings:', generalSettings);

		// Fetch presets before initializing lists that depend on them
		await getPresetProviders(); 

		// Initialize providers first since models depend on them
		await initializeProviderList(); // Made async
		initializeModelList(); // Depends on providers, which are now initialized

		// Initialize toggles and other UI elements
		initializeInterpreterToggles();

		const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;
		if (defaultPromptContextInput) {
			defaultPromptContextInput.value = generalSettings.defaultPromptContext;
		}

		updatePromptContextVisibility();
		initializeToggles(); // General toggles outside the forms
		initializeAutoSave(); // Handles specific input auto-saving
	}).catch(error => {
		console.error("Failed to initialize interpreter settings:", error);
		// Optionally show an error message to the user
	});

	// Set up button event listeners
	const addModelBtn = document.getElementById('add-model-btn');
	if (addModelBtn) {
		// Use async void for event handlers calling async functions
		addModelBtn.addEventListener('click', async (event) => { await addModelToList(event); }); 
	}

	const addProviderBtn = document.getElementById('add-provider-btn');
	if (addProviderBtn) {
		// Use async void for event handlers calling async functions
		addProviderBtn.addEventListener('click', async (event) => { await addProviderToList(event); }); 
	}
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

async function initializeProviderList(): Promise<void> { 
	debugLog('Providers', 'Initializing provider list with:', generalSettings.providers);
	const providerList = document.getElementById('provider-list');
	if (!providerList) {
		console.error('Provider list element not found');
		return;
	}

	// Fetch presets needed for list item creation
	const presetProviders = await getPresetProviders();

	// Sort providers alphabetically by name
	const sortedProviders = [...generalSettings.providers].sort((a, b) => 
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	providerList.innerHTML = ''; // Clear existing list
	sortedProviders.forEach((provider, index) => {
		try {
			// Pass presets to avoid fetching multiple times inside the loop
			const providerItem = createProviderListItem(provider, index, presetProviders); 
			providerList.appendChild(providerItem);
		} catch (error) {
			console.error(`Failed to create list item for provider ${provider.name}:`, error);
		}
	});

	initializeIcons(providerList);
	debugLog('Providers', 'Provider list initialized');
}

function createProviderListItem(provider: Provider, index: number, presetProviders: Record<string, PresetProvider>): HTMLElement { 
	const providerItem = document.createElement('div');
	providerItem.className = 'provider-list-item';
	providerItem.dataset.index = index.toString(); // Store original index if needed for edits/deletes
	providerItem.dataset.providerId = provider.id; // Use stable provider ID

	// Find matching preset provider by name and URL to check if API key is required
	const presetProvider = Object.values(presetProviders).find( 
		preset => preset.name === provider.name && preset.baseUrl === provider.baseUrl
	);

	// API key is considered required if apiKeyRequired is true or undefined (default)
	const isApiKeyRequired = presetProvider?.apiKeyRequired !== false; 
	const hasNoKey = isApiKeyRequired && !provider.apiKey;

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
			${hasNoKey ? `<span class="provider-no-key"><i data-lucide="alert-triangle"></i> <span class="mh">${getMessage('apiKeyMissing')}</span></span>` : ''}
		</div>
		<div class="provider-list-item-actions">
			<button class="edit-provider-btn clickable-icon" data-provider-id="${provider.id}" aria-label="${getMessage('editProvider')}">
				<i data-lucide="pen-line"></i>
			</button>
			<button class="delete-provider-btn clickable-icon" data-provider-id="${provider.id}" aria-label="${getMessage('deleteProvider')}">
				<i data-lucide="trash-2"></i>
			</button>
		</div>
	`;

	const editBtn = providerItem.querySelector('.edit-provider-btn');
	editBtn?.addEventListener('click', async (e) => { // Async handler
		e.preventDefault();
		e.stopPropagation();
		const providerId = (e.currentTarget as HTMLElement).getAttribute('data-provider-id');
		if (providerId) {
			const providerIndex = generalSettings.providers.findIndex(p => p.id === providerId);
			if (providerIndex !== -1) {
				await editProvider(providerIndex); // Call async function
			} else {
				console.error(`Provider with ID ${providerId} not found for editing.`);
			}
		}
	});

	const deleteBtn = providerItem.querySelector('.delete-provider-btn');
	deleteBtn?.addEventListener('click', async (e) => { // Async handler
		e.preventDefault();
		e.stopPropagation();
		const providerId = (e.currentTarget as HTMLElement).getAttribute('data-provider-id');
		if (providerId) {
			const providerIndex = generalSettings.providers.findIndex(p => p.id === providerId);
			if (providerIndex !== -1) {
				await deleteProvider(providerIndex); // Call async function
			} else {
				console.error(`Provider with ID ${providerId} not found for deletion.`);
			}
		}
	});

	// Removed duplicate provider button logic for simplicity, can be re-added if needed

	return providerItem;
}

async function addProviderToList(event: Event): Promise<void> { 
	event.preventDefault();
	debugLog('Providers', 'Adding new provider');
	const newProvider: Provider = {
		id: Date.now().toString(), // Use a more robust UID method if possible
		name: '',
		baseUrl: '',
		apiKey: ''
	};
	await showProviderModal(newProvider); // showProviderModal is async
}

async function editProvider(index: number): Promise<void> { 
	if (index < 0 || index >= generalSettings.providers.length) {
		console.error("Invalid index for editProvider:", index);
		return;
	}
	const providerToEdit = generalSettings.providers[index];
	await showProviderModal(providerToEdit, index); // Await the async modal
}

// Removed duplicateProvider function - can be re-added based on createProviderListItem

async function deleteProvider(index: number): Promise<void> { 
	if (index < 0 || index >= generalSettings.providers.length) {
		console.error("Invalid index for deleteProvider:", index);
		return;
	}
	const providerToDelete = generalSettings.providers[index];
	
	// Check if any models are using this provider
	const modelsUsingProvider = generalSettings.models.filter(m => m.providerId === providerToDelete.id);
	if (modelsUsingProvider.length > 0) {
		alert(getMessage('cannotDeleteProvider', [providerToDelete.name, modelsUsingProvider.length.toString()]));
		return;
	}

	if (confirm(getMessage('deleteProviderConfirm', providerToDelete.name))) { // Pass name to confirm message
		generalSettings.providers.splice(index, 1);
		try {
			await saveSettings();
			await initializeProviderList(); // Await the async list initialization
			initializeModelList(); // Refresh model list in case providers changed
		} catch (error) {
			console.error("Failed to save settings after deleting provider:", error);
			alert(getMessage('failedToDeleteProvider')); // Provide feedback
		}
	}
}

async function showProviderModal(provider: Provider, index?: number): Promise<void> { 
	debugLog('Providers', 'Showing provider modal:', { provider, index });
	const modal = document.getElementById('provider-modal');
	if (!modal) {
		console.error("Provider modal element not found");
		return;
	}

	// Fetch presets before showing the modal
	const presetProviders = await getPresetProviders();

	await translatePage(); // Ensure translations are ready
	initializeIcons(modal); // Initialize icons within the modal

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.textContent = getMessage(index !== undefined ? 'editProvider' : 'addProviderTitle');
	}

	const form = modal.querySelector('#provider-form') as HTMLFormElement;
	const nameInput = form?.querySelector('[name="name"]') as HTMLInputElement;
	const baseUrlInput = form?.querySelector('[name="baseUrl"]') as HTMLInputElement;
	const apiKeyInput = form?.querySelector('[name="apiKey"]') as HTMLInputElement;
	const presetSelect = form?.querySelector('[name="preset"]') as HTMLSelectElement;
	const nameContainer = nameInput?.closest('.setting-item') as HTMLElement;
	const baseUrlContainer = baseUrlInput?.closest('.setting-item') as HTMLElement;
	const apiKeyContainer = apiKeyInput?.closest('.setting-item') as HTMLElement;
	const apiKeyDescription = apiKeyContainer?.querySelector('.setting-item-description') as HTMLElement;

	if (!form || !nameInput || !baseUrlInput || !apiKeyInput || !presetSelect || !nameContainer || !baseUrlContainer || !apiKeyContainer || !apiKeyDescription) {
		console.error('Required form elements not found in provider modal');
		return;
	}

	// --- Preset Select Setup ---
	// Clone to remove old listeners before adding new ones
	const oldPresetSelect = presetSelect;
	const newPresetSelect = oldPresetSelect.cloneNode(true) as HTMLSelectElement;
	oldPresetSelect.parentNode?.replaceChild(newPresetSelect, oldPresetSelect);
	const currentPresetSelect = newPresetSelect; // Use the new element

	currentPresetSelect.innerHTML = `<option value="">${getMessage('custom')}</option>`; // Add custom option first
	Object.entries(presetProviders).forEach(([id, preset]) => {
		const option = document.createElement('option');
		option.value = id; // Use the key (preset ID) as the value
		option.textContent = preset.name;
		currentPresetSelect.appendChild(option);
	});

	// Determine initial preset selection
	let currentPresetId = '';
	if (index !== undefined) { // Editing existing provider
		const matchingPreset = Object.entries(presetProviders).find(([_, preset]) => 
			preset.name === provider.name && preset.baseUrl === provider.baseUrl
		);
		currentPresetId = matchingPreset ? matchingPreset[0] : ''; // Found preset ID or empty (custom)
	} else { // Adding new provider
		const anthropicPreset = Object.entries(presetProviders).find(([_, p]) => p.id === 'anthropic');
		currentPresetId = anthropicPreset ? anthropicPreset[0] : ''; // Default to Anthropic ID if found
	}
	currentPresetSelect.value = currentPresetId; // Set initial selection

	// --- Visibility and Pre-fill Logic ---
	const updateVisibility = () => {
		const selectedPresetId = currentPresetSelect.value;
		const isCustom = !selectedPresetId;
		const selectedPreset = isCustom ? null : presetProviders[selectedPresetId];

		nameContainer.style.display = isCustom ? 'block' : 'none';
		baseUrlContainer.style.display = isCustom ? 'block' : 'none'; 
		nameInput.disabled = !isCustom;
		baseUrlInput.disabled = !isCustom;

		if (selectedPreset) {
			// Pre-fill ONLY if adding new OR if existing name/URL match the selected preset
			if (index === undefined || provider.name === selectedPreset.name) {
				nameInput.value = selectedPreset.name;
			}
			if (index === undefined || provider.baseUrl === selectedPreset.baseUrl) {
				baseUrlInput.value = selectedPreset.baseUrl;
			}

			const apiKeyRequired = selectedPreset.apiKeyRequired !== false;
			apiKeyContainer.style.display = apiKeyRequired ? 'block' : 'none';
			if (apiKeyRequired) {
				apiKeyDescription.innerHTML = getMessage('providerApiKeyDescription'); // Base description
				if (selectedPreset.apiKeyUrl) {
					const link = document.createElement('a');
					link.href = selectedPreset.apiKeyUrl;
					link.target = '_blank';
					link.textContent = ` ${getMessage('getApiKeyHere', selectedPreset.name)}`; // Use specific message
					apiKeyDescription.appendChild(link);
				}
			}
		} else { // Custom Provider
			apiKeyContainer.style.display = 'block'; // API key always possible for custom
			apiKeyDescription.innerHTML = getMessage('providerApiKeyDescription'); 
			// Don't clear fields when switching back to custom if editing
			if (index === undefined) { 
				nameInput.value = '';
				baseUrlInput.value = '';
			}
		}
	};

	// --- Initial Values & Event Listener ---
	if (index !== undefined) { // Editing: Set values from the provider object
		nameInput.value = provider.name;
		baseUrlInput.value = provider.baseUrl;
		apiKeyInput.value = provider.apiKey || ''; 
	} else { // Adding: Ensure fields are clear or defaulted
		apiKeyInput.value = ''; 
		// updateVisibility handles name/URL based on default preset selection
	}

	currentPresetSelect.addEventListener('change', updateVisibility);
	updateVisibility(); // Initial call

	// --- Buttons ---
	const confirmBtn = modal.querySelector('.provider-confirm-btn');
	const cancelBtn = modal.querySelector('.provider-cancel-btn');

	if (!confirmBtn || !cancelBtn) {
		console.error("Provider modal buttons not found");
		return;
	}

	// Clone buttons to remove previous listeners
	const newConfirmBtn = confirmBtn.cloneNode(true);
	confirmBtn.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
	const newCancelBtn = cancelBtn.cloneNode(true);
	cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn);

	newConfirmBtn.addEventListener('click', async () => { 
		const selectedPresetId = currentPresetSelect.value;
		const selectedPreset = selectedPresetId ? presetProviders[selectedPresetId] : null;

		let finalName = selectedPreset ? selectedPreset.name : nameInput.value.trim();
		let finalBaseUrl = selectedPreset ? selectedPreset.baseUrl : baseUrlInput.value.trim();
		const finalApiKey = apiKeyInput.value.trim();

		if (!finalName || !finalBaseUrl) {
			alert(getMessage('providerRequiredFields'));
			return;
		}

		// Check API key requirement
		const isApiKeyRequired = selectedPreset ? selectedPreset.apiKeyRequired !== false : true; // Assume required for custom
		if (isApiKeyRequired && !finalApiKey) {
			const confirmMsg = getMessage('apiKeyMissingConfirm', finalName);
			if (!confirm(confirmMsg)) {
				return; // Stop saving if user cancels
			}
		}

		let finalApiKeyRequired: boolean | undefined;
		let finalPresetId: string | undefined;
		if (selectedPreset) {
			finalApiKeyRequired = selectedPreset.apiKeyRequired === false ? false : undefined;
			finalPresetId = selectedPresetId; // Store the selected preset ID
		} else {
			finalApiKeyRequired = undefined; 
			finalPresetId = undefined; // No preset ID for custom providers
		}

		const updatedProvider: Provider = {
			id: provider.id, 
			name: finalName,
			baseUrl: finalBaseUrl,
			apiKey: finalApiKey,
			apiKeyRequired: finalApiKeyRequired,
			presetId: finalPresetId // Add the preset ID
		};

		debugLog('Providers', 'Saving provider:', updatedProvider);

		try {
			if (index !== undefined) { // Editing existing
				if (index < 0 || index >= generalSettings.providers.length) {
					throw new Error("Invalid index during provider save.");
				}
				generalSettings.providers[index] = updatedProvider;
			} else { // Adding new
				generalSettings.providers.push(updatedProvider);
			}
			await saveSettings(); 
			debugLog('Providers', 'Settings saved');
			await initializeProviderList(); // Refresh provider list
			initializeModelList(); // Refresh model list (uses providers)
			hideModal(modal);
		} catch (error) {
			console.error('Failed to save provider settings:', error);
			alert(getMessage('failedToSaveProvider'));
		}
	});

	newCancelBtn.addEventListener('click', () => {
		hideModal(modal);
	});

	showModal(modal);
}

export function initializeModelList(): void {
	const modelList = document.getElementById('model-list');
	if (!modelList) {
		console.error("Model list element not found");
		return;
	}

	// Ensure providers are loaded and sorted before creating model items
	const sortedProviders = [...generalSettings.providers].sort((a, b) => 
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	modelList.innerHTML = ''; // Clear existing list
	generalSettings.models.forEach((model, index) => {
		try {
			// Pass sorted providers if needed by createModelListItem in the future
			const modelItem = createModelListItem(model, index); 
			modelList.appendChild(modelItem);
		} catch (error) {
			console.error(`Failed to create list item for model ${model.name}:`, error);
		}
	});

	initializeIcons(modelList);
	debugLog('Models', 'Model list initialized');
}

function createModelListItem(model: ModelConfig, index: number): HTMLElement {
	const modelItem = document.createElement('div');
	modelItem.className = 'model-list-item';
	modelItem.draggable = true; // Re-enable drag maybe later
	modelItem.dataset.modelId = model.id; // Use stable model ID

	const provider = generalSettings.providers.find(p => p.id === model.providerId);
	const providerName = provider?.name || `<span class="model-provider-unknown"><i data-lucide="alert-triangle"></i> ${getMessage('unknownProvider')}</span>`;

	// Note: Using data-model-id for buttons now, index is less reliable if list reorders
	modelItem.innerHTML = `
		<div class="drag-handle">
			<i data-lucide="grip-vertical"></i>
		</div>
		<div class="model-list-item-info">
			<div class="model-name">${model.name}</div>
			<div class="model-provider mh">${providerName}</div>
		</div>
		<div class="model-list-item-actions">
			<button class="edit-model-btn clickable-icon" data-model-id="${model.id}" aria-label="${getMessage('editModel')}">
				<i data-lucide="pen-line"></i>
			</button>
			<button class="duplicate-model-btn clickable-icon" data-model-id="${model.id}" aria-label="${getMessage('duplicateModel')}">
				<i data-lucide="copy-plus"></i>
			</button>
			<button class="delete-model-btn clickable-icon" data-model-id="${model.id}" aria-label="${getMessage('deleteModel')}">
				<i data-lucide="trash-2"></i>
			</button>
			<div class="checkbox-container mod-small">
				<input type="checkbox" id="model-${model.id}" ${model.enabled ? 'checked' : ''}>
			</div>
		</div>
	`;

	const checkbox = modelItem.querySelector(`#model-${model.id}`) as HTMLInputElement;
	const checkboxContainer = modelItem.querySelector('.checkbox-container') as HTMLElement;
	
	if (checkbox && checkboxContainer) {
		initializeToggles(modelItem); 
		checkbox.addEventListener('change', async () => { 
			const modelId = model.id; // Capture id
			const modelIndex = generalSettings.models.findIndex(m => m.id === modelId);
			if (modelIndex === -1) {
				console.error("Model not found for toggle:", modelId);
				return;
			}
			generalSettings.models[modelIndex].enabled = checkbox.checked;
			try {
				await saveSettings(); 
			} catch (error) {
				console.error("Failed to save model enabled state:", error);
				// Optionally revert checkbox state visually
				checkbox.checked = !checkbox.checked; 
			}
		});
	}

	// Use modelId for button actions
	const editBtn = modelItem.querySelector('.edit-model-btn');
	editBtn?.addEventListener('click', async (e) => {
		e.preventDefault(); e.stopPropagation();
		const modelId = (e.currentTarget as HTMLElement).getAttribute('data-model-id');
		if (modelId) await editModel(modelId); // Pass ID
	});

	const duplicateBtn = modelItem.querySelector('.duplicate-model-btn');
	duplicateBtn?.addEventListener('click', async (e) => {
		e.preventDefault(); e.stopPropagation();
		const modelId = (e.currentTarget as HTMLElement).getAttribute('data-model-id');
		if (modelId) await duplicateModel(modelId); // Pass ID
	});

	const deleteBtn = modelItem.querySelector('.delete-model-btn');
	deleteBtn?.addEventListener('click', async (e) => {
		e.preventDefault(); e.stopPropagation();
		const modelId = (e.currentTarget as HTMLElement).getAttribute('data-model-id');
		if (modelId) await deleteModel(modelId); // Pass ID
	});

	initializeIcons(modelItem);

	return modelItem;
}

async function addModelToList(event: Event): Promise<void> { 
	event.preventDefault();
	const newModel: ModelConfig = {
		id: Date.now().toString(), // Use better UID if possible
		providerId: '',
		providerModelId: '',
		name: '',
		enabled: true
	};
	// Pass null for modelId to indicate creation
	await showModelModal(newModel, null); 
}

// Edit using modelId instead of index
async function editModel(modelId: string): Promise<void> { 
	const modelIndex = generalSettings.models.findIndex(m => m.id === modelId);
	if (modelIndex === -1) {
		console.error("Model not found for edit:", modelId);
		alert(getMessage('failedToEditModel')); // Or a more specific message
		return;
	}
	const modelToEdit = generalSettings.models[modelIndex];
	// Pass model object and its original ID
	await showModelModal(modelToEdit, modelId); 
}

// Accept model object and optional originalId (null if creating)
async function showModelModal(model: ModelConfig, originalId: string | null): Promise<void> { 
	debugLog('Models', 'Showing model modal:', { model, originalId });
	const modal = document.getElementById('model-modal');
	if (!modal) {
		console.error("Model modal element not found");
		return;
	}

	const isEditing = originalId !== null;

	// Fetch presets before showing modal
	const presetProviders = await getPresetProviders();

	await translatePage();
	initializeIcons(modal);

	const titleElement = modal.querySelector('.modal-title');
	if (titleElement) {
		titleElement.textContent = getMessage(isEditing ? 'editModel' : 'addModelTitle');
	}

	const form = modal.querySelector('#model-form') as HTMLFormElement;
	const providerSelect = form?.querySelector('[name="providerId"]') as HTMLSelectElement;
	const modelIdDescContainer = form?.querySelector('.setting-item:has([name="providerModelId"]) .setting-item-description') as HTMLElement;
	const modelSelectionContainer = form?.querySelector('.model-selection-container') as HTMLElement;
	const modelSelectionRadios = form?.querySelector('#model-selection-radios') as HTMLElement;
	const nameInput = form?.querySelector('[name="name"]') as HTMLInputElement;
	const providerModelIdInput = form?.querySelector('[name="providerModelId"]') as HTMLInputElement;
	const nameContainer = nameInput?.closest('.setting-item') as HTMLElement;
	const providerModelIdContainer = providerModelIdInput?.closest('.setting-item') as HTMLElement;

	if (!form || !providerSelect || !modelIdDescContainer || !modelSelectionContainer || !modelSelectionRadios || !nameInput || !providerModelIdInput || !nameContainer || !providerModelIdContainer) {
		console.error('Required form elements not found in model modal');
		return;
	}

	// --- Provider Select Setup ---
	const oldProviderSelect = providerSelect;
	const newProviderSelect = oldProviderSelect.cloneNode(true) as HTMLSelectElement; // Clone with options
	oldProviderSelect.parentNode?.replaceChild(newProviderSelect, oldProviderSelect);
	const currentProviderSelect = newProviderSelect;

	const sortedProviders = [...generalSettings.providers].sort((a, b) => 
		a.name.toLowerCase().localeCompare(b.name.toLowerCase())
	);

	currentProviderSelect.innerHTML = `<option value="">${getMessage('selectProvider')}</option>`; // Default option
	sortedProviders.forEach(p => {
		const option = document.createElement('option');
		option.value = p.id;
		option.textContent = p.name;
		currentProviderSelect.appendChild(option);
	});

	// Set initial provider selection
	if (isEditing) {
		currentProviderSelect.value = model.providerId || ''; 
	} else if (sortedProviders.length > 0) {
		// Default to the first provider when adding a new model
		currentProviderSelect.value = sortedProviders[0].id;
	} else {
		// No providers available
		currentProviderSelect.value = '';
	}

	// --- Model Options Logic ---
	const updateModelOptions = () => {
		const selectedProviderId = currentProviderSelect.value;
		const selectedProvider = generalSettings.providers.find(p => p.id === selectedProviderId);
		let currentPresetProvider: PresetProvider | undefined = undefined;
		
		// Clear previous radio state & listeners
		const oldRadioContainer = modelSelectionRadios;
		const newRadioContainer = oldRadioContainer.cloneNode(false) as HTMLElement; // Clone empty
		oldRadioContainer.parentNode?.replaceChild(newRadioContainer, oldRadioContainer);
		const currentRadioContainer = newRadioContainer;
		modelSelectionContainer.style.display = 'none'; // Hide by default

		if (selectedProvider) {
			// Find matching preset provider using the stored presetId if available
			if (selectedProvider.presetId && presetProviders[selectedProvider.presetId]) {
				currentPresetProvider = presetProviders[selectedProvider.presetId];
				debugLog('Models', 'Found preset via presetId:', currentPresetProvider);
			} else {
				// Fallback: Try matching by name and URL (less reliable)
				currentPresetProvider = Object.values(presetProviders).find(
					preset => preset.name === selectedProvider.name && preset.baseUrl === selectedProvider.baseUrl
				);
				if (currentPresetProvider) {
					debugLog('Models', 'Found preset via name/URL fallback:', currentPresetProvider);
				}
			}

			// Update model ID description link
			modelIdDescContainer.innerHTML = getMessage('providerModelIdDescription'); // Reset description
			if (currentPresetProvider?.modelsList) {
				const link = document.createElement('a');
				link.href = currentPresetProvider.modelsList;
				link.target = '_blank';
				link.textContent = ` ${getMessage('modelsListFor', selectedProvider.name)}`;
				modelIdDescContainer.appendChild(link);
			}

			// Populate popular models if available
			if (currentPresetProvider?.popularModels?.length) {
				modelSelectionContainer.style.display = 'block';
				
				currentPresetProvider.popularModels.forEach((popModel, idx) => {
					const radioId = `pop-model-${idx}`;
					const radioDiv = document.createElement('div');
					radioDiv.className = 'radio-option';
					radioDiv.innerHTML = `
						<input type="radio" name="model-selection" id="${radioId}" value="${popModel.id}">
						<label for="${radioId}">
							${popModel.name}${popModel.recommended ? ` <span class="tag">${getMessage('recommended')}</span>` : ''}
						</label>
					`;
					currentRadioContainer.appendChild(radioDiv);
				});

				// Add "Other" option
				const otherRadioDiv = document.createElement('div');
				otherRadioDiv.className = 'radio-option';
				otherRadioDiv.innerHTML = `
					<input type="radio" name="model-selection" id="model-other" value="other">
					<label for="model-other">${getMessage('custom')}</label>
				`;
				currentRadioContainer.appendChild(otherRadioDiv);

				// Add change handler to the new container
				currentRadioContainer.addEventListener('change', (e) => {
					const target = e.target as HTMLInputElement;
					if (target.name !== 'model-selection' || !currentPresetProvider?.popularModels) return;

					if (target.value === 'other') {
						// Don't clear fields automatically, let user manage custom input
						nameInput.disabled = false;
						providerModelIdInput.disabled = false;
					} else {
						const selectedPopModel = currentPresetProvider.popularModels.find(m => m.id === target.value);
						if (selectedPopModel) {
							nameInput.value = selectedPopModel.name;
							providerModelIdInput.value = selectedPopModel.id;
							// Keep fields enabled even when selecting popular
							nameInput.disabled = false; 
							providerModelIdInput.disabled = false;
						}
					}
				});

				// Set initial radio state
				const matchingPopModelRadio = currentRadioContainer.querySelector(`input[value="${CSS.escape(model.providerModelId || '')}"]`) as HTMLInputElement;
				if (matchingPopModelRadio && isEditing) {
					matchingPopModelRadio.checked = true;
				} else {
					(currentRadioContainer.querySelector('#model-other') as HTMLInputElement).checked = true;
				}
			} 
		} 
		// Always ensure Name and Model ID fields are visible and enabled if a provider is selected
		const providerSelected = !!selectedProviderId;
		nameContainer.style.display = providerSelected ? 'block' : 'none';
		providerModelIdContainer.style.display = providerSelected ? 'block' : 'none';
		nameInput.disabled = !providerSelected;
		providerModelIdInput.disabled = !providerSelected;

	};

	// --- Initial Values & Event Listeners ---
	nameInput.value = model.name;
	providerModelIdInput.value = model.providerModelId || '';

	currentProviderSelect.addEventListener('change', updateModelOptions);
	updateModelOptions(); // Initial call - this will now use the default provider if adding


	// --- Buttons ---
	const confirmBtn = modal.querySelector('.model-confirm-btn');
	const cancelBtn = modal.querySelector('.model-cancel-btn');

	if (!confirmBtn || !cancelBtn) {
		console.error("Model modal buttons not found");
		return;
	}

	// Clone buttons to remove listeners
	const newConfirmBtn = confirmBtn.cloneNode(true);
	confirmBtn.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
	const newCancelBtn = cancelBtn.cloneNode(true);
	cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn);

	newConfirmBtn.addEventListener('click', async () => { 
		const finalProviderId = currentProviderSelect.value;
		const finalName = nameInput.value.trim();
		const finalProviderModelId = providerModelIdInput.value.trim();
		
		if (!finalName || !finalProviderId || !finalProviderModelId) {
			alert(getMessage('modelRequiredFields'));
			return;
		}

		const updatedModel: ModelConfig = {
			id: originalId || model.id, // Use original ID if editing, new ID was already set if creating
			providerId: finalProviderId,
			providerModelId: finalProviderModelId,
			name: finalName,
			enabled: model.enabled // Preserve original enabled state
		};

		debugLog('Models', 'Saving model:', updatedModel);

		try {
			if (isEditing) { // Editing existing
				const modelIndex = generalSettings.models.findIndex(m => m.id === originalId);
				if (modelIndex === -1) {
					throw new Error("Original model not found during save.");
				}
				generalSettings.models[modelIndex] = updatedModel;
			} else { // Adding new
				generalSettings.models.push(updatedModel);
			}
			await saveSettings();
			initializeModelList(); // Refresh list
			hideModal(modal);
		} catch (error) {
			console.error('Failed to save model settings:', error);
			alert(getMessage('failedToSaveModel')); 
		}
	});

	newCancelBtn.addEventListener('click', () => {
		hideModal(modal);
	});

	showModal(modal);
}

// Delete using modelId
async function deleteModel(modelId: string): Promise<void> { 
	const modelIndex = generalSettings.models.findIndex(m => m.id === modelId);
	if (modelIndex === -1) {
		console.error("Model not found for delete:", modelId);
		alert(getMessage('failedToDeleteModel')); // Or specific message
		return;
	}
	const modelToDelete = generalSettings.models[modelIndex];

	if (confirm(getMessage('deleteModelConfirm', modelToDelete.name))) { // Pass name
		generalSettings.models.splice(modelIndex, 1);
		try {
			await saveSettings();
			initializeModelList(); // Refresh list
		} catch (error) {
			console.error("Failed to save settings after deleting model:", error);
			alert(getMessage('failedToDeleteModel')); // Provide feedback
		}
	}
}

function initializeAutoSave(): void {
	const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;
	if (defaultPromptContextInput) {
		// Use the generic debounce function
		defaultPromptContextInput.addEventListener('input', debounce(async () => { 
			await saveInterpreterSettingsFromForm(); 
		}, 500));
	}
	// Toggles save immediately via initializeSettingToggle, no need for form-wide listener
}

// Save only settings managed directly by this specific form part
async function saveInterpreterSettingsFromForm(): Promise<void> { 
	const defaultPromptContextInput = document.getElementById('default-prompt-context') as HTMLTextAreaElement;

	if (!defaultPromptContextInput) return; // Element might not exist

	// Only save fields actually present and managed here
	const updatedSettings = {
		defaultPromptContext: defaultPromptContextInput.value
	};

	try {
		await saveSettings(updatedSettings); 
		debugLog('Interpreter Settings', 'Auto-saved settings', updatedSettings);
	} catch (error) {
		console.error("Failed to auto-save interpreter settings:", error);
	}
}

// Debounce utility function
function debounce<T extends (...args: any[]) => any>(
	func: T, 
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	return (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

// Duplicate using modelId
async function duplicateModel(modelId: string): Promise<void> { 
	const modelIndex = generalSettings.models.findIndex(m => m.id === modelId);
	if (modelIndex === -1) {
		console.error("Model not found for duplicate:", modelId);
		alert(getMessage('failedToDuplicateModel')); // Or specific message
		return;
	}
	const modelToDuplicate = generalSettings.models[modelIndex];

	const duplicatedModel: ModelConfig = {
		...modelToDuplicate,
		id: Date.now().toString(), // New unique ID
		name: `${modelToDuplicate.name} (copy)`,
		enabled: true // Default new duplicated model to enabled
	};

	generalSettings.models.push(duplicatedModel);
	try {
		await saveSettings();
		initializeModelList(); // Refresh list

		// Show edit modal for the *newly created* duplicated model (pass null for originalId)
		await showModelModal(duplicatedModel, null); 
	} catch(error) {
		console.error("Failed to save settings after duplicating model:", error);
		alert(getMessage('failedToDuplicateModel')); // Provide feedback
	}
}
