import { handleDragStart, handleDragOver, handleDrop, handleDragEnd } from '../utils/drag-and-drop';
import { initializeIcons } from '../icons/icons';
import { getCommands } from '../utils/hotkeys';
import { initializeToggles, updateToggleState, initializeSettingToggle } from '../utils/ui-utils';
import { generalSettings, loadSettings, saveSettings, setLocalStorage, getLocalStorage } from '../utils/storage-utils';
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
import { createUsageChart, aggregateUsageData } from '../utils/charts';
import { getClipHistory } from '../utils/storage-utils';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import { showModal, hideModal } from '../utils/modal-utils';
import { logseqClient } from '../utils/logseq-api-client';

dayjs.extend(weekOfYear);

const STORE_URLS = {
	chrome: 'https://chromewebstore.google.com/detail/logseq-cupertino-clipper',
	firefox: 'https://addons.mozilla.org/en-US/firefox/addon/logseq-cupertino-clipper/',
	safari: '#',
	edge: '#'
};

export function updateGraphList(): void {
	const graphList = document.getElementById('graph-list') as HTMLUListElement;
	if (!graphList) return;

	// Clear existing graphs
	graphList.textContent = '';
	generalSettings.graphs.forEach((graph, index) => {
		const li = document.createElement('li');
		li.dataset.index = index.toString();
		li.draggable = true;

		const dragHandle = createElementWithClass('div', 'drag-handle');
		dragHandle.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'grip-vertical' }));
		li.appendChild(dragHandle);

		const span = document.createElement('span');
		span.textContent = graph;
		li.appendChild(span);

		const removeBtn = createElementWithClass('button', 'remove-vault-btn clickable-icon');
		removeBtn.setAttribute('type', 'button');
		removeBtn.setAttribute('aria-label', getMessage('removeGraph'));
		removeBtn.appendChild(createElementWithHTML('i', '', { 'data-lucide': 'trash-2' }));
		li.appendChild(removeBtn);

		li.addEventListener('dragstart', handleDragStart);
		li.addEventListener('dragover', handleDragOver);
		li.addEventListener('drop', handleDrop);
		li.addEventListener('dragend', handleDragEnd);
		removeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			removeGraph(index);
		});
		graphList.appendChild(li);
	});

	initializeIcons(graphList);
}

export function addGraph(graph: string): void {
	generalSettings.graphs.push(graph);
	saveSettings();
	updateGraphList();
}

export function removeGraph(index: number): void {
	generalSettings.graphs.splice(index, 1);
	saveSettings();
	updateGraphList();
}

export async function setShortcutInstructions() {
	const shortcutInstructionsElement = document.querySelector('.shortcut-instructions');
	if (shortcutInstructionsElement) {
		const browser = await detectBrowser();
		// Clear content
		shortcutInstructionsElement.textContent = '';
		shortcutInstructionsElement.appendChild(document.createTextNode(getMessage('shortcutInstructionsIntro') + ' '));

		// Browser-specific instructions
		let instructionsText = '';
		let url = '';

		switch (browser) {
			case 'chrome':
				instructionsText = getMessage('shortcutInstructionsChrome', ['$URL']);
				url = 'chrome://extensions/shortcuts';
				break;
			case 'brave':
				instructionsText = getMessage('shortcutInstructionsBrave', ['$URL']);
				url = 'brave://extensions/shortcuts';
				break;
			case 'firefox':
				instructionsText = getMessage('shortcutInstructionsFirefox', ['$URL']);
				url = 'about:addons';
				break;
			case 'edge':
				instructionsText = getMessage('shortcutInstructionsEdge', ['$URL']);
				url = 'edge://extensions/shortcuts';
				break;
			case 'safari':
			case 'mobile-safari':
				instructionsText = getMessage('shortcutInstructionsSafari');
				break;
			default:
				instructionsText = getMessage('shortcutInstructionsDefault');
		}

		if (url) {
			const parts = instructionsText.split('$URL');
			if (parts.length === 2) {
				shortcutInstructionsElement.appendChild(document.createTextNode(parts[0]));

				const strongElement = document.createElement('strong');
				strongElement.textContent = url;
				shortcutInstructionsElement.appendChild(strongElement);

				shortcutInstructionsElement.appendChild(document.createTextNode(parts[1]));
			} else {
				shortcutInstructionsElement.appendChild(document.createTextNode(instructionsText));
			}
		} else {
			shortcutInstructionsElement.appendChild(document.createTextNode(instructionsText));
		}
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

	const currentBrowser = await detectBrowser();
	if (currentBrowser !== 'safari' && currentBrowser !== 'mobile-safari' && browser.runtime.onUpdateAvailable) {
		browser.runtime.onUpdateAvailable.addListener((details) => {
			if (updateAvailable && usingLatestVersion) {
				updateAvailable.style.display = 'block';
				usingLatestVersion.style.display = 'none';
			}
		});
	} else {
		if (updateAvailable) {
			updateAvailable.style.display = 'none';
		}
		if (usingLatestVersion) {
			usingLatestVersion.style.display = 'none';
		}
	}
}

export function initializeGeneralSettings(): void {
	loadSettings().then(async () => {
		await setupLanguageAndDirection();

		await initializeVersionDisplay();

		const history = await getClipHistory();
		const totalClips = history.length;
		const existingRatings = await getLocalStorage('ratings') || [];

		const rateExtensionSection = document.getElementById('rate-extension');
		if (rateExtensionSection && totalClips >= 20 && existingRatings.length === 0) {
			rateExtensionSection.classList.remove('is-hidden');
		}

		if (totalClips >= 20 && existingRatings.length === 0) {
			const starRating = document.querySelector('.star-rating');
			if (starRating) {
				const stars = starRating.querySelectorAll('.star');
				stars.forEach(star => {
					star.addEventListener('click', async () => {
						const rating = parseInt(star.getAttribute('data-rating') || '0');
						stars.forEach(s => {
							if (parseInt(s.getAttribute('data-rating') || '0') <= rating) {
								s.classList.add('is-active');
							} else {
								s.classList.remove('is-active');
							}
						});
						await handleRating(rating);

						if (rateExtensionSection) {
							rateExtensionSection.style.display = 'none';
						}
					});
				});
			}
		}

		updateGraphList();
		initializeShowMoreActionsToggle();
		initializeBetaFeaturesToggle();
		initializeGraphInput();
		initializeOpenBehaviorDropdown();
		initializeKeyboardShortcuts();
		initializeToggles();
		setShortcutInstructions();
		initializeAutoSave();
		initializeResetDefaultTemplateButton();
		initializeExportImportAllSettingsButtons();
		initializeHighlighterSettings();
		initializeExportHighlightsButton();
		initializeSaveBehaviorDropdown();
		initializeLogseqApiSettings();
		await initializeUsageChart();

		const feedbackModal = document.getElementById('feedback-modal');
		const feedbackCloseBtn = feedbackModal?.querySelector('.feedback-close-btn');
		if (feedbackCloseBtn) {
			feedbackCloseBtn.addEventListener('click', () => hideModal(feedbackModal));
		}
	});
}

function initializeAutoSave(): void {
	const generalSettingsForm = document.getElementById('general-settings-form');
	if (generalSettingsForm) {
		generalSettingsForm.addEventListener('input', debounce(saveSettingsFromForm, 500));
		generalSettingsForm.addEventListener('change', debounce(saveSettingsFromForm, 500));
	}
}

function saveSettingsFromForm(): void {
	const openBehaviorDropdown = document.getElementById('open-behavior-dropdown') as HTMLSelectElement;
	const showMoreActionsToggle = document.getElementById('show-more-actions-toggle') as HTMLInputElement;
	const betaFeaturesToggle = document.getElementById('beta-features-toggle') as HTMLInputElement;
	const highlighterToggle = document.getElementById('highlighter-toggle') as HTMLInputElement;
	const alwaysShowHighlightsToggle = document.getElementById('highlighter-visibility') as HTMLInputElement;
	const highlightBehaviorSelect = document.getElementById('highlighter-behavior') as HTMLSelectElement;

	const updatedSettings = {
		...generalSettings,
		openBehavior: (openBehaviorDropdown?.value as 'popup' | 'embedded') ?? generalSettings.openBehavior,
		showMoreActionsButton: showMoreActionsToggle?.checked ?? generalSettings.showMoreActionsButton,
		betaFeatures: betaFeaturesToggle?.checked ?? generalSettings.betaFeatures,
		highlighterEnabled: highlighterToggle?.checked ?? generalSettings.highlighterEnabled,
		alwaysShowHighlights: alwaysShowHighlightsToggle?.checked ?? generalSettings.alwaysShowHighlights,
		highlightBehavior: highlightBehaviorSelect?.value ?? generalSettings.highlightBehavior
	};

	saveSettings(updatedSettings);
}

function initializeShowMoreActionsToggle(): void {
	initializeSettingToggle('show-more-actions-toggle', generalSettings.showMoreActionsButton, (checked) => {
		saveSettings({ ...generalSettings, showMoreActionsButton: checked });
	});
}

function initializeGraphInput(): void {
	const graphInput = document.getElementById('graph-input') as HTMLInputElement;
	if (graphInput) {
		graphInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const newGraph = graphInput.value.trim();
				if (newGraph) {
					addGraph(newGraph);
					graphInput.value = '';
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
		const messageItem = document.createElement('div');
		messageItem.className = 'shortcut-item';
		messageItem.textContent = getMessage('shortcutInstructionsSafari');
		shortcutsList.appendChild(messageItem);
	} else {
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
	initializeSettingToggle('beta-features-toggle', generalSettings.betaFeatures, (checked) => {
		saveSettings({ ...generalSettings, betaFeatures: checked });
	});
}

function initializeOpenBehaviorDropdown(): void {
	initializeSettingDropdown(
		'open-behavior-dropdown',
		generalSettings.openBehavior,
		(value) => {
			saveSettings({ ...generalSettings, openBehavior: value as 'popup' | 'embedded' });
		}
	);
}

function initializeResetDefaultTemplateButton(): void {
	const resetDefaultTemplateBtn = document.getElementById('reset-default-template-btn');
	if (resetDefaultTemplateBtn) {
		resetDefaultTemplateBtn.addEventListener('click', resetDefaultTemplate);
	}
}

function initializeSaveBehaviorDropdown(): void {
	const dropdown = document.getElementById('save-behavior-dropdown') as HTMLSelectElement;
	if (!dropdown) return;

	dropdown.value = generalSettings.saveBehavior;
	dropdown.addEventListener('change', () => {
		const newValue = dropdown.value as 'addToLogseq' | 'copyToClipboard' | 'saveFile';
		saveSettings({ saveBehavior: newValue });
	});
}

function initializeLogseqApiSettings(): void {
	const tokenInput = document.getElementById('logseq-api-token') as HTMLInputElement;
	const portInput = document.getElementById('logseq-api-port') as HTMLInputElement;
	const testBtn = document.getElementById('test-logseq-connection-btn') as HTMLButtonElement;
	const statusEl = document.getElementById('logseq-connection-status');

	if (tokenInput) {
		tokenInput.value = generalSettings.logseqApiToken || '';
		tokenInput.addEventListener('change', () => {
			saveSettings({ ...generalSettings, logseqApiToken: tokenInput.value });
		});
	}

	if (portInput) {
		portInput.value = String(generalSettings.logseqApiPort || 12315);
		portInput.addEventListener('change', () => {
			const port = parseInt(portInput.value, 10);
			if (port > 0 && port < 65536) {
				saveSettings({ ...generalSettings, logseqApiPort: port });
			}
		});
	}

	if (testBtn && statusEl) {
		testBtn.addEventListener('click', async () => {
			// Save current values before testing
			if (tokenInput) saveSettings({ ...generalSettings, logseqApiToken: tokenInput.value });
			if (portInput) {
				const port = parseInt(portInput.value, 10);
				if (port > 0 && port < 65536) saveSettings({ ...generalSettings, logseqApiPort: port });
			}

			statusEl.textContent = getMessage('testConnection') + '...';
			statusEl.className = 'setting-item-description';

			const available = await logseqClient.isAvailable();
			if (available) {
				const graphName = await logseqClient.getCurrentGraph();
				statusEl.textContent = getMessage('connectionSuccess') || `Connected${graphName ? ' to graph: ' + graphName : ''}`;
				statusEl.style.color = 'var(--color-green)';
			} else {
				statusEl.textContent = getMessage('connectionFailed') || 'Could not connect to LogSeq. Make sure the desktop app is running and HTTP API is enabled.';
				statusEl.style.color = 'var(--color-red)';
			}
		});
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
	initializeSettingToggle('highlighter-toggle', generalSettings.highlighterEnabled, (checked) => {
		saveSettings({ ...generalSettings, highlighterEnabled: checked });
	});

	initializeSettingToggle('highlighter-visibility', generalSettings.alwaysShowHighlights, (checked) => {
		saveSettings({ ...generalSettings, alwaysShowHighlights: checked });
	});

	const highlightBehaviorSelect = document.getElementById('highlighter-behavior') as HTMLSelectElement;
	if (highlightBehaviorSelect) {
		highlightBehaviorSelect.value = generalSettings.highlightBehavior;
		highlightBehaviorSelect.addEventListener('change', () => {
			saveSettings({ ...generalSettings, highlightBehavior: highlightBehaviorSelect.value });
		});
	}
}

async function initializeUsageChart(): Promise<void> {
	const chartContainer = document.getElementById('usage-chart');
	const periodSelect = document.getElementById('usage-period-select') as HTMLSelectElement;
	const aggregationSelect = document.getElementById('usage-aggregation-select') as HTMLSelectElement;
	if (!chartContainer || !periodSelect || !aggregationSelect) return;

	const history = await getClipHistory();

	const updateChart = async () => {
		const options = {
			timeRange: periodSelect.value as '30d' | 'all',
			aggregation: aggregationSelect.value as 'day' | 'week' | 'month'
		};

		const chartData = aggregateUsageData(history, options);
		await createUsageChart(chartContainer, chartData);
	};

	await updateChart();

	periodSelect.addEventListener('change', updateChart);
	aggregationSelect.addEventListener('change', updateChart);
}

async function handleRating(rating: number) {
	const existingRatings = await getLocalStorage('ratings') || [];

	const newRating = {
		rating,
		date: new Date().toISOString()
	};

	const updatedRatings = [...existingRatings, newRating];
	generalSettings.ratings = updatedRatings;

	await setLocalStorage('ratings', updatedRatings);
	await saveSettings();

	if (rating >= 4) {
		const browser = await detectBrowser();
		let storeUrl = STORE_URLS.chrome;

		switch (browser) {
			case 'firefox':
			case 'firefox-mobile':
				storeUrl = STORE_URLS.firefox;
				break;
			case 'safari':
			case 'mobile-safari':
			case 'ipad-os':
				storeUrl = STORE_URLS.safari;
				break;
			case 'edge':
				storeUrl = STORE_URLS.edge;
				break;
		}

		window.open(storeUrl, '_blank');
	} else {
		const modal = document.getElementById('feedback-modal');
		showModal(modal);
	}
}

function initializeSettingDropdown(
	elementId: string,
	defaultValue: string,
	onChange: (newValue: string) => void
): void {
	const dropdown = document.getElementById(elementId) as HTMLSelectElement;
	if (!dropdown) return;
	dropdown.value = defaultValue;
	dropdown.addEventListener('change', () => {
		onChange(dropdown.value);
	});
}
