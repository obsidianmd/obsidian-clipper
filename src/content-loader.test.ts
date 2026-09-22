// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

type StorageListener = (
	changes: Record<string, { newValue?: unknown }>,
	areaName: string,
) => void;

async function loadContentLoader(url: string) {
	window.history.replaceState({}, '', url);
	let storageListener: StorageListener | undefined;
	const sendMessage = vi.fn(() => Promise.resolve({ loaded: false }));
	const extensionApi = {
		runtime: { sendMessage },
		storage: {
			onChanged: {
				addListener: vi.fn((listener: StorageListener) => {
					storageListener = listener;
				}),
			},
		},
	};
	vi.stubGlobal('browser', extensionApi);
	vi.resetModules();
	await import('./content-loader');
	return { sendMessage, getStorageListener: () => storageListener };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('content loader', () => {
	it('requests the content script when this page gains its first highlight', async () => {
		const { sendMessage, getStorageListener } = await loadContentLoader('/article?keep=yes&utm_source=news#section');
		expect(sendMessage).toHaveBeenCalledTimes(1);

		getStorageListener()?.({
			highlights: {
				newValue: {
					'http://localhost:3000/article?keep=yes': { highlights: [{ id: 'one' }] },
				},
			},
		}, 'local');

		expect(sendMessage).toHaveBeenCalledTimes(2);
	});

	it('ignores highlight changes for other pages', async () => {
		const { sendMessage, getStorageListener } = await loadContentLoader('/article');

		getStorageListener()?.({
			highlights: {
				newValue: {
					'http://localhost:3000/other': { highlights: [{ id: 'one' }] },
				},
			},
		}, 'local');

		expect(sendMessage).toHaveBeenCalledTimes(1);
	});
});
