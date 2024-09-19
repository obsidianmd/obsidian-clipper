import { initializeToggles, updateToggleState } from '../utils/ui-utils';
import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { updateUrl } from '../utils/routing';
import { modelList } from '../utils/model-list';
import { showSettingsSection } from './settings-section-ui';

export function initializeInterpreterSettings(): void {
	const interpreterSettingsForm = document.getElementById('interpreter-settings-form');
	if (interpreterSettingsForm) {
		interpreterSettingsForm.addEventListener('input', debounce(saveInterpreterSettingsFromForm, 500));
	}
	loadSettings().then(() => {
		const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
		const anthropicApiKeyInput = document.getElementById('anthropic-api-key') as HTMLInputElement;
		const modelSelect = document.getElementById('default-model') as HTMLSelectElement;
		const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
		const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;

		if (apiKeyInput) apiKeyInput.value = generalSettings.openaiApiKey || '';
		if (anthropicApiKeyInput) anthropicApiKeyInput.value = generalSettings.anthropicApiKey || '';
		if (modelSelect) {
			modelSelect.innerHTML = modelList.map(model => 
				`<option value="${model.value}">${model.label}</option>`
			).join('');
			modelSelect.value = generalSettings.interpreterModel || modelList[0].value;
		}
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
	});
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
	const modelSelect = document.getElementById('default-model') as HTMLSelectElement;
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const interpreterAutoRunToggle = document.getElementById('interpreter-auto-run-toggle') as HTMLInputElement;

	const updatedSettings = {
		openaiApiKey: apiKeyInput.value,
		anthropicApiKey: anthropicApiKeyInput.value,
		interpreterModel: modelSelect.value,
		interpreterEnabled: interpreterToggle.checked,
		interpreterAutoRun: interpreterAutoRunToggle.checked
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

export function updatePromptContextVisibility(): void {
	const interpreterToggle = document.getElementById('interpreter-toggle') as HTMLInputElement;
	const promptContextContainer = document.getElementById('prompt-context-container');

	if (promptContextContainer) {
		promptContextContainer.style.display = interpreterToggle.checked ? 'block' : 'none';
	}
}