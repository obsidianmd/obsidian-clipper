import { SYNC_SCHEMA_VERSION, type SyncPayload, type SyncProvider, type SyncStatus } from '../types';
import {
	loadWebDavCache,
	loadWebDavConfig,
	normalizeWebDavUrl,
	saveWebDavCache,
	type WebDavSyncConfig,
} from '../webdav-config';

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type ConfigLoader = () => Promise<WebDavSyncConfig | null>;
type CacheLoader = () => Promise<SyncPayload | null>;
type CacheSaver = (payload: SyncPayload) => Promise<void>;

const REQUEST_TIMEOUT_MS = 15_000;

class WebDavUnavailableError extends Error {}

export class WebDavSyncProvider implements SyncProvider {
	readonly id = 'webdav';
	readonly name = 'WebDAV';

	constructor(
		private readonly configLoader: ConfigLoader = loadWebDavConfig,
		private readonly fetchFn: FetchLike = globalThis.fetch.bind(globalThis),
		private readonly cacheLoader: CacheLoader = loadWebDavCache,
		private readonly cacheSaver: CacheSaver = saveWebDavCache,
	) {}

	async load(): Promise<SyncPayload | null> {
		try {
			return await this.loadRemote();
		} catch (error) {
			if (!(error instanceof WebDavUnavailableError)) throw error;
			const cached = await this.cacheLoader();
			if (cached) return validateSyncPayload(cached);
			throw error;
		}
	}

	async save(payload: SyncPayload): Promise<void> {
		const response = await this.request('PUT', JSON.stringify(payload));
		await ensureSuccessfulResponse(response, 'save');
		await this.cacheSaver(payload);
	}

	async connect(): Promise<void> {
		const payload = await this.loadRemote();
		if (!payload) await this.ensureParentCollectionExists();
	}

	async getStatus(): Promise<SyncStatus> {
		const config = await this.configLoader();
		return config
			? { connected: true, message: 'Configured' }
			: { connected: false, message: 'Configuration required' };
	}

	private async request(method: 'GET' | 'PUT' | 'PROPFIND', body?: string, targetUrl?: string): Promise<Response> {
		const config = await this.configLoader();
		if (!config) throw new Error('WebDAV is not configured');
		const url = targetUrl ?? normalizeWebDavUrl(config.url);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
		try {
			return await this.fetchFn(url, {
				method,
					headers: {
					Accept: 'application/json',
					...(body ? { 'Content-Type': 'application/json' } : {}),
					...(method === 'PROPFIND' ? { Depth: '0' } : {}),
					...(config.username || config.password
						? { Authorization: `Basic ${encodeBasicAuth(config.username, config.password)}` }
						: {}),
				},
				body,
				cache: 'no-store',
				// WebDAV authentication must not inherit a Nextcloud browser session.
				// A session cookie without DAV authentication triggers Nextcloud's CSRF check on writes.
				credentials: 'omit',
				signal: controller.signal,
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				throw new WebDavUnavailableError('WebDAV request timed out');
			}
			throw new WebDavUnavailableError(`WebDAV request failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			clearTimeout(timeout);
		}
	}

	private async loadRemote(): Promise<SyncPayload | null> {
		const response = await this.request('GET');
		if (response.status === 404) return null;
		await ensureSuccessfulResponse(response, 'load');

		let value: unknown;
		try {
			value = await response.json();
		} catch {
			throw new Error('WebDAV returned invalid JSON');
		}
		const payload = validateSyncPayload(value);
		await this.cacheSaver(payload);
		return payload;
	}

	private async ensureParentCollectionExists(): Promise<void> {
		const config = await this.configLoader();
		if (!config) throw new Error('WebDAV is not configured');
		const fileUrl = normalizeWebDavUrl(config.url);
		const parentUrl = new URL('.', fileUrl).toString();
		const response = await this.request('PROPFIND', undefined, parentUrl);
		if (response.status === 404) {
			throw new Error(`WebDAV folder does not exist: ${parentUrl}`);
		}
		await ensureSuccessfulResponse(response, 'folder check');
	}
}

function validateSyncPayload(value: unknown): SyncPayload {
	if (!value || typeof value !== 'object') throw new Error('WebDAV payload is invalid');
	const payload = value as Partial<SyncPayload>;
	if (typeof payload.schemaVersion !== 'number'
		|| typeof payload.updatedAt !== 'string'
		|| !payload.settings
		|| typeof payload.settings !== 'object'
		|| !Array.isArray(payload.templates)) {
		throw new Error('WebDAV payload is invalid');
	}
	if (payload.schemaVersion > SYNC_SCHEMA_VERSION) {
		throw new Error(`WebDAV payload schema ${payload.schemaVersion} is newer than supported schema ${SYNC_SCHEMA_VERSION}`);
	}
	return payload as SyncPayload;
}

async function ensureSuccessfulResponse(response: Response, action: string): Promise<void> {
	if (response.ok) return;
	let detail = '';
	try {
		detail = (await response.text()).trim().slice(0, 200);
	} catch {
		// Some servers do not return readable error bodies.
	}
	const hint = action === 'save' && response.status === 404
		? 'The parent folder does not exist or the file URL is incorrect'
		: detail;
	const message = `WebDAV ${action} failed (${response.status}${hint ? `: ${hint}` : ''})`;
	if (action === 'load' && (response.status === 401
		|| response.status === 403
		|| response.status === 408
		|| response.status === 429
		|| response.status >= 500)) {
		throw new WebDavUnavailableError(message);
	}
	throw new Error(message);
}

function encodeBasicAuth(username: string, password: string): string {
	const bytes = new TextEncoder().encode(`${username}:${password}`);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}
