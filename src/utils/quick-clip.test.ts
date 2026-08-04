import { describe, expect, test, vi } from 'vitest';
import { runQuickClip } from './quick-clip';

describe('runQuickClip', () => {
	test('waits for popup content before running the configured save behavior', async () => {
		let markReady: () => void;
		const ready = new Promise<void>((resolve) => {
			markReady = resolve;
		});
		const addToObsidian = vi.fn();
		const saveFile = vi.fn();
		const copyToClipboard = vi.fn();

		const quickClip = runQuickClip({
			waitUntilReady: () => ready,
			getSaveBehavior: () => 'saveFile',
			handlers: {
				addToObsidian,
				saveFile,
				copyToClipboard,
			},
		});

		await Promise.resolve();

		expect(addToObsidian).not.toHaveBeenCalled();
		expect(saveFile).not.toHaveBeenCalled();
		expect(copyToClipboard).not.toHaveBeenCalled();

		markReady!();
		await quickClip;

		expect(saveFile).toHaveBeenCalledTimes(1);
		expect(addToObsidian).not.toHaveBeenCalled();
		expect(copyToClipboard).not.toHaveBeenCalled();
	});
});
