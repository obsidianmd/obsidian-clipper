/**
 * Base adapter factory for cloud storage targets
 * Provides CRUD operations and common functionality
 */

import browser from '../../../utils/browser-polyfill';
import { CloudTarget, RemoteTarget, RemoteClient, TargetSchema, UploadMode } from '../types';

/**
 * Get secret from storage.local
 */
export async function getSecret(prefix: string, id: string): Promise<string> {
	const key = `${prefix}_${id}`;
	const data = await browser.storage.local.get(key);
	return (data[key] as string) || '';
}

/**
 * Set secret in storage.local
 */
export async function setSecret(prefix: string, id: string, secret: string): Promise<void> {
	const key = `${prefix}_${id}`;
	await browser.storage.local.set({ [key]: secret });
}

/**
 * Remove secret from storage.local
 */
export async function removeSecret(prefix: string, id: string): Promise<void> {
	const key = `${prefix}_${id}`;
	await browser.storage.local.remove(key);
}

/**
 * Default behavior to upload mode mapping
 */
export function defaultMapBehaviorToMode(behavior: string): UploadMode {
	switch (behavior) {
		case 'create':
			return 'create';
		case 'append-specific':
		case 'append-daily':
			return 'append';
		case 'prepend-specific':
		case 'prepend-daily':
			return 'prepend';
		case 'overwrite':
			return 'overwrite';
		default:
			return 'create';
	}
}

/**
 * Factory function to create a RemoteTarget adapter
 */
export function makeRemoteTarget<T extends CloudTarget>(
	schema: TargetSchema<T>
): RemoteTarget {
	return {
		get type() { return schema.type; },
		get typeLabel() { return schema.typeLabel; },
		get i18nPrefix() { return schema.i18nPrefix; },
		get storageKey() { return schema.storageKey; },
		get activeIdKey() { return schema.activeIdKey; },
		get secretPrefix() { return schema.secretPrefix; },

		async list(): Promise<CloudTarget[]> {
			const data = await browser.storage.sync.get(schema.storageKey);
			return (data[schema.storageKey] as CloudTarget[]) || [];
		},

		async getActiveId(): Promise<string | null> {
			const data = await browser.storage.sync.get(schema.activeIdKey);
			return (data[schema.activeIdKey] as string) || null;
		},

		async save(config: CloudTarget): Promise<void> {
			const list = await this.list();
			const index = list.findIndex(c => c.id === config.id);
			if (index >= 0) {
				list[index] = config;
			} else {
				list.push(config);
			}
			await browser.storage.sync.set({ [schema.storageKey]: list });
		},

		async delete(id: string): Promise<void> {
			const list = await this.list();
			const filtered = list.filter(c => c.id !== id);
			await browser.storage.sync.set({ [schema.storageKey]: filtered });
			await removeSecret(schema.secretPrefix, id);
		},

		validate(config: CloudTarget): string | null {
			return schema.validate(config as T);
		},

		async testConnection(config: CloudTarget): Promise<boolean> {
			try {
				const secret = await getSecret(schema.secretPrefix, config.id);
				const client = schema.createClient(config as T, secret);
				await client.ping();
				return true;
			} catch {
				return false;
			}
		},

		createClient(config: CloudTarget, secret: string): RemoteClient {
			return schema.createClient(config as T, secret);
		},

		mapBehaviorToMode(behavior: string): UploadMode {
			return defaultMapBehaviorToMode(behavior);
		}
	};
}

/**
 * Set active target ID
 */
export async function setActiveTargetId(activeIdKey: string, id: string | null): Promise<void> {
	if (id) {
		await browser.storage.sync.set({ [activeIdKey]: id });
	} else {
		await browser.storage.sync.remove(activeIdKey);
	}
}

/**
 * Generate unique ID for new target
 */
export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}