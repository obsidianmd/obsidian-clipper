import {
	handleDragStart,
	handleDragOver,
	handleDrop,
	handleDragEnd,
} from "../utils/drag-and-drop";
import { initializeIcons } from "../icons/icons";
import { getCommands } from "../utils/hotkeys";
import {
	initializeToggles,
	updateToggleState,
	initializeSettingToggle,
} from "../utils/ui-utils";
import {
	generalSettings,
	loadSettings,
	saveSettings,
	setLocalStorage,
	getLocalStorage,
} from "../utils/storage-utils";
import { detectBrowser } from "../utils/browser-detection";
import {
	createElementWithClass,
	createElementWithHTML,
} from "../utils/dom-utils";
import {
	createDefaultTemplate,
	getTemplates,
	saveTemplateSettings,
} from "../managers/template-manager";
import {
	updateTemplateList,
	showTemplateEditor,
} from "../managers/template-ui";
import { exportAllSettings, importAllSettings } from "../utils/import-export";
import { Settings, Template } from "../types/types";
import { exportHighlights } from "./highlights-manager";
import { getMessage, setupLanguageAndDirection } from "../utils/i18n";
import { debounce } from "../utils/debounce";
import browser from "../utils/browser-polyfill";
import { createUsageChart, aggregateUsageData } from "../utils/charts";
import { getClipHistory } from "../utils/storage-utils";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { showModal, hideModal } from "../utils/modal-utils";
import {
	fetchAppflowyWorkspaces,
	fetchAppflowySpaces,
	fetchAppflowyUserEmail,
} from "../utils/appflowy-note-creator";

dayjs.extend(weekOfYear);

const STORE_URLS = {
	chrome: "https://chromewebstore.google.com/detail/ngjmhmikhoegpfakpfofaafagoikejln",
	firefox:
		"https://addons.mozilla.org/en-US/firefox/addon/clipper-for-appflowy/",
	safari: "https://github.com/alexrosepizant/clipper-for-appflowy/releases",
	edge: "https://chromewebstore.google.com/detail/ngjmhmikhoegpfakpfofaafagoikejln",
};

export function updateVaultList(): void {
	const vaultList = document.getElementById("vault-list") as HTMLUListElement;
	if (!vaultList) return;

	// Clear existing vaults
	vaultList.textContent = "";
	generalSettings.vaults.forEach((vault, index) => {
		const li = document.createElement("li");
		li.dataset.index = index.toString();
		li.draggable = true;

		const dragHandle = createElementWithClass("div", "drag-handle");
		dragHandle.appendChild(
			createElementWithHTML("i", "", { "data-lucide": "grip-vertical" })
		);
		li.appendChild(dragHandle);

		const span = document.createElement("span");
		span.textContent = vault;
		li.appendChild(span);

		const removeBtn = createElementWithClass(
			"button",
			"setting-item-list-remove clickable-icon"
		);
		removeBtn.setAttribute("type", "button");
		removeBtn.setAttribute("aria-label", getMessage("removeVault"));
		removeBtn.appendChild(
			createElementWithHTML("i", "", { "data-lucide": "trash-2" })
		);
		li.appendChild(removeBtn);

		li.addEventListener("dragstart", handleDragStart);
		li.addEventListener("dragover", handleDragOver);
		li.addEventListener("drop", handleDrop);
		li.addEventListener("dragend", handleDragEnd);
		removeBtn.addEventListener("click", (e) => {
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
	const shortcutInstructionsElement = document.querySelector(
		".shortcut-instructions"
	);
	if (shortcutInstructionsElement) {
		const browser = await detectBrowser();
		// Clear content
		shortcutInstructionsElement.textContent = "";
		shortcutInstructionsElement.appendChild(
			document.createTextNode(
				getMessage("shortcutInstructionsIntro") + " "
			)
		);

		// Browser-specific instructions
		let instructionsText = "";
		let url = "";

		switch (browser) {
			case "chrome":
				instructionsText = getMessage("shortcutInstructionsChrome", [
					"$URL",
				]);
				url = "chrome://extensions/shortcuts";
				break;
			case "brave":
				instructionsText = getMessage("shortcutInstructionsBrave", [
					"$URL",
				]);
				url = "brave://extensions/shortcuts";
				break;
			case "firefox":
				instructionsText = getMessage("shortcutInstructionsFirefox", [
					"$URL",
				]);
				url = "about:addons";
				break;
			case "edge":
				instructionsText = getMessage("shortcutInstructionsEdge", [
					"$URL",
				]);
				url = "edge://extensions/shortcuts";
				break;
			case "safari":
			case "mobile-safari":
				instructionsText = getMessage("shortcutInstructionsSafari");
				break;
			default:
				instructionsText = getMessage("shortcutInstructionsDefault");
		}

		if (url) {
			// Split text around the URL placeholder and add strong element
			const parts = instructionsText.split("$URL");
			if (parts.length === 2) {
				shortcutInstructionsElement.appendChild(
					document.createTextNode(parts[0])
				);

				const strongElement = document.createElement("strong");
				strongElement.textContent = url;
				shortcutInstructionsElement.appendChild(strongElement);

				shortcutInstructionsElement.appendChild(
					document.createTextNode(parts[1])
				);
			} else {
				// Fallback if no placeholder found
				shortcutInstructionsElement.appendChild(
					document.createTextNode(instructionsText)
				);
			}
		} else {
			// Safari and default cases (no URL needed)
			shortcutInstructionsElement.appendChild(
				document.createTextNode(instructionsText)
			);
		}
	}
}

async function initializeVersionDisplay(): Promise<void> {
	const manifest = browser.runtime.getManifest();
	const versionNumber = document.getElementById("version-number");
	const updateAvailable = document.getElementById("update-available");
	const usingLatestVersion = document.getElementById("using-latest-version");

	if (versionNumber) {
		versionNumber.textContent = manifest.version;
	}

	// Only add update listener for browsers that support it
	const currentBrowser = await detectBrowser();
	if (
		currentBrowser !== "safari" &&
		currentBrowser !== "mobile-safari" &&
		browser.runtime.onUpdateAvailable
	) {
		browser.runtime.onUpdateAvailable.addListener((details) => {
			if (updateAvailable && usingLatestVersion) {
				updateAvailable.style.display = "block";
				usingLatestVersion.style.display = "none";
			}
		});
	} else {
		// For Safari, just hide the update status elements
		if (updateAvailable) {
			updateAvailable.style.display = "none";
		}
		if (usingLatestVersion) {
			usingLatestVersion.style.display = "none";
		}
	}
}

export function initializeGeneralSettings(): void {
	console.log("[AppFlowy] initializeGeneralSettings start");
	loadSettings()
		.then(async () => {
			console.log(
				"[AppFlowy] loadSettings done, calling initializeAppflowySettings soon"
			);
			await setupLanguageAndDirection();

			// Add version check initialization
			await initializeVersionDisplay();

			// Get clip history and ratings
			const history = await getClipHistory();
			const totalClips = history.length;
			const existingRatings = (await getLocalStorage("ratings")) || [];

			// Show rating section only total clips >= 20 and no previous ratings
			const rateExtensionSection =
				document.getElementById("rate-extension");
			if (
				rateExtensionSection &&
				totalClips >= 20 &&
				existingRatings.length === 0
			) {
				rateExtensionSection.classList.remove("is-hidden");
			}

			if (totalClips >= 20 && existingRatings.length === 0) {
				const starRating = document.querySelector(".star-rating");
				if (starRating) {
					const stars = starRating.querySelectorAll(".star");
					stars.forEach((star) => {
						star.addEventListener("click", async () => {
							const rating = parseInt(
								star.getAttribute("data-rating") || "0"
							);
							stars.forEach((s) => {
								if (
									parseInt(
										s.getAttribute("data-rating") || "0"
									) <= rating
								) {
									s.classList.add("is-active");
								} else {
									s.classList.remove("is-active");
								}
							});
							await handleRating(rating);

							// Hide the rating section after rating
							if (rateExtensionSection) {
								rateExtensionSection.style.display = "none";
							}
						});
					});
				}
			}

			updateVaultList();
			initializeShowMoreActionsToggle();
			initializeBetaFeaturesToggle();
			initializeLegacyModeToggle();
			initializeSilentOpenToggle();
			initializeVaultInput();
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
			initializeAppflowySettings();
			await initializeUsageChart();

			// Initialize feedback modal close button
			const feedbackModal = document.getElementById("feedback-modal");
			const feedbackCloseBtn = feedbackModal?.querySelector(
				".feedback-close-btn"
			);
			if (feedbackCloseBtn) {
				feedbackCloseBtn.addEventListener("click", () =>
					hideModal(feedbackModal)
				);
			}
		})
		.catch((err) => {
			console.error("[AppFlowy] initializeGeneralSettings error:", err);
		});
}

function initializeAutoSave(): void {
	const generalSettingsForm = document.getElementById(
		"general-settings-form"
	);
	if (generalSettingsForm) {
		// Listen for both input and change events
		generalSettingsForm.addEventListener(
			"input",
			debounce(saveSettingsFromForm, 500)
		);
		generalSettingsForm.addEventListener(
			"change",
			debounce(saveSettingsFromForm, 500)
		);
	}
}

function saveSettingsFromForm(): void {
	const openBehaviorDropdown = document.getElementById(
		"open-behavior-dropdown"
	) as HTMLSelectElement;
	const showMoreActionsToggle = document.getElementById(
		"show-more-actions-toggle"
	) as HTMLInputElement;
	const betaFeaturesToggle = document.getElementById(
		"beta-features-toggle"
	) as HTMLInputElement;
	const legacyModeToggle = document.getElementById(
		"legacy-mode-toggle"
	) as HTMLInputElement;
	const silentOpenToggle = document.getElementById(
		"silent-open-toggle"
	) as HTMLInputElement;
	const highlighterToggle = document.getElementById(
		"highlighter-toggle"
	) as HTMLInputElement;
	const alwaysShowHighlightsToggle = document.getElementById(
		"highlighter-visibility"
	) as HTMLInputElement;
	const highlightBehaviorSelect = document.getElementById(
		"highlighter-behavior"
	) as HTMLSelectElement;

	const appflowyServerUrlInput = document.getElementById(
		"appflowy-server-url"
	) as HTMLInputElement;
	const appflowyApiTokenInput = document.getElementById(
		"appflowy-api-token"
	) as HTMLInputElement;
	const appflowyWorkspaceIdInput = document.getElementById(
		"appflowy-workspace-id"
	) as HTMLInputElement;
	const appflowyParentViewIdInput = document.getElementById(
		"appflowy-parent-view-id"
	) as HTMLInputElement;

	const updatedSettings = {
		...generalSettings, // Keep existing settings
		openBehavior:
			(openBehaviorDropdown?.value as Settings["openBehavior"]) ??
			generalSettings.openBehavior,
		showMoreActionsButton:
			showMoreActionsToggle?.checked ??
			generalSettings.showMoreActionsButton,
		betaFeatures:
			betaFeaturesToggle?.checked ?? generalSettings.betaFeatures,
		legacyMode: legacyModeToggle?.checked ?? generalSettings.legacyMode,
		silentOpen: silentOpenToggle?.checked ?? generalSettings.silentOpen,
		highlighterEnabled:
			highlighterToggle?.checked ?? generalSettings.highlighterEnabled,
		alwaysShowHighlights:
			alwaysShowHighlightsToggle?.checked ??
			generalSettings.alwaysShowHighlights,
		highlightBehavior:
			highlightBehaviorSelect?.value ?? generalSettings.highlightBehavior,
		appflowyConfig: {
			serverUrl:
				appflowyServerUrlInput?.value ||
				generalSettings.appflowyConfig.serverUrl,
			apiToken:
				appflowyApiTokenInput?.value ||
				generalSettings.appflowyConfig.apiToken,
			workspaceId:
				appflowyWorkspaceIdInput?.value ||
				generalSettings.appflowyConfig.workspaceId,
			parentViewId:
				appflowyParentViewIdInput?.value ||
				generalSettings.appflowyConfig.parentViewId,
		},
	};

	saveSettings(updatedSettings);
}

function initializeShowMoreActionsToggle(): void {
	initializeSettingToggle(
		"show-more-actions-toggle",
		generalSettings.showMoreActionsButton,
		(checked) => {
			saveSettings({
				...generalSettings,
				showMoreActionsButton: checked,
			});
		}
	);
}

function initializeVaultInput(): void {
	const vaultInput = document.getElementById(
		"vault-input"
	) as HTMLInputElement;
	if (vaultInput) {
		vaultInput.addEventListener("keypress", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				const newVault = vaultInput.value.trim();
				if (newVault) {
					addVault(newVault);
					vaultInput.value = "";
				}
			}
		});
	}
}

async function initializeKeyboardShortcuts(): Promise<void> {
	const shortcutsList = document.getElementById("keyboard-shortcuts-list");
	if (!shortcutsList) return;

	const browser = await detectBrowser();

	if (browser === "mobile-safari") {
		// For Safari, display a message about keyboard shortcuts not being available
		const messageItem = document.createElement("div");
		messageItem.className = "shortcut-item";
		messageItem.textContent = getMessage("shortcutInstructionsSafari");
		shortcutsList.appendChild(messageItem);
	} else {
		// For other browsers, proceed with displaying the shortcuts
		getCommands().then((commands) => {
			commands.forEach((command) => {
				const shortcutItem = createElementWithClass(
					"div",
					"shortcut-item"
				);

				const descriptionSpan = document.createElement("span");
				descriptionSpan.textContent = command.description;
				shortcutItem.appendChild(descriptionSpan);

				const hotkeySpan = createElementWithClass(
					"span",
					"setting-hotkey"
				);
				hotkeySpan.textContent =
					command.shortcut || getMessage("shortcutNotSet");
				shortcutItem.appendChild(hotkeySpan);

				shortcutsList.appendChild(shortcutItem);
			});
		});
	}
}

function initializeBetaFeaturesToggle(): void {
	initializeSettingToggle(
		"beta-features-toggle",
		generalSettings.betaFeatures,
		(checked) => {
			saveSettings({ ...generalSettings, betaFeatures: checked });
		}
	);
}

function initializeLegacyModeToggle(): void {
	initializeSettingToggle(
		"legacy-mode-toggle",
		generalSettings.legacyMode,
		(checked) => {
			saveSettings({ ...generalSettings, legacyMode: checked });
		}
	);
}

function initializeSilentOpenToggle(): void {
	initializeSettingToggle(
		"silent-open-toggle",
		generalSettings.silentOpen,
		(checked) => {
			saveSettings({ ...generalSettings, silentOpen: checked });
		}
	);
}

function initializeOpenBehaviorDropdown(): void {
	initializeSettingDropdown(
		"open-behavior-dropdown",
		generalSettings.openBehavior,
		(value) => {
			saveSettings({
				...generalSettings,
				openBehavior: value as Settings["openBehavior"],
			});
		}
	);
}

function initializeResetDefaultTemplateButton(): void {
	const resetDefaultTemplateBtn = document.getElementById(
		"reset-default-template-btn"
	);
	if (resetDefaultTemplateBtn) {
		resetDefaultTemplateBtn.addEventListener("click", resetDefaultTemplate);
	}
}

function initializeSaveBehaviorDropdown(): void {
	const dropdown = document.getElementById(
		"save-behavior-dropdown"
	) as HTMLSelectElement;
	if (!dropdown) return;

	dropdown.value = generalSettings.saveBehavior;
	dropdown.addEventListener("change", () => {
		const newValue = dropdown.value as
			| "addToAppFlowy"
			| "copyToClipboard"
			| "saveFile";
		saveSettings({ saveBehavior: newValue });
	});
}

function initializeAppflowySettings(): void {
	const serverUrlInput = document.getElementById(
		"appflowy-server-url"
	) as HTMLInputElement;
	const apiTokenInput = document.getElementById(
		"appflowy-api-token"
	) as HTMLInputElement;
	const workspaceIdInput = document.getElementById(
		"appflowy-workspace-id"
	) as HTMLInputElement;
	const spaceSelect = document.getElementById(
		"appflowy-space-select"
	) as HTMLSelectElement;
	const sendOtpBtn = document.getElementById(
		"appflowy-send-otp-btn"
	) as HTMLButtonElement;
	const emailInput = document.getElementById(
		"appflowy-email-input"
	) as HTMLInputElement;
	const otpRow = document.getElementById(
		"appflowy-otp-row"
	) as HTMLDivElement;
	const otpCodeInput = document.getElementById(
		"appflowy-otp-code"
	) as HTMLInputElement;
	const verifyOtpBtn = document.getElementById(
		"appflowy-verify-otp-btn"
	) as HTMLButtonElement;
	const fetchBtn = document.getElementById(
		"appflowy-fetch-workspaces-btn"
	) as HTMLButtonElement;
	const connectedRow = document.getElementById(
		"appflowy-connected-row"
	) as HTMLDivElement;
	const connectedEmailEl = document.getElementById(
		"appflowy-connected-email"
	) as HTMLDivElement;
	const disconnectBtn = document.getElementById(
		"appflowy-disconnect-btn"
	) as HTMLButtonElement;

	// The sign-in items to show/hide based on connected state
	const signInItem = emailInput?.closest(
		".setting-item"
	) as HTMLElement | null;

	const showConnectedState = (email: string) => {
		if (signInItem) signInItem.style.display = "none";
		if (otpRow) otpRow.style.display = "none";
		if (connectedEmailEl) connectedEmailEl.textContent = email;
		if (connectedRow) connectedRow.style.display = "";
	};

	const showSignInState = () => {
		if (connectedRow) connectedRow.style.display = "none";
		if (signInItem) signInItem.style.display = "";
		if (otpRow) otpRow.style.display = "none";
		if (emailInput) emailInput.value = "";
	};

	if (serverUrlInput)
		serverUrlInput.value = generalSettings.appflowyConfig.serverUrl;
	if (apiTokenInput)
		apiTokenInput.value = generalSettings.appflowyConfig.apiToken;
	if (workspaceIdInput)
		workspaceIdInput.value = generalSettings.appflowyConfig.workspaceId;

	// Show connected state on load if already authenticated
	if (generalSettings.appflowyConfig.apiToken) {
		const email = generalSettings.appflowyConfig.userEmail || "";
		if (email) {
			showConnectedState(email);
		} else {
			// Email missing (e.g. migrated from older version) — fetch from API
			const serverUrl = (
				generalSettings.appflowyConfig.serverUrl ||
				"https://beta.appflowy.cloud"
			).replace(/\/$/, "");
			showConnectedState("");
			fetchAppflowyUserEmail(
				serverUrl,
				generalSettings.appflowyConfig.apiToken
			).then(async (fetchedEmail) => {
				if (fetchedEmail) {
					generalSettings.appflowyConfig.userEmail = fetchedEmail;
					await saveAppflowyConfigNow();
					showConnectedState(fetchedEmail);
				}
			});
		}
	}

	// "Send OTP code" button — sends a 6-digit sign-in code to the user's email via GoTrue
	if (sendOtpBtn) {
		sendOtpBtn.addEventListener("click", async () => {
			const email = emailInput?.value?.trim();
			const serverUrl = (
				serverUrlInput?.value || "https://beta.appflowy.cloud"
			).replace(/\/$/, "");

			if (!email) {
				alert("Please enter your AppFlowy account email address.");
				return;
			}

			const originalText = sendOtpBtn.textContent || "";
			sendOtpBtn.disabled = true;
			sendOtpBtn.textContent = "Sending…";

			try {
				const resp = await fetch(`${serverUrl}/gotrue/otp`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email, create_user: false }),
				});

				if (!resp.ok) {
					const text = await resp.text();
					throw new Error(`Server returned ${resp.status}: ${text}`);
				}

				// Show the verification code row
				if (otpRow) otpRow.style.display = "";
				sendOtpBtn.textContent = "Resend code";
				otpCodeInput?.focus();
			} catch (err) {
				console.error("[AppFlowy] Send OTP error:", err);
				alert(
					"Failed to send code: " +
						(err instanceof Error ? err.message : String(err))
				);
				sendOtpBtn.textContent = originalText;
			} finally {
				sendOtpBtn.disabled = false;
			}
		});
	}

	// "Verify & connect" button — verifies the OTP code and saves the token
	if (verifyOtpBtn) {
		verifyOtpBtn.addEventListener("click", async () => {
			const email = emailInput?.value?.trim();
			const code = otpCodeInput?.value?.trim();
			const serverUrl = (
				serverUrlInput?.value || "https://beta.appflowy.cloud"
			).replace(/\/$/, "");

			if (!email || !code) {
				alert("Please enter your email and the 6-digit code.");
				return;
			}

			const originalText = verifyOtpBtn.textContent || "";
			verifyOtpBtn.disabled = true;
			verifyOtpBtn.textContent = "Verifying…";

			try {
				// Step 1: Verify OTP with GoTrue
				const resp = await fetch(`${serverUrl}/gotrue/verify`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						email,
						token: code,
						type: "magiclink",
					}),
				});

				if (!resp.ok) {
					const text = await resp.text();
					throw new Error(`Invalid code (${resp.status}): ${text}`);
				}

				const tokenData = (await resp.json()) as {
					access_token?: string;
					refresh_token?: string;
				};
				const accessToken = tokenData.access_token;
				if (!accessToken)
					throw new Error("No access token in response");

				// Step 2: Register session with AppFlowy backend
				await fetch(`${serverUrl}/api/user/verify/${accessToken}`, {
					method: "GET",
				}).catch(() => {
					/* best-effort */
				});

				// Step 3: Fill the token field with the access token
				if (apiTokenInput) apiTokenInput.value = accessToken;

				// Step 4: Auto-fetch workspaces
				try {
					const workspaces = await fetchAppflowyWorkspaces(
						serverUrl,
						accessToken
					);
					if (workspaces.length > 0 && workspaceIdInput) {
						workspaceIdInput.value = workspaces[0].workspace_id;
					}
				} catch (e) {
					console.warn(
						"[AppFlowy] Could not auto-fetch workspace:",
						e
					);
				}

				// Store email in config before saving
				generalSettings.appflowyConfig.userEmail = email;
				await saveAppflowyConfigNow();
				verifyOtpBtn.textContent = "✓ Connected!";
				if (otpRow) otpRow.style.display = "none";
				if (otpCodeInput) otpCodeInput.value = "";
				showConnectedState(email);
				setTimeout(() => {
					verifyOtpBtn.textContent = originalText;
				}, 3000);
			} catch (err) {
				console.error("[AppFlowy] Verify OTP error:", err);
				alert(
					"Verification failed: " +
						(err instanceof Error ? err.message : String(err))
				);
				verifyOtpBtn.textContent = originalText;
			} finally {
				verifyOtpBtn.disabled = false;
			}
		});
	}

	const saveAppflowyConfigNow = async () => {
		const values = {
			serverUrl:
				serverUrlInput?.value ||
				generalSettings.appflowyConfig.serverUrl,
			apiToken:
				apiTokenInput?.value || generalSettings.appflowyConfig.apiToken,
			workspaceId:
				workspaceIdInput?.value ||
				generalSettings.appflowyConfig.workspaceId,
			parentViewId: generalSettings.appflowyConfig.parentViewId,
			userEmail: generalSettings.appflowyConfig.userEmail,
		};
		try {
			await browser.storage.sync.set({ appflowy_config: values });
			// Also update generalSettings so saveSettings() calls from other code stay in sync
			generalSettings.appflowyConfig = values;
		} catch (err) {
			console.error("[AppFlowy] Storage write FAILED:", err);
		}
	};

	if (disconnectBtn) {
		disconnectBtn.addEventListener("click", async () => {
			generalSettings.appflowyConfig = {
				...generalSettings.appflowyConfig,
				apiToken: "",
				userEmail: "",
			};
			if (apiTokenInput) apiTokenInput.value = "";
			await saveAppflowyConfigNow();
			showSignInState();
		});
	}

	const saveAppflowyConfig = debounce(saveAppflowyConfigNow, 500);

	[serverUrlInput, apiTokenInput].forEach((input) => {
		if (input) {
			input.addEventListener("input", saveAppflowyConfig);
			input.addEventListener("blur", saveAppflowyConfigNow);
		}
	});
	if (workspaceIdInput) {
		workspaceIdInput.addEventListener("input", saveAppflowyConfig);
		workspaceIdInput.addEventListener("blur", saveAppflowyConfigNow);
	}

	if (fetchBtn) {
		fetchBtn.addEventListener("click", async () => {
			const serverUrl = serverUrlInput?.value?.trim();
			const apiToken = apiTokenInput?.value?.trim();
			if (!serverUrl || !apiToken) {
				alert(getMessage("appflowyMissingCredentials"));
				return;
			}
			fetchBtn.disabled = true;
			fetchBtn.textContent = "...";
			try {
				const workspaces = await fetchAppflowyWorkspaces(
					serverUrl,
					apiToken
				);
				if (workspaces.length === 0) {
					alert(getMessage("appflowyNoWorkspaces"));
				} else if (workspaces.length === 1) {
					if (workspaceIdInput)
						workspaceIdInput.value = workspaces[0].workspace_id;
					await saveAppflowyConfigNow();
					alert(
						`Workspace: ${workspaces[0].workspace_name} (${workspaces[0].workspace_id})`
					);
				} else {
					// Multiple workspaces - show list and let user copy the ID
					const list = workspaces
						.map((w) => `${w.workspace_name}: ${w.workspace_id}`)
						.join("\n");
					const selected = prompt(
						getMessage("appflowySelectWorkspace") + "\n\n" + list
					);
					if (selected && workspaceIdInput) {
						workspaceIdInput.value = selected.trim();
						await saveAppflowyConfigNow();
					}
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err);
				alert(getMessage("appflowyFetchError") + "\n" + message);
			} finally {
				fetchBtn.disabled = false;
				fetchBtn.textContent = getMessage("appflowyFetchWorkspaces");
			}
		});
	}
}

export function resetDefaultTemplate(): void {
	const defaultTemplate = createDefaultTemplate();
	const currentTemplates = getTemplates();
	const defaultIndex = currentTemplates.findIndex(
		(t: Template) => t.name === getMessage("defaultTemplateName")
	);

	if (defaultIndex !== -1) {
		currentTemplates[defaultIndex] = defaultTemplate;
	} else {
		currentTemplates.unshift(defaultTemplate);
	}

	saveTemplateSettings()
		.then(() => {
			updateTemplateList();
			showTemplateEditor(defaultTemplate);
		})
		.catch((error) => {
			console.error("Failed to reset default template:", error);
			alert(getMessage("failedToResetTemplate"));
		});
}

function initializeExportImportAllSettingsButtons(): void {
	const exportAllSettingsBtn = document.getElementById(
		"export-all-settings-btn"
	);
	if (exportAllSettingsBtn) {
		exportAllSettingsBtn.addEventListener("click", exportAllSettings);
	}

	const importAllSettingsBtn = document.getElementById(
		"import-all-settings-btn"
	);
	if (importAllSettingsBtn) {
		importAllSettingsBtn.addEventListener("click", importAllSettings);
	}
}

function initializeExportHighlightsButton(): void {
	const exportHighlightsBtn = document.getElementById("export-highlights");
	if (exportHighlightsBtn) {
		exportHighlightsBtn.addEventListener("click", exportHighlights);
	}
}

function initializeHighlighterSettings(): void {
	initializeSettingToggle(
		"highlighter-toggle",
		generalSettings.highlighterEnabled,
		(checked) => {
			saveSettings({ ...generalSettings, highlighterEnabled: checked });
		}
	);

	initializeSettingToggle(
		"highlighter-visibility",
		generalSettings.alwaysShowHighlights,
		(checked) => {
			saveSettings({ ...generalSettings, alwaysShowHighlights: checked });
		}
	);

	const highlightBehaviorSelect = document.getElementById(
		"highlighter-behavior"
	) as HTMLSelectElement;
	if (highlightBehaviorSelect) {
		highlightBehaviorSelect.value = generalSettings.highlightBehavior;
		highlightBehaviorSelect.addEventListener("change", () => {
			saveSettings({
				...generalSettings,
				highlightBehavior: highlightBehaviorSelect.value,
			});
		});
	}
}

async function initializeUsageChart(): Promise<void> {
	const chartContainer = document.getElementById("usage-chart");
	const periodSelect = document.getElementById(
		"usage-period-select"
	) as HTMLSelectElement;
	const aggregationSelect = document.getElementById(
		"usage-aggregation-select"
	) as HTMLSelectElement;
	if (!chartContainer || !periodSelect || !aggregationSelect) return;

	const history = await getClipHistory();

	const updateChart = async () => {
		const options = {
			timeRange: periodSelect.value as "30d" | "all",
			aggregation: aggregationSelect.value as "day" | "week" | "month",
		};

		const chartData = aggregateUsageData(history, options);
		await createUsageChart(chartContainer, chartData);
	};

	// Initialize with default selections
	await updateChart();

	// Update when any selector changes
	periodSelect.addEventListener("change", updateChart);
	aggregationSelect.addEventListener("change", updateChart);
}

async function handleRating(rating: number) {
	// Get existing ratings from storage
	const existingRatings = (await getLocalStorage("ratings")) || [];

	// Add new rating
	const newRating = {
		rating,
		date: new Date().toISOString(),
	};

	// Update both storage and generalSettings
	const updatedRatings = [...existingRatings, newRating];
	generalSettings.ratings = updatedRatings;

	// Save to storage
	await setLocalStorage("ratings", updatedRatings);
	await saveSettings();

	if (rating >= 4) {
		// Redirect to appropriate store
		const browser = await detectBrowser();
		let storeUrl = STORE_URLS.chrome; // Default to Chrome store

		switch (browser) {
			case "firefox":
			case "firefox-mobile":
				storeUrl = STORE_URLS.firefox;
				break;
			case "safari":
			case "mobile-safari":
			case "ipad-os":
				storeUrl = STORE_URLS.safari;
				break;
			case "edge":
				storeUrl = STORE_URLS.edge;
				break;
		}

		window.open(storeUrl, "_blank");
	} else {
		// Show feedback modal for ratings < 4
		const modal = document.getElementById("feedback-modal");
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
	dropdown.addEventListener("change", () => {
		onChange(dropdown.value);
	});
}
