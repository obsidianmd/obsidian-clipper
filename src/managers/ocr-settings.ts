import { saveSettings, generalSettings } from '../utils/storage-utils';
import { updateToggleState } from '../utils/ui-utils';
import { debounce } from '../utils/debounce';

function updateModeVisibility(pdfMode: string) {
	const mistralSettings = document.getElementById('ocr-mistral-settings');
	const llmSummarySettings = document.getElementById('llm-summary-settings');
	if (mistralSettings) {
		mistralSettings.style.display = pdfMode === 'ocr' ? '' : 'none';
	}
	if (llmSummarySettings) {
		llmSummarySettings.style.display = pdfMode === 'llm-summary' ? '' : 'none';
	}
}

export function initializeOcrSettings() {
	const form = document.getElementById('ocr-settings-form');
	if (!form) return;

	const ocrToggle = document.getElementById('ocr-toggle') as HTMLInputElement;
	const apiKeyInput = document.getElementById('ocr-api-key') as HTMLInputElement;
	const includeImagesToggle = document.getElementById('ocr-include-images-toggle') as HTMLInputElement;
	const pdfModeSelect = document.getElementById('pdf-mode-select') as HTMLSelectElement;

	if (ocrToggle) {
		ocrToggle.checked = generalSettings.ocrSettings.enabled;
		const ocrContainer = ocrToggle.closest('.checkbox-container') as HTMLElement;
		if (ocrContainer) {
			updateToggleState(ocrContainer, ocrToggle);
		}
		ocrToggle.addEventListener('change', () => {
			generalSettings.ocrSettings.enabled = ocrToggle.checked;
			saveSettings();
		});
	}

	if (pdfModeSelect) {
		pdfModeSelect.value = generalSettings.ocrSettings.pdfMode || 'ocr';
		updateModeVisibility(pdfModeSelect.value);
		pdfModeSelect.addEventListener('change', () => {
			generalSettings.ocrSettings.pdfMode = pdfModeSelect.value as 'ocr' | 'llm-summary';
			updateModeVisibility(pdfModeSelect.value);
			saveSettings();
		});
	}

	if (apiKeyInput) {
		apiKeyInput.value = generalSettings.ocrSettings.apiKey;
		const debouncedSave = debounce(() => saveSettings(), 500);
		apiKeyInput.addEventListener('input', () => {
			generalSettings.ocrSettings.apiKey = apiKeyInput.value.trim();
			debouncedSave();
		});
	}

	if (includeImagesToggle) {
		includeImagesToggle.checked = generalSettings.ocrSettings.includeImages;
		const imagesContainer = includeImagesToggle.closest('.checkbox-container') as HTMLElement;
		if (imagesContainer) {
			updateToggleState(imagesContainer, includeImagesToggle);
		}
		includeImagesToggle.addEventListener('change', () => {
			generalSettings.ocrSettings.includeImages = includeImagesToggle.checked;
			saveSettings();
		});
	}
}
