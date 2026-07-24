import { describe, expect, test, vi } from 'vitest';
import { captureContextSelection } from './context-capture';

describe('captureContextSelection', () => {
	test('requests a selection snapshot before a context action continues', async () => {
		const sendToTab = vi.fn().mockResolvedValue({ success: true, hasSelection: true });

		const result = await captureContextSelection(sendToTab);

		expect(sendToTab).toHaveBeenCalledWith({ action: 'captureSelectionSnapshot' });
		expect(result).toEqual({ success: true, hasSelection: true });
	});
});
