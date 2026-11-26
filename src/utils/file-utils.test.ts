// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vitest';
import browser from './browser-polyfill';
import { detectBrowser } from './browser-detection';
import { saveFile } from './file-utils';

vi.mock('./browser-detection', () => ({ detectBrowser: vi.fn() }));
vi.mock('./browser-polyfill', () => ({
	default: { scripting: { executeScript: vi.fn() } },
}));

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

test.each(['mobile-safari', 'ipad-os', 'safari'] as const)(
	'downloads Markdown from the target tab in %s',
	async browserType => {
		vi.useFakeTimers();
		vi.mocked(detectBrowser).mockResolvedValue(browserType);
		const createObjectURL = vi.fn(() => 'blob:https://example.com/clip');
		const revokeObjectURL = vi.fn();
		vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(function (this: HTMLAnchorElement) {
				expect(this.download).toBe('clip.md');
				expect(this.getAttribute('href')).toBe(browserType === 'safari'
					? 'data:text/markdown;charset=utf-8,Caf%C3%A9%0A'
					: 'blob:https://example.com/clip');
			});
		vi.mocked(browser.scripting.executeScript).mockImplementation(async injection => {
			expect(injection.target).toEqual({ tabId: 7 });
			injection.func!(...injection.args!);
			return [];
		});

		const onError = vi.fn();
		await saveFile({ content: 'Café\n', fileName: 'clip', tabId: 7, onError });

		expect(onError).not.toHaveBeenCalled();
		expect(click).toHaveBeenCalledOnce();
		expect(revokeObjectURL).not.toHaveBeenCalled();
		if (browserType === 'safari') {
			expect(createObjectURL).not.toHaveBeenCalled();
		} else {
			expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({
				type: 'text/markdown;charset=utf-8',
				size: 6,
			}));
			vi.runOnlyPendingTimers();
			expect(revokeObjectURL).toHaveBeenCalledWith('blob:https://example.com/clip');
		}
	},
);
