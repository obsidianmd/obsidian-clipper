import browser from '../utils/browser-polyfill';
import type { SyncPayload } from './types';

export const WEBDAV_SYNC_CONFIG_KEY = 'sync_provider_config_webdav';
export const WEBDAV_SYNC_CACHE_KEY = 'sync_provider_cache_webdav';

export interface WebDavSyncConfig {
	url: string;
	username: string;
	password: string;
}

export async function loadWebDavConfig(): Promise<WebDavSyncConfig | null> {
	const data = await browser.storage.local.get(WEBDAV_SYNC_CONFIG_KEY);
	const value = data[WEBDAV_SYNC_CONFIG_KEY];
	if (!value || typeof value !== 'object') return null;
	const config = value as Partial<WebDavSyncConfig>;
	if (typeof config.url !== 'string' || !config.url.trim()) return null;
	return {
		url: config.url,
		username: typeof config.username === 'string' ? config.username : '',
		password: typeof config.password === 'string' ? config.password : '',
	};
}

export async function saveWebDavConfig(config: WebDavSyncConfig): Promise<void> {
	const normalized = {
		url: normalizeWebDavUrl(config.url),
		username: config.username.trim(),
		password: config.password,
	};
	await browser.storage.local.set({ [WEBDAV_SYNC_CONFIG_KEY]: normalized });
}

export async function loadWebDavCache(): Promise<SyncPayload | null> {
	const data = await browser.storage.local.get(WEBDAV_SYNC_CACHE_KEY);
	const value = data[WEBDAV_SYNC_CACHE_KEY];
	return value && typeof value === 'object' ? value as SyncPayload : null;
}

export async function saveWebDavCache(payload: SyncPayload): Promise<void> {
	await browser.storage.local.set({ [WEBDAV_SYNC_CACHE_KEY]: payload });
}

export function normalizeWebDavUrl(value: string): string {
	const url = new URL(value.trim());
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		throw new Error('WebDAV URL must use HTTP or HTTPS');
	}
	if (url.username || url.password) {
		throw new Error('Enter WebDAV credentials in the username and password fields');
	}
	return url.toString();
}
