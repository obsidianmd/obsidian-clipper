// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

vi.mock('../utils/i18n', () => ({ getMessage: (key: string) => key, setupLanguageAndDirection: async () => {} }));
vi.mock('../icons/icons', () => ({ initializeIcons: () => {} }));
vi.mock('../utils/vault-folders', () => ({
	isFileSystemAccessSupported: () => true,
	hasVaultFolderAccess: async () => true,
	getVaultFolders: async () => ['Clippings', 'Clippings/Articles'],
	pickVaultFolder: vi.fn(),
	refreshVaultFolders: vi.fn(),
	removeVaultFolderData: vi.fn(),
	setVaultDefaultFolder: vi.fn(),
}));

import { updateVaultList } from './general-settings';
import { generalSettings } from '../utils/storage-utils';

it('renders the default folder tree control for each vault', async () => {
	document.body.innerHTML = '<ul id="vault-list"></ul>';
	generalSettings.vaults = ['Second Brain'];
	generalSettings.vaultDefaultFolders = { 'Second Brain': 'Clippings/Articles' };

	await updateVaultList();

	const row = document.querySelector('.vault-default-folder')!;
	const select = row.querySelector('select')!;
	// The tree control must wrap the select inside the row, not in a detached node.
	expect(select.parentElement?.classList.contains('tree-select')).toBe(true);
	expect(row.querySelector('.tree-select-button')?.textContent).toContain('Clippings/Articles');
});
