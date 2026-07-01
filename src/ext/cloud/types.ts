/**
 * Cloud storage types for Obsidian Clipper
 * Supports Git Repository, WebDAV, S3, and Fast Note backends
 */

// Each adapter's configuration type
export interface GitRepoConfig {
	type: 'gitRepo';
	id: string;
	name: string;
	provider: 'github' | 'gitee';
	owner: string;
	repo: string;
	branch: string;
	defaultPath?: string;
}

export interface WebdavConfig {
	type: 'webdav';
	id: string;
	name: string;
	url: string;
	username: string;
	defaultPath?: string;
}

export interface S3Config {
	type: 's3';
	id: string;
	name: string;
	endpoint: string;
	bucket: string;
	region: string;
	pathStyle?: boolean;
	defaultPath?: string;
}

export interface FastNoteConfig {
	type: 'fastNote';
	id: string;
	name: string;
	endpoint: string;
	username: string;
	noteId?: string;
	defaultPath?: string;
}

// Union type for all cloud target configurations
export type CloudTarget = GitRepoConfig | WebdavConfig | S3Config | FastNoteConfig;
export type CloudTargetType = CloudTarget['type'];

// Template behavior mapping to upload mode
export type UploadMode = 'create' | 'append' | 'prepend' | 'overwrite';

// Remote client interface - all clients must implement this
export interface RemoteClient {
	upload(path: string, content: string, mode: UploadMode): Promise<void>;
	ping(): Promise<void>;
}

// Remote target interface - all adapters must implement this
export interface RemoteTarget {
 readonly type: CloudTargetType;
 readonly typeLabel: string;
 readonly i18nPrefix: string;
 readonly storageKey: string;
 readonly activeIdKey: string;
 readonly secretPrefix: string;

 // CRUD operations
 list(): Promise<CloudTarget[]>;
 getActiveId(): Promise<string | null>;
 save(config: CloudTarget): Promise<void>;
 delete(id: string): Promise<void>;

 // Capabilities
 validate(config: CloudTarget): string | null;
 testConnection(config: CloudTarget): Promise<boolean>;
 createClient(config: CloudTarget, secret: string): RemoteClient;
 mapBehaviorToMode(behavior: string): UploadMode;
}

// Target schema for factory function
export interface TargetSchema<T extends CloudTarget> {
	type: T['type'];
	storageKey: string;
	activeIdKey: string;
	secretPrefix: string;
	typeLabel: string;
	i18nPrefix: string;
	validate(config: T): string | null;
	createClient(config: T, secret: string): RemoteClient;
}

// Upload request interface
export interface UploadRequest {
	template: {
		behavior: string;
		path?: string;
	};
	title: string;
	content: string;
}

// Upload result interface
export interface UploadResult {
	success: boolean;
	error?: string;
	path?: string;
}