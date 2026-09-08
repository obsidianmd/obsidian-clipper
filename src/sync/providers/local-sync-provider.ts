import browser from '../../utils/browser-polyfill';
import type { StorageArea } from '../storage-area';
import type { SyncPayload, SyncProvider, SyncStatus } from '../types';

export const LOCAL_SYNC_PAYLOAD_KEY = 'sync_payload';

export class LocalSyncProvider implements SyncProvider {
	readonly id = 'local';
	readonly name = 'Local only';

	constructor(private readonly storage: StorageArea = browser.storage.local as StorageArea) {}

	async load(): Promise<SyncPayload | null> {
		const data = await this.storage.get(LOCAL_SYNC_PAYLOAD_KEY);
		const payload = data[LOCAL_SYNC_PAYLOAD_KEY];
		return isSyncPayload(payload) ? payload : null;
	}

	async save(payload: SyncPayload): Promise<void> {
		await this.storage.set({ [LOCAL_SYNC_PAYLOAD_KEY]: payload });
	}

	async getStatus(): Promise<SyncStatus> {
		return { connected: true, message: 'Stored on this device' };
	}
}

function isSyncPayload(value: unknown): value is SyncPayload {
	if (!value || typeof value !== 'object') return false;
	const payload = value as Partial<SyncPayload>;
	return typeof payload.schemaVersion === 'number'
		&& typeof payload.updatedAt === 'string'
		&& !!payload.settings
		&& typeof payload.settings === 'object'
		&& Array.isArray(payload.templates);
}
