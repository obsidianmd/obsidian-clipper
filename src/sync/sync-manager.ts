import browser from '../utils/browser-polyfill';
import { BrowserSyncProvider } from './providers/browser-sync-provider';
import { LocalSyncProvider } from './providers/local-sync-provider';
import { WebDavSyncProvider } from './providers/webdav-sync-provider';
import {
	SYNC_SCHEMA_VERSION,
	createEmptySyncPayload,
	type SyncPayload,
	type SyncProvider,
	type SyncProviderId,
	type SyncSaveResult,
} from './types';

export const SYNC_PROVIDER_PREFERENCE_KEY = 'sync_provider';
export const DEFAULT_SYNC_PROVIDER_ID: SyncProviderId = 'browser';

const providers: Record<SyncProviderId, SyncProvider> = {
	local: new LocalSyncProvider(),
	browser: new BrowserSyncProvider(),
	webdav: new WebDavSyncProvider(),
};

let operationQueue: Promise<void> = Promise.resolve();

export function getSyncProviderOptions(): Array<{ id: SyncProviderId; name: string }> {
	return Object.values(providers).map(provider => ({ id: provider.id as SyncProviderId, name: provider.name }));
}

export async function getSelectedSyncProviderId(): Promise<SyncProviderId> {
	const data = await browser.storage.local.get(SYNC_PROVIDER_PREFERENCE_KEY);
	const id = data[SYNC_PROVIDER_PREFERENCE_KEY];
	return id === 'local' || id === 'browser' || id === 'webdav' ? id : DEFAULT_SYNC_PROVIDER_ID;
}

export async function getSelectedSyncProvider(): Promise<SyncProvider> {
	return providers[await getSelectedSyncProviderId()];
}

export async function testSyncProvider(id: SyncProviderId): Promise<void> {
	const provider = providers[id];
	if (provider.connect) {
		await provider.connect();
	} else {
		await provider.load();
	}
}

export async function loadSyncPayload(): Promise<SyncPayload | null> {
	await operationQueue;
	return (await getSelectedSyncProvider()).load();
}

export function updateSyncPayload(
	update: (current: SyncPayload) => SyncPayload | Promise<SyncPayload>,
): Promise<SyncSaveResult | void> {
	return enqueue(async () => {
		const provider = await getSelectedSyncProvider();
		const current = await provider.load() ?? createEmptySyncPayload();
		const updated = await update(current);
		updated.schemaVersion = SYNC_SCHEMA_VERSION;
		updated.updatedAt = new Date().toISOString();
		return provider.save(updated, current);
	});
}

export function saveSyncPayload(payload: SyncPayload): Promise<SyncSaveResult | void> {
	return updateSyncPayload(() => payload);
}

export function selectSyncProvider(id: SyncProviderId): Promise<void> {
	return enqueue(async () => {
		const currentId = await getSelectedSyncProviderId();
		if (currentId === id) return;

		const sourcePayload = await providers[currentId].load();
		const targetPayload = await providers[id].load();
		if (!targetPayload && sourcePayload) {
			await providers[id].save(sourcePayload);
		}
		await browser.storage.local.set({ [SYNC_PROVIDER_PREFERENCE_KEY]: id });
	});
}

export function repairSelectedSyncProvider(): Promise<SyncPayload | null> {
	return enqueue(async () => {
		const provider = await getSelectedSyncProvider();
		return provider.repair ? provider.repair() : provider.load();
	});
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
	const result = operationQueue.then(operation, operation);
	operationQueue = result.then(() => undefined, () => undefined);
	return result;
}
