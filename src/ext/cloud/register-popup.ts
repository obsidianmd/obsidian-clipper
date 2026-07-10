/**
 * Popup-side registration for the cloud storage plugin.
 *
 * The original `src/core/popup.ts` had a `handleSaveToCloud()` function and
 * added a "Save to cloud" entry to the secondary-actions menu. After the
 * cloud modularization, popup.ts no longer knows about cloud. This plugin
 * re-adds the "Save to cloud" secondary action by observing the
 * secondary-actions container and injecting a menu item whenever the popup
 * repopulates it. The click handler reads field values from the DOM and
 * calls `executeRemoteUpload()` from the cloud upload dispatcher.
 *
 * This is intentionally less invasive than modifying `determineMainAction`:
 * the main clip button keeps its original behavior, and "Save to cloud"
 * always appears as a secondary action regardless of `saveBehavior`.
 */

import { Cloud } from 'lucide';
import { icons, initializeIcons } from '../../icons/icons';
import { generateFrontmatter } from '../../utils/obsidian-note-creator';
import { incrementStat } from '../../utils/storage-utils';
import { executeRemoteUpload } from './upload';
import { t } from './cloud-i18n';

let initialized = false;
let observer: MutationObserver | null = null;

const CLOUD_ACTION_ID = 'saveToCloud';
const CLOUD_MENU_ITEM_CLASS = 'cloud-secondary-action';

/**
 * The popup determines side-panel mode via the URL pathname. We replicate
 * that check so we don't close the side panel after a successful save.
 */
function isSidePanel(): boolean {
	try {
		return window.location.pathname.includes('side-panel.html');
	} catch {
		return false;
	}
}

/**
 * Register the Cloud lucide icon into the shared `icons` object without
 * modifying `icons.ts`. Idempotent.
 */
function registerCloudIcon(): void {
	if (!(icons as any).Cloud) {
		(icons as any).Cloud = Cloud;
	}
}

/**
 * Read property inputs from the DOM, mirroring `getPropertiesFromDOM()` in
 * `src/core/popup.ts`. The plugin cannot import that private function, so
 * we re-implement the small DOM read here.
 */
function getPropertiesFromDOM(): { id: string; name: string; value: string | boolean }[] {
	return Array.from(document.querySelectorAll('.metadata-property input')).map(input => {
		const inputElement = input as HTMLInputElement;
		return {
			id: inputElement.dataset.id || Date.now().toString() + Math.random().toString(36).slice(2, 11),
			name: inputElement.id,
			value: inputElement.type === 'checkbox' ? inputElement.checked : inputElement.value
		};
	});
}

/**
 * Translate an error string returned by `executeRemoteUpload`. The error can
 * be either a cloud i18n key (e.g. `cloudNoActiveTarget`) or a raw error
 * message from a thrown exception. We try the cloud translation table first
 * and fall back to the raw string.
 */
function translateCloudError(error: string | undefined): string {
	if (!error) return t('cloudSaveFailed');
	const translated = t(error);
	// t() returns the key unchanged when no translation is found, so if the
	// "translated" value differs from the input, we got a real translation.
	return translated === error ? error : translated;
}

/**
 * Build and execute the cloud upload from the current popup DOM state.
 * Mirrors the original `handleSaveToCloud()` in `src/core/popup.ts`.
 */
export function getCloudActionLabel(): string {
	return t(CLOUD_ACTION_ID);
}

export async function handleSaveToCloud(): Promise<void> {
	const noteContentField = document.getElementById('note-content-field') as HTMLTextAreaElement | null;
	if (!noteContentField) return;

	const noteNameField = document.getElementById('note-name-field') as HTMLTextAreaElement | null;
	const pathField = document.getElementById('path-name-field') as HTMLInputElement | null;

	try {
		const properties = getPropertiesFromDOM();
		const frontmatter = await generateFrontmatter(properties as any);
		const content = frontmatter + noteContentField.value;
		const title = noteNameField?.value || 'Untitled';
		const path = pathField?.value || '';

		const result = await executeRemoteUpload({
			template: {
				// The plugin does not have access to currentTemplate, so we
				// default to 'create' and pass the DOM path. Adapters fall
				// back to 'create' for unknown behaviors anyway.
				behavior: 'create',
				path
			},
			title,
			content
		});

		if (result.success) {
			try {
				await incrementStat('cloud' as any);
			} catch (statError) {
				console.warn('Cloud: failed to increment cloud stat', statError);
			}

			// Change the main button text temporarily to give feedback.
			const clipButton = document.getElementById('clip-btn');
			if (clipButton) {
				const originalText = clipButton.textContent || '';
				clipButton.textContent = t('cloudSaveSuccess');

				setTimeout(() => {
					clipButton.textContent = originalText;
				}, 1500);
			}

			if (!isSidePanel()) {
				setTimeout(() => window.close(), 500);
			}
		} else {
			alert(translateCloudError(result.error));
		}
	} catch (error) {
		console.error('Cloud save error:', error);
		alert(t('cloudSaveFailed'));
	}
}

/**
 * Build the "Save to cloud" menu item. Mirrors the structure produced by
 * `addSecondaryAction()` in `src/core/popup.ts` so it visually matches the
 * other secondary actions.
 */
function createCloudMenuItem(): HTMLElement {
	const menuItem = document.createElement('div');
	menuItem.className = `menu-item ${CLOUD_MENU_ITEM_CLASS}`;
	menuItem.dataset.action = CLOUD_ACTION_ID;

	const menuItemIcon = document.createElement('div');
	menuItemIcon.className = 'menu-item-icon';
	const iconElement = document.createElement('i');
	iconElement.setAttribute('data-lucide', 'cloud');
	menuItemIcon.appendChild(iconElement);

	const menuItemTitle = document.createElement('div');
	menuItemTitle.className = 'menu-item-title';
	menuItemTitle.textContent = t(CLOUD_ACTION_ID);

	menuItem.appendChild(menuItemIcon);
	menuItem.appendChild(menuItemTitle);

	menuItem.addEventListener('click', () => {
		// Close the dropdown first so the user sees the clip-btn feedback.
		const moreDropdown = document.getElementById('more-dropdown');
		if (moreDropdown) {
			moreDropdown.classList.remove('show');
		}
		void handleSaveToCloud();
	});

	return menuItem;
}

/**
 * Ensure the cloud menu item is present in the secondary-actions container.
 * Called by the MutationObserver whenever the container is repopulated.
 */
function ensureCloudMenuItem(container: HTMLElement): void {
	if (container.querySelector(`.${CLOUD_MENU_ITEM_CLASS}`)) return;

	// Disconnect briefly so our own insertion doesn't re-trigger the observer.
	if (observer) {
		observer.disconnect();
	}

	container.appendChild(createCloudMenuItem());
	// Render the cloud <i data-lucide="cloud"> icon we just appended.
	try {
		initializeIcons(container);
	} catch (error) {
		console.warn('Cloud: failed to initialize cloud menu icon', error);
	}

	// Re-attach the observer.
	startObserving(container);
}

function startObserving(container: HTMLElement): void {
	if (observer) {
		observer.disconnect();
	}
	observer = new MutationObserver(() => {
		ensureCloudMenuItem(container);
	});
	observer.observe(container, { childList: true });
}

/**
 * Plugin entry point. Called once when the popup is initializing.
 */
export async function initCloudPopupPlugin(): Promise<void> {
	if (initialized) return;
	initialized = true;

	registerCloudIcon();

	const container = document.querySelector('#more-dropdown .secondary-actions') as HTMLElement | null;
	if (!container) {
		// If the container isn't ready yet, watch for it to appear.
		const bodyObserver = new MutationObserver(() => {
			const found = document.querySelector('#more-dropdown .secondary-actions') as HTMLElement | null;
			if (found) {
				bodyObserver.disconnect();
				ensureCloudMenuItem(found);
				startObserving(found);
			}
		});
		bodyObserver.observe(document.body, { childList: true, subtree: true });
		return;
	}

	ensureCloudMenuItem(container);
	startObserving(container);
}
