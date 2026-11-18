import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import browser from './browser-polyfill';
import { openObsidianUrl } from './obsidian-url';

vi.mock('./browser-polyfill', () => ({
	default: {
		runtime: { getPlatformInfo: vi.fn() },
		tabs: { create: vi.fn(), query: vi.fn(), update: vi.fn() },
	},
}));

const url = 'obsidian://new?file=Clippings%2FTest&vault=Notes&clipboard&content=fallback';
const chromiumUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal('navigator', { userAgent: chromiumUA });
	vi.mocked(browser.runtime.getPlatformInfo).mockResolvedValue({ os: 'android', arch: 'arm' });
	vi.mocked(browser.tabs.query).mockResolvedValue([{ id: 42 } as browser.Tabs.Tab]);
});

afterEach(() => vi.unstubAllGlobals());

describe('openObsidianUrl', () => {
	test.each([
		chromiumUA,
		'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36 Vivaldi/8.2',
	])('opens a new tab on Android Chromium, including desktop-site mode: %s', async (userAgent) => {
		vi.stubGlobal('navigator', { userAgent });
		await openObsidianUrl(url);
		expect(browser.tabs.create).toHaveBeenCalledWith({ url });
		expect(browser.tabs.query).not.toHaveBeenCalled();
		expect(browser.tabs.update).not.toHaveBeenCalled();
	});

	test.each(['mac', 'win', 'linux'] as const)('updates the active tab on desktop Chromium (%s)', async (os) => {
		vi.mocked(browser.runtime.getPlatformInfo).mockResolvedValue({ os, arch: 'x86-64' });
		await openObsidianUrl(url);
		expect(browser.tabs.update).toHaveBeenCalledWith(42, { url });
		expect(browser.tabs.create).not.toHaveBeenCalled();
	});

	test.each([
		'Mozilla/5.0 (Android 16; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0',
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
	])('preserves the active-tab handoff in other browsers: %s', async (userAgent) => {
		vi.stubGlobal('navigator', { userAgent });
		await openObsidianUrl(url);
		expect(browser.tabs.update).toHaveBeenCalledWith(42, { url });
		expect(browser.tabs.create).not.toHaveBeenCalled();
		expect(browser.runtime.getPlatformInfo).not.toHaveBeenCalled();
	});

	test('propagates new-tab failures to the message handler', async () => {
		vi.mocked(browser.tabs.create).mockRejectedValue(new Error('Cannot open URL'));
		await expect(openObsidianUrl(url)).rejects.toThrow('Cannot open URL');
		expect(browser.tabs.update).not.toHaveBeenCalled();
	});

	test('reports a missing active tab on desktop', async () => {
		vi.mocked(browser.runtime.getPlatformInfo).mockResolvedValue({ os: 'mac', arch: 'arm' });
		vi.mocked(browser.tabs.query).mockResolvedValue([]);
		await expect(openObsidianUrl(url)).rejects.toThrow('No active tab found');
		expect(browser.tabs.update).not.toHaveBeenCalled();
	});
});
