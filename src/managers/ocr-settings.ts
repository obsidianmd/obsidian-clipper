import { saveSettings, generalSettings } from '../utils/storage-utils';

export function initializeOcrSettings() {
	const form = document.getElementById('ocr-settings-form');
	if (!form) return;

	const ocrToggle = document.getElementById('ocr-toggle') as HTMLInputElement;
	const apiKeyInput = document.getElementById('ocr-api-key') as HTMLInputElement;
	const includeImagesToggle = document.getElementById('ocr-include-images-toggle') as HTMLInputElement;

	// Load current values
	if (ocrToggle) {
		ocrToggle.checked = generalSettings.ocrSettings.enabled;
		ocrToggle.addEventListener('change', () => {
			generalSettings.ocrSettings.enabled = ocrToggle.checked;
			saveSettings();
		});
	}

	if (apiKeyInput) {
		apiKeyInput.value = generalSettings.ocrSettings.apiKey;
		apiKeyInput.addEventListener('input', () => {
			generalSettings.ocrSettings.apiKey = apiKeyInput.value.trim();
			saveSettings();
		});
	}

	if (includeImagesToggle) {
		includeImagesToggle.checked = generalSettings.ocrSettings.includeImages;
		includeImagesToggle.addEventListener('change', () => {
			generalSettings.ocrSettings.includeImages = includeImagesToggle.checked;
			saveSettings();
		});
	}
}
