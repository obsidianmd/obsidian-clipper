/**
 * Lightweight plugin system for decoupling custom features (chat, cloud storage, etc.)
 * from the original codebase. Custom modules register themselves via `registerPlugin`
 * instead of being imported directly by popup.ts / settings.ts.
 *
 * This keeps the original files nearly untouched, making upstream merges painless.
 */

export interface PopupPluginContext {
	/** Current tab id (available after initialization). */
	tabId?: number;
	/** Current page URL. */
	currentUrl?: string;
	/** Read access to the current variables object (mutable, plugins may extend it). */
	variables?: { [key: string]: any };
}

export interface PopupPlugin {
	/** Unique plugin id. */
	id: string;
	/** Called once when popup is initializing (after DOM ready, before template render). */
	init?: (ctx: PopupPluginContext) => void | Promise<void>;
	/** Called when a template is loaded/switched. Returns false to skip default chat handling. */
	onTemplateChange?: (template: any, variables: { [key: string]: any }, ctx: PopupPluginContext) => void | Promise<void>;
	/** Called before clipping to allow plugins to finish in-flight work. */
	beforeClip?: () => Promise<void>;
	/** Cleanup when popup unloads. */
	dispose?: () => void;
	/** Return the main action handler for saveToCloud behavior. */
	getSaveToCloudAction?: () => Promise<{ label: string; handler: () => void | Promise<void> } | null>;
}

export interface SettingsPluginContext {
	/** Root element of the settings page. */
	root: HTMLElement;
}

export interface SettingsPlugin {
	/** Unique plugin id. */
	id: string;
	/** Called once on settings page init. Use to mount UI, inject styles, etc. */
	init?: (ctx: SettingsPluginContext) => void | Promise<void>;
	/** Return the list of section ids this plugin provides (for sidebar routing). */
	getSections?: () => string[];
	/** Called when a section is shown. */
	onShowSection?: (section: string) => void;
	/** Cleanup when settings page unloads. */
	dispose?: () => void;
}

const popupPlugins: PopupPlugin[] = [];
const settingsPlugins: SettingsPlugin[] = [];

export function registerPopupPlugin(plugin: PopupPlugin): void {
	popupPlugins.push(plugin);
}

export function registerSettingsPlugin(plugin: SettingsPlugin): void {
	settingsPlugins.push(plugin);
}

export function getPopupPlugins(): PopupPlugin[] {
	return popupPlugins;
}

export function getSettingsPlugins(): SettingsPlugin[] {
	return settingsPlugins;
}

/** Helper: inject a <style> tag into <head> with an id, idempotent. */
export function injectStyles(id: string, css: string): void {
	if (document.getElementById(id)) return;
	const style = document.createElement('style');
	style.id = id;
	style.textContent = css;
	document.head.appendChild(style);
}

/** Helper: inject a <script>-free DOM subtree from an HTML string. */
export function injectDom(parent: HTMLElement, html: string): HTMLElement {
	const wrapper = document.createElement('template');
	wrapper.innerHTML = html.trim();
	const node = wrapper.content.firstElementChild as HTMLElement;
	parent.appendChild(node);
	return node;
}
