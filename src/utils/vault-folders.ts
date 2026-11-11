import { generalSettings } from './storage-utils';
import { debugLog } from './debug';

const DB_NAME = 'obsidian-clipper-vault-folders';
const DB_VERSION = 1;
const HANDLE_STORE = 'handles';
const FOLDER_STORE = 'folders';

const MAX_SCAN_DEPTH = 5;

interface AsyncIteratorLike<T> {
	next(): Promise<IteratorResult<T>>;
}

interface FsFileHandle {
	readonly kind: 'file';
	readonly name: string;
}

interface FsDirectoryHandle {
	readonly kind: 'directory';
	readonly name: string;
	values(): AsyncIteratorLike<FsDirectoryHandle | FsFileHandle>;
	queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
	requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

type ShowDirectoryPicker = (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FsDirectoryHandle>;

function getDirectoryPicker(): ShowDirectoryPicker | undefined {
	if (typeof window === 'undefined') return undefined;
	const candidate = (window as unknown as { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker;
	return typeof candidate === 'function' ? candidate.bind(window) : undefined;
}

export function isFileSystemAccessSupported(): boolean {
	return getDirectoryPicker() !== undefined;
}

// showDirectoryPicker rejects an `id` longer than 32 characters, so a vault
// name can't be embedded directly. Hash it into a short, stable id instead.
export function pickerIdForVault(vault: string): string {
	let hash = 5381;
	for (let index = 0; index < vault.length; index++) {
		hash = ((hash << 5) + hash + vault.charCodeAt(index)) >>> 0;
	}
	return `ocv-${hash.toString(36)}`.slice(0, 32);
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
			if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
	return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
		const transaction = db.transaction(store, 'readonly');
		const request = transaction.objectStore(store).get(key);
		request.onsuccess = () => resolve(request.result as T | undefined);
		request.onerror = () => reject(request.error);
		transaction.oncomplete = () => db.close();
	}));
}

function idbSet(store: string, key: string, value: unknown): Promise<void> {
	return openDb().then(db => new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(store, 'readwrite');
		transaction.objectStore(store).put(value, key);
		transaction.oncomplete = () => { db.close(); resolve(); };
		transaction.onerror = () => { db.close(); reject(transaction.error); };
	}));
}

function idbDelete(store: string, key: string): Promise<void> {
	return openDb().then(db => new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(store, 'readwrite');
		transaction.objectStore(store).delete(key);
		transaction.oncomplete = () => { db.close(); resolve(); };
		transaction.onerror = () => { db.close(); reject(transaction.error); };
	}));
}

async function ensureReadPermission(handle: FsDirectoryHandle): Promise<PermissionState> {
	if (!handle.queryPermission) return 'granted';
	const current = await handle.queryPermission({ mode: 'read' });
	if (current === 'granted') return 'granted';
	if (!handle.requestPermission) return current;
	return handle.requestPermission({ mode: 'read' });
}

export async function scanFolderTree(root: FsDirectoryHandle, depth = 0, prefix = ''): Promise<string[]> {
	if (depth >= MAX_SCAN_DEPTH) return [];

	const entries: (FsDirectoryHandle | FsFileHandle)[] = [];
	const iterator = root.values();
	let step = await iterator.next();
	while (!step.done) {
		entries.push(step.value);
		step = await iterator.next();
	}

	const folders: string[] = [];
	for (const entry of entries) {
		if (entry.kind !== 'directory') continue;
		// Skip hidden folders such as .obsidian, .trash and OS metadata.
		if (entry.name.startsWith('.')) continue;
		const path = prefix ? `${prefix}/${entry.name}` : entry.name;
		folders.push(path);
		// A single unreadable subfolder (e.g. an unhydrated cloud placeholder)
		// must not abort the whole scan.
		try {
			folders.push(...await scanFolderTree(entry, depth + 1, path));
		} catch (error) {
			console.warn(`Skipping unreadable folder "${path}"`, error);
		}
	}
	return folders;
}

export async function getVaultFolderHandle(vault: string): Promise<FsDirectoryHandle | undefined> {
	return idbGet<FsDirectoryHandle>(HANDLE_STORE, vault);
}

export async function getVaultFolders(vault: string): Promise<string[]> {
	const folders = await idbGet<string[]>(FOLDER_STORE, vault);
	return Array.isArray(folders) ? folders : [];
}

export async function hasVaultFolderAccess(vault: string): Promise<boolean> {
	return (await getVaultFolderHandle(vault)) !== undefined;
}

export interface PickVaultFolderResult {
	folders: string[];
	rootName?: string;
	error?: 'unsupported' | 'failed';
	reason?: string;
}

function describeError(error: unknown): string {
	if (error instanceof DOMException) return error.name;
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return String(error);
}

export async function pickVaultFolder(vault: string): Promise<PickVaultFolderResult | null> {
	const picker = getDirectoryPicker();
	if (!picker) return { folders: [], error: 'unsupported' };

	let handle: FsDirectoryHandle;
	try {
		handle = await picker({ mode: 'read', id: pickerIdForVault(vault) });
	} catch (error) {
		// The user dismissed the directory picker.
		if ((error as DOMException | undefined)?.name === 'AbortError') return null;
		console.error('Failed to open vault folder picker:', error);
		return { folders: [], error: 'failed', reason: describeError(error) };
	}

	// Obsidian's vault name is the vault folder's name, so it is the canonical
	// key for storing this vault's folder access.
	const rootName = handle.name;

	try {
		await idbSet(HANDLE_STORE, rootName, handle);
	} catch (error) {
		console.error('Failed to store vault folder handle:', error);
		return { folders: [], rootName, error: 'failed', reason: describeError(error) };
	}

	try {
		const folders = await scanFolderTree(handle);
		folders.sort((a, b) => a.localeCompare(b));
		await idbSet(FOLDER_STORE, rootName, folders);
		debugLog('VaultFolders', `Scanned ${folders.length} folders for vault "${rootName}"`);
		return { folders, rootName };
	} catch (error) {
		console.error('Failed to scan vault folder tree:', error);
		return { folders: [], rootName, error: 'failed', reason: describeError(error) };
	}
}

export interface RefreshVaultFoldersResult {
	folders: string[];
	needsPermission: boolean;
}

export async function refreshVaultFolders(vault: string): Promise<RefreshVaultFoldersResult> {
	const handle = await getVaultFolderHandle(vault);
	if (!handle) {
		return { folders: await getVaultFolders(vault), needsPermission: true };
	}

	const permission = await ensureReadPermission(handle);
	if (permission !== 'granted') {
		return { folders: await getVaultFolders(vault), needsPermission: true };
	}

	const folders = await scanFolderTree(handle);
	folders.sort((a, b) => a.localeCompare(b));
	await idbSet(FOLDER_STORE, vault, folders);
	return { folders, needsPermission: false };
}

export async function removeVaultFolderData(vault: string): Promise<void> {
	await idbDelete(HANDLE_STORE, vault);
	await idbDelete(FOLDER_STORE, vault);
}

export function getVaultDefaultFolder(vault: string): string {
	return generalSettings.vaultDefaultFolders?.[vault] ?? '';
}

export function setVaultDefaultFolder(vault: string, folder: string): Record<string, string> {
	const next = { ...(generalSettings.vaultDefaultFolders ?? {}) };
	if (folder) {
		next[vault] = folder;
	} else {
		delete next[vault];
	}
	return next;
}
