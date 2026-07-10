/**
 * Settings-side registration for the cloud storage plugin.
 *
 * This module mounts the cloud settings section + editor modal into the
 * settings page via the plugin system (`src/core/plugin-system.ts`), so the
 * original `settings.html` / `core/settings.ts` no longer need to ship the
 * cloud markup or call `mountCloudSettings()` themselves.
 *
 * Flow:
 *   1. Inject cloud CSS.
 *   2. Inject the `#cloud-section` panel into `#content`.
 *   3. Inject the `#cloud-modal` editor into `<body>`.
 *   4. Inject the cloud sidebar nav item (before the `reader` item).
 *   5. Register the `Cloud` lucide icon locally (without modifying
 *      `icons.ts`) and re-run `initializeIcons()` so the sidebar icon
 *      renders.
 *   6. Apply the cloud module's own translations.
 *   7. Call `mountCloudSettings()` so the existing UI code can bind event
 *      listeners to the freshly-injected DOM.
 *   8. Watch the modal for visibility / content changes and re-apply
 *      translations, because the existing modal code calls the shared
 *      `translatePage()` which no longer has the cloud keys.
 */

import { Cloud } from 'lucide';
import { SettingsPluginContext, injectStyles } from '../../core/plugin-system';
import { icons, initializeIcons } from '../../icons/icons';
import { updateUrl } from '../../utils/routing';
import { cloudStyles } from './cloud-styles';
import {
	cloudSettingsSectionTemplate,
	cloudModalTemplate,
	cloudSidebarNavItemTemplate
} from './cloud-template';
import { applyCloudTranslations } from './cloud-i18n';
import { mountCloudSettings } from './ui/cloud-settings';

let initialized = false;

/**
 * Register the Cloud lucide icon into the shared `icons` object without
 * modifying `icons.ts`. Idempotent.
 */
function registerCloudIcon(): void {
	if (!(icons as any).Cloud) {
		(icons as any).Cloud = Cloud;
	}
}

function injectCloudSection(content: HTMLElement): HTMLElement | null {
	if (document.getElementById('cloud-section')) {
		return document.getElementById('cloud-section');
	}

	const template = document.createElement('template');
	template.innerHTML = cloudSettingsSectionTemplate.trim();
	const node = template.content.firstElementChild as HTMLElement | null;
	if (!node) return null;

	// Match the original ordering from settings.html: cloud-section sits
	// between reader-section and highlighter-section. Falling back to append
	// is fine functionally (only one section is visible at a time).
	const highlighterSection = document.getElementById('highlighter-section');
	if (highlighterSection && highlighterSection.parentNode === content) {
		content.insertBefore(node, highlighterSection);
	} else {
		content.appendChild(node);
	}
	return node;
}

function injectCloudModal(): HTMLElement | null {
	if (document.getElementById('cloud-modal')) {
		return document.getElementById('cloud-modal');
	}

	const template = document.createElement('template');
	template.innerHTML = cloudModalTemplate.trim();
	const node = template.content.firstElementChild as HTMLElement | null;
	if (!node) return null;

	document.body.appendChild(node);
	return node;
}

function injectCloudSidebarNav(): HTMLElement | null {
	const existing = document.querySelector('#sidebar li[data-section="cloud"]');
	if (existing) return existing as HTMLElement;

	const sidebarList = document.querySelector('#sidebar > ul');
	if (!sidebarList) return null;

	const template = document.createElement('template');
	template.innerHTML = cloudSidebarNavItemTemplate.trim();
	const node = template.content.firstElementChild as HTMLElement | null;
	if (!node) return null;

	// Match the original ordering: cloud comes right before reader.
	const readerItem = sidebarList.querySelector('li[data-section="reader"]');
	if (readerItem) {
		sidebarList.insertBefore(node, readerItem);
	} else {
		sidebarList.appendChild(node);
	}

	// Bind click handler for the cloud section.
	// The original initializeSidebar() uses event delegation on #sidebar but
	// only handles a hardcoded list of sections ('general', 'properties', etc.).
	// 'cloud' is not in that list, so we need our own handler.
	node.addEventListener('click', (event) => {
		event.stopPropagation();
		showCloudSection();

		// Close the sidebar on mobile, matching the original behavior.
		const settingsContainer = document.getElementById('settings');
		const hamburgerMenu = document.getElementById('hamburger-menu');
		if (settingsContainer) {
			settingsContainer.classList.remove('sidebar-open');
		}
		if (hamburgerMenu) {
			hamburgerMenu.classList.remove('is-active');
		}
	});

	return node;
}

function showCloudSection(): void {
	// Toggle active state for all sections and sidebar items, matching the
	// pattern used by showSettingsSection() in settings-section-ui.ts.
	document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
	document.querySelectorAll('#sidebar li[data-section]').forEach(item => item.classList.remove('active'));

	const cloudSection = document.getElementById('cloud-section');
	const cloudNavItem = document.querySelector('#sidebar li[data-section="cloud"]');
	if (cloudSection) cloudSection.classList.add('active');
	if (cloudNavItem) cloudNavItem.classList.add('active');

	// Update URL without reloading.
	try { updateUrl('cloud'); } catch { /* ignore */ }
}

/**
 * The existing cloud modal code (`ui/cloud-modal.ts`) calls the shared
 * `translatePage()` which no longer has the cloud keys after the locale
 * revert. We observe the modal for visibility / content changes and re-apply
 * our own translations afterwards.
 */
function watchModalForTranslations(modal: HTMLElement): void {
	const reapply = (): void => {
		// Only translate when the modal is visible (avoids unnecessary work
		// and matches the user-visible state).
		if (modal.style.display === 'none' || modal.style.display === '') {
			return;
		}
		applyCloudTranslations(modal);
	};

	const observer = new MutationObserver(() => reapply());
	observer.observe(modal, {
		attributes: true,
		attributeFilter: ['style'],
		childList: true,
		subtree: true
	});

	// Also observe the type-fields container which gets its innerHTML swapped
	// when the user switches cloud target type.
	const typeFields = modal.querySelector('#cloud-type-fields');
	if (typeFields) {
		const fieldsObserver = new MutationObserver(() => reapply());
		fieldsObserver.observe(typeFields, { childList: true, subtree: true });
	}
}

/**
 * Plugin entry point. Called once on settings page init.
 */
export async function initCloudSettingsPlugin(ctx?: SettingsPluginContext): Promise<void> {
	if (initialized) return;
	initialized = true;

	// 1. Inject styles.
	injectStyles('cloud-styles', cloudStyles);

	// 2-4. Inject DOM.
	const root = ctx?.root ?? document.documentElement;
	const content = root.querySelector('#content') as HTMLElement | null
		|| document.getElementById('content');

	if (content) {
		injectCloudSection(content);
	}
	injectCloudModal();
	injectCloudSidebarNav();

	// 5. Register the Cloud icon and render all unrendered <i data-lucide>
	//    elements (including the cloud sidebar icon).
	registerCloudIcon();
	try {
		initializeIcons();
	} catch (error) {
		console.error('Cloud settings: failed to initialize icons', error);
	}

	// 6. Apply translations to the freshly-injected DOM.
	applyCloudTranslations(document);

	// 7. Bind event listeners via the existing mountCloudSettings() helper.
	//    It queries #add-cloud-target-btn / #cloud-active-target / etc., all
	//    of which now exist because we just injected them.
	try {
		mountCloudSettings();
	} catch (error) {
		console.error('Cloud settings: failed to mount cloud settings UI', error);
	}

	// 8. Watch the modal so dynamically-injected fields stay translated.
	const modal = document.getElementById('cloud-modal');
	if (modal) {
		watchModalForTranslations(modal);
	}

	// 9. Handle ?section=cloud URL parameter. The original handleUrlParameters
	//    only knows about built-in sections, so we handle 'cloud' ourselves.
	const url = new URL(window.location.href);
	if (url.searchParams.get('section') === 'cloud') {
		showCloudSection();
	}
}
