import browser from '../utils/browser-polyfill';
import { BrowserSyncProvider } from './providers/browser-sync-provider';
import { LocalSyncProvider } from './providers/local-sync-provider';
import { WebDavSyncProvider } from './providers/webdav-sync-provider';
import { hasSyncPayloadSecrets, LocalSyncSecrets } from './local-secrets';
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
const localSecrets = new LocalSyncSecrets();

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
	const payload = await (await getSelectedSyncProvider()).load();
	return payload ? localSecrets.hydrate(payload) : null;
}

export function updateSyncPayload(
	update: (current: SyncPayload) => SyncPayload | Promise<SyncPayload>,
): Promise<SyncSaveResult | void> {
	return enqueue(async () => {
		const provider = await getSelectedSyncProvider();
		const stored = await provider.load();
		const current = stored ? await localSecrets.hydrate(stored) : createEmptySyncPayload();
		const updated = await update(current);
		updated.schemaVersion = SYNC_SCHEMA_VERSION;
		updated.updatedAt = new Date().toISOString();
		return provider.save(await localSecrets.prepareForSync(updated), stored);
	});
}

export function saveSyncPayload(payload: SyncPayload): Promise<SyncSaveResult | void> {
	return updateSyncPayload(() => payload);
}

export function selectSyncProvider(id: SyncProviderId): Promise<void> {
	return enqueue(async () => {
		const currentId = await getSelectedSyncProviderId();
		const targetProvider = providers[id];
		if (currentId === id) {
			await migrateProviderSecrets(targetProvider);
			return;
		}

		const storedSource = await providers[currentId].load();
		const sourcePayload = storedSource ? await localSecrets.hydrate(storedSource) : null;
		const storedTarget = await targetProvider.load();
		if (!storedTarget && sourcePayload) {
			await targetProvider.save(await localSecrets.prepareForSync(sourcePayload));
		} else if (storedTarget) {
			const targetPayload = await localSecrets.hydrate(storedTarget);
			if (hasSyncPayloadSecrets(storedTarget)) {
				await targetProvider.save(await localSecrets.prepareForSync(targetPayload), storedTarget);
			}
		}
		await browser.storage.local.set({ [SYNC_PROVIDER_PREFERENCE_KEY]: id });
	});
}

export function repairSelectedSyncProvider(): Promise<SyncPayload | null> {
	return enqueue(async () => {
		const provider = await getSelectedSyncProvider();
		const payload = provider.repair ? await provider.repair() : await provider.load();
		return payload ? localSecrets.hydrate(payload) : null;
	});
}

async function migrateProviderSecrets(provider: SyncProvider): Promise<void> {
	const stored = await provider.load();
	if (!stored) return;
	const hydrated = await localSecrets.hydrate(stored);
	if (hasSyncPayloadSecrets(stored)) {
		await provider.save(await localSecrets.prepareForSync(hydrated), stored);
	}
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
	const result = operationQueue.then(operation, operation);
	operationQueue = result.then(() => undefined, () => undefined);
	return result;
}
