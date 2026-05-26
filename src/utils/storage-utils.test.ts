import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('core/popup', () => ({
	copyToClipboard: vi.fn(),
}));

import browser from './browser-polyfill';
import { addHistoryEntry, createNoteLink, getLatestClipForUrl } from './storage-utils';

describe('storage-utils history helpers', () => {
	beforeEach(() => {
		(browser.storage.local.get as any) = vi.fn();
		(browser.storage.local.set as any) = vi.fn();
		(browser.storage.sync.get as any) = vi.fn(async () => ({}));
		(browser.storage.sync.set as any) = vi.fn(async () => ({}));
	});

	test('addHistoryEntry stores note metadata for saved clips', async () => {
		(browser.storage.local.get as any).mockResolvedValue({ history: [] });

		await addHistoryEntry(
			'addToObsidian',
			'https://example.com/source',
			'Source Page',
			'My Vault',
			'clips',
			{
				noteName: 'Source Note',
				notePath: 'clips/Source Note',
				noteLink: '[[clips/Source Note]]',
			}
		);

		expect(browser.storage.local.set).toHaveBeenCalledWith({
			history: [
				expect.objectContaining({
					url: 'https://example.com/source',
					title: 'Source Page',
					vault: 'My Vault',
					path: 'clips',
					noteName: 'Source Note',
					notePath: 'clips/Source Note',
					noteLink: '[[clips/Source Note]]',
				}),
			],
		});
	});

	test('getLatestClipForUrl returns parent context from most recent clip', async () => {
		(browser.storage.local.get as any).mockResolvedValue({
			history: [
				{
					datetime: '2026-04-24T00:00:00Z',
					url: 'https://example.com/source',
					action: 'addToObsidian',
					title: 'Source Page',
					noteName: 'Source Note',
					notePath: 'clips/Source Note',
					noteLink: '[[clips/Source Note]]',
				},
				{
					datetime: '2026-04-23T00:00:00Z',
					url: 'https://example.com/source',
					action: 'copyToClipboard',
					title: 'Older Copy',
				},
			],
		});

		await expect(getLatestClipForUrl('https://example.com/source')).resolves.toEqual({
			parentUrl: 'https://example.com/source',
			parentTitle: 'Source Page',
			parentNoteName: 'Source Note',
			parentNotePath: 'clips/Source Note',
			parentNoteLink: '[[clips/Source Note]]',
		});
	});

	test('getLatestClipForUrl falls back to a generated wiki link', async () => {
		(browser.storage.local.get as any).mockResolvedValue({
			history: [
				{
					datetime: '2026-04-24T00:00:00Z',
					url: 'https://example.com/source',
					action: 'addToObsidian',
					title: 'Source Page',
					noteName: 'Source Note',
					notePath: 'clips/Source Note',
				},
			],
		});

		await expect(getLatestClipForUrl('https://example.com/source')).resolves.toEqual({
			parentUrl: 'https://example.com/source',
			parentTitle: 'Source Page',
			parentNoteName: 'Source Note',
			parentNotePath: 'clips/Source Note',
			parentNoteLink: '[[clips/Source Note]]',
		});
	});

	test('createNoteLink returns an empty string when note path is missing', () => {
		expect(createNoteLink('')).toBe('');
		expect(createNoteLink(undefined)).toBe('');
	});
});
