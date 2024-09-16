import { initializeToggles } from '../utils/ui-utils';
import { generalSettings, loadGeneralSettings, saveGeneralSettings } from '../utils/storage-utils';
import { updateUrl } from '../utils/routing';

export function initializeInterpreterSettings(): void {
	const interpreterSettingsForm = document.getElementById('interpreter-settings-form');
	if (interpreterSettingsForm) {
		interpreterSettingsForm.addEventListener('input', debounce(saveInterpreterSettingsFromForm, 500));
	}
	loadGeneralSettings().then(() => {
		const apiKeyInput = document.getElementById('openai-api-key') as HTMLInputElement;
		const anthropicApiKeyInput = document.getElementById('anthropic-api-key') as HTMLInputElement;
		const modelSelect = document.getElementById('default-model') as HTMLSelectElement;

		if (apiKeyInput) apiKeyInput.value = generalSettings.openaiApiKey || '';
		if (anthropicApiKeyInput) anthropicApiKeyInput.value = generalSettings.anthropicApiKey || '';
		if (modelSelect) modelSelect.value = generalSettings.openaiModel || 'gpt-4o-mini';
		initializeAutoSave();
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

	const updatedSettings = {
		openaiApiKey: apiKeyInput.value,
		anthropicApiKey: anthropicApiKeyInput.value,
		openaiModel: modelSelect.value,
	};

	saveGeneralSettings(updatedSettings);
}

function debounce(func: Function, delay: number): (...args: any[]) => void {
	let timeoutId: NodeJS.Timeout;
	return (...args: any[]) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

export function showInterpreterSettings(): void {
	const generalSection = document.getElementById('general-section');
	const interpreterSection = document.getElementById('interpreter-section');
	const templatesSection = document.getElementById('templates-section');

	if (generalSection) generalSection.style.display = 'none';
	if (interpreterSection) {
		interpreterSection.style.display = 'block';
		interpreterSection.classList.add('active');
	}
	if (templatesSection) templatesSection.style.display = 'none';

	updateUrl('interpreter');

	// Update sidebar active state
	document.querySelectorAll('.sidebar li').forEach(item => item.classList.remove('active'));
	const interpreterItem = document.querySelector('.sidebar li[data-section="interpreter"]');
	if (interpreterItem) interpreterItem.classList.add('active');
}