import { describe, test, expect, vi } from 'vitest';
import { waitForPopupReady } from './popup-readiness';

describe('waitForPopupReady', () => {
	test('resolves immediately when the popup is already ready', async () => {
		const sleep = vi.fn(async () => {});
		const askPopup = vi.fn(async () => ({ ready: true }));

		await expect(waitForPopupReady(askPopup, { sleep })).resolves.toBe(true);
		expect(askPopup).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	test('retries while the popup has no message listener yet', async () => {
		const sleep = vi.fn(async () => {});
		const askPopup = vi.fn()
			.mockRejectedValueOnce(new Error('Could not establish connection'))
			.mockRejectedValueOnce(new Error('Could not establish connection'))
			.mockResolvedValue({ ready: true });

		await expect(waitForPopupReady(askPopup, { sleep })).resolves.toBe(true);
		expect(askPopup).toHaveBeenCalledTimes(3);
	});

	// The reported race: the popup is listening but its asynchronous variables
	// (a YouTube transcript) have not resolved, so saving now would write an
	// empty note.
	test('keeps waiting while the popup reports it is not ready', async () => {
		const sleep = vi.fn(async () => {});
		const askPopup = vi.fn()
			.mockResolvedValueOnce({ ready: false })
			.mockResolvedValueOnce({ ready: false })
			.mockResolvedValueOnce({ ready: false })
			.mockResolvedValue({ ready: true });

		await expect(waitForPopupReady(askPopup, { sleep })).resolves.toBe(true);
		expect(askPopup).toHaveBeenCalledTimes(4);
	});

	test('treats a response without a ready flag as not ready', async () => {
		const sleep = vi.fn(async () => {});
		const askPopup = vi.fn()
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce({})
			.mockResolvedValue({ ready: true });

		await expect(waitForPopupReady(askPopup, { sleep })).resolves.toBe(true);
		expect(askPopup).toHaveBeenCalledTimes(3);
	});

	test('gives up after the configured number of attempts', async () => {
		const sleep = vi.fn(async () => {});
		const askPopup = vi.fn(async () => ({ ready: false }));

		await expect(waitForPopupReady(askPopup, { attempts: 5, sleep })).resolves.toBe(false);
		expect(askPopup).toHaveBeenCalledTimes(5);
	});

	test('waits the configured interval between attempts and not after the last one', async () => {
		const sleep = vi.fn(async () => {});
		const askPopup = vi.fn(async () => ({ ready: false }));

		await waitForPopupReady(askPopup, { attempts: 3, intervalMs: 250, sleep });

		expect(sleep).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(250);
	});
});
