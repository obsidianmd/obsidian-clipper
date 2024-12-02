import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import { initializeIcons } from '../icons/icons';
import { getCommands } from '../utils/hotkeys';
import { initializeToggles } from '../utils/ui-utils';
import { generalSettings, loadSettings, saveSettings } from '../utils/storage-utils';
import { detectBrowser } from '../utils/browser-detection';
import { createElementWithClass, createElementWithHTML } from '../utils/dom-utils';
import { createDefaultTemplate, getTemplates, saveTemplateSettings } from '../managers/template-manager';
import { updateTemplateList, showTemplateEditor } from '../managers/template-ui';
import { exportAllSettings, importAllSettings } from '../utils/import-export';
import { Template } from '../types/types';
import { exportHighlights } from './highlights-manager';
import { getMessage, setupLanguageAndDirection } from '../utils/i18n';
import { debounce } from '../utils/debounce';
import browser from '../utils/browser-polyfill';

export function updateVaultList(): void {
	const vaultList = document.getElementById('vault-list') as HTMLUListElement;
	if (!vaultList) return;

	vaultList.innerHTML = '';
	generalSettings.vaults.forEach((vault, index) => {
		const li = document.createElement('li');
		li.dataset.index = index.toString();
		li.draggable = true;

		const dragHandle = createElementWithClass('div', 'drag-handle');
		dragHandle.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'grip-vertical' }));
		li.appendChild(dragHandle);

		const span = document.createElement('span');
		span.textContent = vault;
		li.appendChild(span);

		const removeBtn = createElementWithClass('button', 'remove-vault-btn clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('aria-label', getMessage('removeVault'));
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		li.appendChild(removeBtn);

		li.addEventListener('dragstart', handleDragStart);
		li.addEventListener('dragover', handleDragOver);
		li.addEventListener('drop', handleDrop);
		li.addEventListener('dragend', handleDragEnd);
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			removeVault(index);
		});
		vaultList.appendChild(li);
	});

	initializeIcons(vaultList);
}

export function addVault(vault: string): void {
	generalSettings.vaults.push(vault);
	saveSettings();
	updateVaultList();
}

export function removeVault(index: number): void {
	generalSettings.vaults.splice(index, 1);
	saveSettings();
	updateVaultList();
}

export async function setShortcutInstructions() {
	const shortcutInstructionsElement = document.querySelector('.shortcut-instructions');
	if (shortcutInstructionsElement) {
		const browser = await detectBrowser();
		let instructions = '';
		switch (browser) {
			case 'chrome':
				instructions = getMessage('shortcutInstructionsChrome', ['<strong>chrome://extensions/shortcuts</strong>']);
				break;
			case 'brave':
				instructions = getMessage('shortcutInstructionsBrave', ['<strong>brave://extensions/shortcuts</strong>']);
				break;
			case 'firefox':
				instructions = getMessage('shortcutInstructionsFirefox', ['<strong>about:addons</strong>']);
				break;
			case 'edge':
				instructions = getMessage('shortcutInstructionsEdge', ['<strong>edge://extensions/shortcuts</strong>']);
				break;
			case 'safari':
			case 'mobile-safari':
				instructions = getMessage('shortcutInstructionsSafari');
				break;
			default:
				instructions = getMessage('shortcutInstructionsDefault');
		}
		shortcutInstructionsElement.innerHTML = getMessage('shortcutInstructionsIntro') + ' ' + instructions;
	}
}

async function initializeVersionDisplay(): Promise<void> {
	const manifest = browser.runtime.getManifest();
	const versionNumber = document.getElementById('version-number');
	const updateAvailable = document.getElementById('update-available');
	const usingLatestVersion = document.getElementById('using-latest-version');

	if (versionNumber) {
		versionNumber.textContent = manifest.version;
	}

	// Listen for extension updates
	browser.runtime.onUpdateAvailable.addListener((details) => {
		if (updateAvailable && usingLatestVersion) {
			updateAvailable.style.display = 'block';
			usingLatestVersion.style.display = 'none';
		}
	});
}

export function initializeGeneralSettings(): void {
	loadSettings().then(async () => {
		await setupLanguageAndDirection();

		// Add version check initialization
		await initializeVersionDisplay();

		updateVaultList();
		initializeShowMoreActionsToggle();
		initializeBetaFeaturesToggle();
		initializeLegacyModeToggle();
		initializeSilentOpenToggle();
		initializeVaultInput();
		initializeKeyboardShortcuts();
		initializeToggles();
		setShortcutInstructions();
		initializeAutoSave();
		initializeResetDefaultTemplateButton();
		initializeExportImportAllSettingsButtons();
		initializeHighlighterSettings();
		initializeExportHighlightsButton();
	});
}

function initializeAutoSave(): void {
	const generalSettingsForm = document.getElementById('general-settings-form');
	if (generalSettingsForm) {
		generalSettingsForm.addEventListener('input', debounce(saveSettingsFromForm, 500));
	}
}

function saveSettingsFromForm(): void {
	const showMoreActionsToggle = document.getElementById('show-more-actions-toggle') as HTMLInputElement;
	const betaFeaturesToggle = document.getElementById('beta-features-toggle') as HTMLInputElement;
	const legacyModeToggle = document.getElementById('legacy-mode-toggle') as HTMLInputElement;
	const silentOpenToggle = document.getElementById('silent-open-toggle') as HTMLInputElement;
	const highlighterToggle = document.getElementById('highlighter-toggle') as HTMLInputElement;
	const alwaysShowHighlightsToggle = document.getElementById('highlighter-visibility') as HTMLInputElement;
	const highlightBehaviorSelect = document.getElementById('highlighter-behavior') as HTMLSelectElement;

	const settings = {
		showMoreActionsButton: showMoreActionsToggle?.checked,
		betaFeatures: betaFeaturesToggle?.checked,
		legacyMode: legacyModeToggle?.checked,
		silentOpen: silentOpenToggle?.checked,
		highlighterEnabled: highlighterToggle?.checked,
		alwaysShowHighlights: alwaysShowHighlightsToggle?.checked,
		highlightBehavior: highlightBehaviorSelect?.value
	};

	saveSettings(settings);
}

function initializeShowMoreActionsToggle(): void {
	const showMoreActionsToggle = document.getElementById('show-more-actions-toggle') as HTMLInputElement;
	if (showMoreActionsToggle) {
		showMoreActionsToggle.checked = generalSettings.showMoreActionsButton;
	}
}

function initializeVaultInput(): void {
	const vaultInput = document.getElementById('vault-input') as HTMLInputElement;
	if (vaultInput) {
		vaultInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const newVault = vaultInput.value.trim();
				if (newVault) {
					addVault(newVault);
					vaultInput.value = '';
				}
			}
		});
	}
}

async function initializeKeyboardShortcuts(): Promise<void> {
	const shortcutsList = document.getElementById('keyboard-shortcuts-list');
	if (!shortcutsList) return;

	const browser = await detectBrowser();

	if (browser === 'mobile-safari') {
		// For Safari, display a message about keyboard shortcuts not being available
		const messageItem = document.createElement('div');
		messageItem.className = 'shortcut-item';
		messageItem.textContent = getMessage('shortcutInstructionsSafari');
		shortcutsList.appendChild(messageItem);
	} else {
		// For other browsers, proceed with displaying the shortcuts
		getCommands().then(commands => {
			commands.forEach(command => {
				const shortcutItem = createElementWithClass('div', 'shortcut-item');
				
				const descriptionSpan = document.createElement('span');
				descriptionSpan.textContent = command.description;
				shortcutItem.appendChild(descriptionSpan);

				const hotkeySpan = createElementWithClass('span', 'setting-hotkey');
				hotkeySpan.textContent = command.shortcut || getMessage('shortcutNotSet');
				shortcutItem.appendChild(hotkeySpan);

				shortcutsList.appendChild(shortcutItem);
			});
		});
	}
}

function initializeBetaFeaturesToggle(): void {
	const betaFeaturesToggle = document.getElementById('beta-features-toggle') as HTMLInputElement;
	if (betaFeaturesToggle) {
		betaFeaturesToggle.checked = generalSettings.betaFeatures;
		betaFeaturesToggle.addEventListener('change', () => {
			saveSettings({ betaFeatures: betaFeaturesToggle.checked });
		});
	}
}

function initializeLegacyModeToggle(): void {
	const legacyModeToggle = document.getElementById('legacy-mode-toggle') as HTMLInputElement;
	if (legacyModeToggle) {
		legacyModeToggle.checked = generalSettings.legacyMode;
		legacyModeToggle.addEventListener('change', () => {
			saveSettings({ legacyMode: legacyModeToggle.checked });
		});
	}
}

function initializeSilentOpenToggle(): void {
	const silentOpenToggle = document.getElementById('silent-open-toggle') as HTMLInputElement;
	if (silentOpenToggle) {
		silentOpenToggle.checked = generalSettings.silentOpen;
		silentOpenToggle.addEventListener('change', () => {
			saveSettings({ silentOpen: silentOpenToggle.checked });
		});
	}
}

function initializeResetDefaultTemplateButton(): void {
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn');
	if (resetDefaultTemplateBtn) {
		resetDefaultTemplateBtn.addEventListener('click', resetDefaultTemplate);
	}
}

export function resetDefaultTemplate(): void {
	const defaultTemplate = createDefaultTemplate();
	const currentTemplates = getTemplates();
	const defaultIndex = currentTemplates.findIndex((t: Template) => t.name === getMessage('defaultTemplateName'));
	
	if (defaultIndex !== -1) {
		currentTemplates[defaultIndex] = defaultTemplate;
	} else {
		currentTemplates.unshift(defaultTemplate);
	}

	saveTemplateSettings().then(() => {
		updateTemplateList();
		showTemplateEditor(defaultTemplate);
	}).catch(error => {
		console.error('Failed to reset default template:', error);
		alert(getMessage('failedToResetTemplate'));
	});
}

function initializeExportImportAllSettingsButtons(): void {
	const exportAllSettingsBtn = document.getElementById('export-all-settings-btn');
	if (exportAllSettingsBtn) {
		exportAllSettingsBtn.addEventListener('click', exportAllSettings);
	}

	const importAllSettingsBtn = document.getElementById('import-all-settings-btn');
	if (importAllSettingsBtn) {
		importAllSettingsBtn.addEventListener('click', importAllSettings);
	}
}

function initializeExportHighlightsButton(): void {
	const exportHighlightsBtn = document.getElementById('export-highlights');
	if (exportHighlightsBtn) {
		exportHighlightsBtn.addEventListener('click', exportHighlights);
	}
}

function initializeHighlighterSettings(): void {
	const highlighterToggle = document.getElementById('highlighter-toggle') as HTMLInputElement;
	const alwaysShowHighlightsToggle = document.getElementById('highlighter-visibility') as HTMLInputElement;
	const highlightBehaviorSelect = document.getElementById('highlighter-behavior') as HTMLSelectElement;

	if (highlighterToggle) {
		highlighterToggle.checked = generalSettings.highlighterEnabled;
		highlighterToggle.addEventListener('change', () => {
			saveSettings({ highlighterEnabled: highlighterToggle.checked });
		});
	}

	if (alwaysShowHighlightsToggle) {
		alwaysShowHighlightsToggle.checked = generalSettings.alwaysShowHighlights;
		alwaysShowHighlightsToggle.addEventListener('change', () => {
			saveSettings({ alwaysShowHighlights: alwaysShowHighlightsToggle.checked });
		});
	}

	if (highlightBehaviorSelect) {
		highlightBehaviorSelect.value = generalSettings.highlightBehavior;
		highlightBehaviorSelect.addEventListener('change', () => {
			saveSettings({ highlightBehavior: highlightBehaviorSelect.value });
		});
	}
}
