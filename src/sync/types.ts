import type { ReaderSettings, Settings, Template } from '../types/types';

export const SYNC_SCHEMA_VERSION = 1;

export type SyncProviderId = 'local' | 'browser' | 'webdav';

type SyncedSettings = Omit<Settings, 'history' | 'ratings'>;

export type SyncSettings = Partial<Omit<SyncedSettings, 'readerSettings' | 'stats'>> & {
	readerSettings?: Partial<ReaderSettings>;
	stats?: Partial<Settings['stats']>;
};

export interface SyncPayload {
	schemaVersion: number;
	updatedAt: string;
	settings: SyncSettings;
	templates: Template[];
}

export interface SyncStatus {
	connected: boolean;
	message?: string;
}

export interface SyncSaveResult {
	warnings?: string[];
}

export interface SyncProvider {
	readonly id: SyncProviderId | string;
	readonly name: string;

	load(): Promise<SyncPayload | null>;
	save(payload: SyncPayload, previousPayload?: SyncPayload | null): Promise<SyncSaveResult | void>;

	connect?(): Promise<void>;
	disconnect?(): Promise<void>;
	getStatus?(): Promise<SyncStatus>;
	repair?(): Promise<SyncPayload | null>;
}

export function createEmptySyncPayload(): SyncPayload {
	return {
		schemaVersion: SYNC_SCHEMA_VERSION,
		updatedAt: new Date(0).toISOString(),
		settings: {},
		templates: [],
	};
}
