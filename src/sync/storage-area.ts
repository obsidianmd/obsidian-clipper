export interface StorageArea {
	get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
	set(items: Record<string, unknown>): Promise<void>;
	remove?(keys: string | string[]): Promise<void>;
}
