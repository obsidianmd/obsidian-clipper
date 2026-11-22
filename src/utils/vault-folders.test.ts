// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { scanFolderTree, getVaultDefaultFolder, setVaultDefaultFolder, pickerIdForVault } from './vault-folders';
import { generalSettings } from './storage-utils';

interface FakeFile {
	kind: 'file';
	name: string;
}

interface FakeDirectory {
	kind: 'directory';
	name: string;
	values(): { next(): Promise<IteratorResult<FakeDirectory | FakeFile>> };
}

function dir(name: string, children: (FakeDirectory | FakeFile)[] = []): FakeDirectory {
	return {
		kind: 'directory',
		name,
		values() {
			let index = 0;
			return {
				async next(): Promise<IteratorResult<FakeDirectory | FakeFile>> {
					if (index < children.length) {
						return { done: false, value: children[index++] };
					}
					return { done: true, value: undefined };
				}
			};
		}
	};
}

function file(name: string): FakeFile {
	return { kind: 'file', name };
}

describe('scanFolderTree', () => {
	test('collects nested folders using slash-separated paths', async () => {
		const root = dir('root', [dir('Clippings', [dir('Web')]), file('note.md')]);
		expect(await scanFolderTree(root as never)).toEqual(['Clippings', 'Clippings/Web']);
	});

	test('skips hidden folders such as .obsidian', async () => {
		const root = dir('root', [dir('.obsidian'), dir('.trash'), dir('Notes')]);
		expect(await scanFolderTree(root as never)).toEqual(['Notes']);
	});

	test('stops at the depth limit', async () => {
		const deep = dir('a', [dir('b', [dir('c', [dir('d', [dir('e', [dir('f')])])])])]);
		expect(await scanFolderTree(deep as never))
			.toEqual(['b', 'b/c', 'b/c/d', 'b/c/d/e', 'b/c/d/e/f']);
	});
});

describe('pickerIdForVault', () => {
	test('stays within the 32 character picker id limit', () => {
		for (const name of ['SKA', 'Infrastrcture', 'a'.repeat(200), 'Unicode-☁-vault-name']) {
			expect(pickerIdForVault(name).length).toBeLessThanOrEqual(32);
		}
	});

	test('is stable and distinct per vault', () => {
		expect(pickerIdForVault('SKA')).toBe(pickerIdForVault('SKA'));
		expect(pickerIdForVault('SKA')).not.toBe(pickerIdForVault('Other'));
	});
});

describe('vault default folder helpers', () => {
	beforeEach(() => {
		generalSettings.vaultDefaultFolders = {};
	});

	test('returns an empty string when no default is set', () => {
		expect(getVaultDefaultFolder('Vault')).toBe('');
	});

	test('sets and reads back a default folder', () => {
		generalSettings.vaultDefaultFolders = setVaultDefaultFolder('Vault', 'Clippings');
		expect(getVaultDefaultFolder('Vault')).toBe('Clippings');
	});

	test('clearing a default removes the entry', () => {
		generalSettings.vaultDefaultFolders = { Vault: 'Clippings' };
		const next = setVaultDefaultFolder('Vault', '');
		expect(next.Vault).toBeUndefined();
	});
});
