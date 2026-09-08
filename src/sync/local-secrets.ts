import browser from '../utils/browser-polyfill';
import type { Provider } from '../types/types';
import type { StorageArea } from './storage-area';
import type { SyncPayload } from './types';

export const LOCAL_PROVIDER_API_KEYS_KEY = 'sync_local_provider_api_keys';

type ProviderApiKeys = Record<string, string>;

export class LocalSyncSecrets {
	constructor(private readonly storage: StorageArea = browser.storage.local as StorageArea) {}

	async hydrate(payload: SyncPayload): Promise<SyncPayload> {
		const providers = getProviders(payload);
		if (!providers) return payload;

		const secrets = await this.load();
		let changed = false;
		const hydratedProviders = providers.map(provider => {
			const localApiKey = secrets[provider.id];
			if (!localApiKey && provider.apiKey) {
				secrets[provider.id] = provider.apiKey;
				changed = true;
			}
			return {
				...provider,
				apiKey: localApiKey || provider.apiKey || '',
			};
		});

		if (changed) await this.save(secrets);
		return withProviders(payload, hydratedProviders);
	}

	async prepareForSync(payload: SyncPayload): Promise<SyncPayload> {
		const providers = getProviders(payload);
		if (!providers) return redactSyncPayloadSecrets(payload);

		const secrets = await this.load();
		for (const provider of providers) {
			if (provider.apiKey) {
				secrets[provider.id] = provider.apiKey;
			} else {
				delete secrets[provider.id];
			}
		}
		await this.save(secrets);
		return redactSyncPayloadSecrets(payload);
	}

	private async load(): Promise<ProviderApiKeys> {
		const data = await this.storage.get(LOCAL_PROVIDER_API_KEYS_KEY);
		const value = data[LOCAL_PROVIDER_API_KEYS_KEY];
		if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
		return Object.fromEntries(Object.entries(value)
			.filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
	}

	private async save(secrets: ProviderApiKeys): Promise<void> {
		await this.storage.set({ [LOCAL_PROVIDER_API_KEYS_KEY]: secrets });
	}
}

export function redactSyncPayloadSecrets(payload: SyncPayload): SyncPayload {
	const providers = getProviders(payload);
	if (!providers) return payload;
	return withProviders(payload, providers.map(provider => ({ ...provider, apiKey: '' })));
}

export function hasSyncPayloadSecrets(payload: SyncPayload): boolean {
	return getProviders(payload)?.some(provider => Boolean(provider.apiKey)) ?? false;
}

function getProviders(payload: SyncPayload): Provider[] | null {
	const value: unknown = payload.settings.providers;
	if (!Array.isArray(value)) return null;
	return value.filter((provider): provider is Provider => Boolean(provider)
		&& typeof provider === 'object'
		&& typeof (provider as Partial<Provider>).id === 'string')
		.map(provider => ({
			...provider,
			apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : '',
		}));
}

function withProviders(payload: SyncPayload, providers: Provider[]): SyncPayload {
	return {
		...payload,
		settings: {
			...payload.settings,
			providers,
		},
	};
}
