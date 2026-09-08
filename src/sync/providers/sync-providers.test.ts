import { describe, expect, it, vi } from 'vitest';
import type { Template } from '../../types/types';
import type { StorageArea } from '../storage-area';
import type { SyncPayload } from '../types';
import { BrowserSyncProvider, browserStorageDataToPayload } from './browser-sync-provider';
import { LocalSyncProvider, LOCAL_SYNC_PAYLOAD_KEY } from './local-sync-provider';
import { WebDavSyncProvider } from './webdav-sync-provider';

class MemoryStorageArea implements StorageArea {
	data: Record<string, unknown> = {};

	async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
		if (keys == null) return { ...this.data };
		const requested = Array.isArray(keys) ? keys : [keys];
		return Object.fromEntries(requested.map(key => [key, this.data[key]]));
	}

	async set(items: Record<string, unknown>): Promise<void> {
		Object.assign(this.data, items);
	}

	async remove(keys: string | string[]): Promise<void> {
		for (const key of Array.isArray(keys) ? keys : [keys]) delete this.data[key];
	}
}

const template: Template = {
	id: 'template-id',
	name: 'Test template',
	behavior: 'create',
	noteNameFormat: '{{title}}',
	path: 'Clippings',
	noteContentFormat: '{{content}}',
	properties: [{ id: 'property-id', name: 'source', value: '{{url}}' }],
	triggers: [],
};

const payload: SyncPayload = {
	schemaVersion: 1,
	updatedAt: '2026-09-07T12:00:00.000Z',
	settings: {
		vaults: ['Main'],
		openBehavior: 'embedded',
		readerSettings: { fontSize: 18 },
	},
	templates: [template],
};

describe('sync providers', () => {
	it('stores one normalized payload for local-only mode', async () => {
		const storage = new MemoryStorageArea();
		const provider = new LocalSyncProvider(storage);

		await provider.save(payload);

		expect(storage.data[LOCAL_SYNC_PAYLOAD_KEY]).toEqual(payload);
		expect(await provider.load()).toEqual(payload);
	});

	it('round-trips normalized data through the legacy browser-sync layout', async () => {
		const storage = new MemoryStorageArea();
		const provider = new BrowserSyncProvider(storage);

		await provider.save(payload);

		expect(storage.data.template_list).toEqual(['template-id']);
		expect(Array.isArray(storage.data['template_template-id'])).toBe(true);
		expect(storage.data.general_settings).toMatchObject({ openBehavior: 'embedded' });
		expect(await provider.load()).toEqual(payload);
	});

	it('loads existing uncompressed browser-sync exports without changing IDs', () => {
		const migrated = browserStorageDataToPayload({
			general_settings: { openBehavior: true },
			template_list: ['template-id'],
			'template_template-id': template,
		});

		expect(migrated?.settings.openBehavior).toBe(true);
		expect(migrated?.templates[0].id).toBe('template-id');
		expect(migrated?.updatedAt).toBe(new Date(0).toISOString());
	});

	it('removes browser chunks only when a template was explicitly removed from the payload', async () => {
		const storage = new MemoryStorageArea();
		const provider = new BrowserSyncProvider(storage);
		await provider.save(payload);

		await provider.save({ ...payload, templates: [] }, payload);

		expect(storage.data['template_template-id']).toBeUndefined();
		expect(storage.data.template_list).toEqual([]);
	});
});

describe('WebDavSyncProvider', () => {
	const config = {
		url: 'https://dav.example.test/clipper/settings.json',
		username: 'user',
		password: 'pass',
	};

	it('loads a normalized payload with Basic authentication', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(payload), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		}));
		const provider = new WebDavSyncProvider(async () => config, fetchMock);

		await expect(provider.load()).resolves.toEqual(payload);
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, request] = fetchMock.mock.calls[0];
		expect(url).toBe(config.url);
		expect(request?.method).toBe('GET');
		expect(request?.credentials).toBe('omit');
		expect((request?.headers as Record<string, string>).Authorization).toBe('Basic dXNlcjpwYXNz');
	});

	it('treats a missing remote file as an empty provider', async () => {
		const provider = new WebDavSyncProvider(
			async () => config,
			async () => new Response('', { status: 404 }),
		);

		await expect(provider.load()).resolves.toBeNull();
	});

	it('checks that the parent collection exists when connecting to a missing file', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === 'GET') return new Response('', { status: 404 });
			return new Response('', { status: 207 });
		});
		const provider = new WebDavSyncProvider(async () => config, fetchMock);

		await expect(provider.connect()).resolves.toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1][0]).toBe('https://dav.example.test/clipper/');
		expect(fetchMock.mock.calls[1][1]?.method).toBe('PROPFIND');
		expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Depth).toBe('0');
	});

	it('rejects a connection when the parent collection does not exist', async () => {
		const provider = new WebDavSyncProvider(
			async () => config,
			async () => new Response('', { status: 404 }),
		);

		await expect(provider.connect()).rejects.toThrow('WebDAV folder does not exist: https://dav.example.test/clipper/');
	});

	it('saves the normalized payload with PUT', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }));
		const provider = new WebDavSyncProvider(async () => config, fetchMock);

		await provider.save(payload);

		const [, request] = fetchMock.mock.calls[0];
		expect(request?.method).toBe('PUT');
		expect(JSON.parse(request?.body as string)).toEqual(payload);
	});

	it('explains a 404 returned while saving', async () => {
		const provider = new WebDavSyncProvider(
			async () => config,
			async () => new Response('', { status: 404 }),
		);

		await expect(provider.save(payload)).rejects.toThrow(
			'WebDAV save failed (404: The parent folder does not exist or the file URL is incorrect)',
		);
	});

	it('surfaces authentication errors instead of treating them as empty storage', async () => {
		const provider = new WebDavSyncProvider(
			async () => config,
			async () => new Response('Unauthorized', { status: 401 }),
		);

		await expect(provider.connect()).rejects.toThrow('WebDAV load failed (401: Unauthorized)');
	});

	it('uses the last-known-good cache only for normal loads during network failures', async () => {
		const provider = new WebDavSyncProvider(
			async () => config,
			async () => { throw new TypeError('Network unavailable'); },
			async () => payload,
			async () => {},
		);

		await expect(provider.load()).resolves.toEqual(payload);
		await expect(provider.connect()).rejects.toThrow('WebDAV request failed: Network unavailable');
	});
});
