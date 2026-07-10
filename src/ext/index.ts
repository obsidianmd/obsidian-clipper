/**
 * Entry point for all custom extension modules.
 * Importing this file registers all plugins. The original codebase only needs
 * to call `initExtensions()` once - it does not need to know about individual modules.
 */

import { registerPopupPlugin, registerSettingsPlugin } from '../core/plugin-system';

// Lazy-register: each module exports a registration function.
// We use dynamic imports so that modules are code-split and don't bloat the
// main bundle when their feature isn't used.

let registered = false;

export function initExtensions(): void {
	if (registered) return;
	registered = true;

	// Chat module
	registerPopupPlugin({
		id: 'chat',
		init: async () => {
			const { initChatPlugin } = await import('./chat/register-popup');
			await initChatPlugin();
		},
		onTemplateChange: async (template, variables, ctx) => {
			const { onTemplateChange } = await import('./chat/register-popup');
			await onTemplateChange(template, variables, ctx);
		},
		beforeClip: async () => {
			const { beforeClip } = await import('./chat/register-popup');
			await beforeClip();
		},
		dispose: () => {
			// best-effort: dynamic import dispose is async, skip for unload
		}
	});

	// Cloud storage module (popup side) - adds a "Save to cloud" entry to the
	// secondary actions menu in the popup.
	registerPopupPlugin({
		id: 'cloud',
		init: async () => {
			const { initCloudPopupPlugin } = await import('./cloud/register-popup');
			await initCloudPopupPlugin();
		},
		getSaveToCloudAction: async () => {
			const { handleSaveToCloud, getCloudActionLabel } = await import('./cloud/register-popup');
			return {
				label: getCloudActionLabel(),
				handler: handleSaveToCloud
			};
		}
	});

	// Cloud storage settings module - injects the cloud settings section,
	// sidebar nav item, editor modal, styles and translations into the
	// settings page.
	registerSettingsPlugin({
		id: 'cloud-settings',
		init: async (ctx) => {
			const { initCloudSettingsPlugin } = await import('./cloud/register-settings');
			await initCloudSettingsPlugin(ctx);
		},
		getSections: () => ['cloud'],
		onShowSection: () => {}
	});
}
