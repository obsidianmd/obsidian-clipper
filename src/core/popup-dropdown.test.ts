// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type MessageListener = (request: any, sender: any, sendResponse: (response?: any) => void) => boolean | void;

const mocks = vi.hoisted(() => {
	const state: { messageListener?: MessageListener } = {};

	return {
		state,
		saveToObsidian: vi.fn(async () => {}),
		generateFrontmatter: vi.fn(async () => ''),
		incrementStat: vi.fn(async () => {}),
		setLocalStorage: vi.fn(async () => {}),
		getLocalStorage: vi.fn(async () => undefined),
		template: { name: 'Default', vault: 'Main', behavior: 'create', template: '' },
		browser: {
			runtime: {
				connect: vi.fn(),
				sendMessage: vi.fn(async ({ action }: { action: string }) => {
					if (action === 'getActiveTab') return { tabId: 1 };
					if (action === 'getTabInfo') return { success: true, tab: { id: 1, url: 'https://example.com' } };
					return {};
				}),
				onMessage: {
					addListener: vi.fn((listener: MessageListener) => {
						state.messageListener = listener;
					}),
					removeListener: vi.fn()
				}
			},
			storage: {
				local: {
					get: vi.fn(async () => ({})),
					set: vi.fn(async () => {}),
					onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
				},
				sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
				onChanged: { addListener: vi.fn(), removeListener: vi.fn() }
			},
			i18n: { getMessage: (key: string) => key }
		}
	};
});

vi.mock('../utils/browser-polyfill', () => ({ default: mocks.browser }));
vi.mock('../utils/obsidian-note-creator', () => ({
	generateFrontmatter: mocks.generateFrontmatter,
	saveToObsidian: mocks.saveToObsidian
}));
vi.mock('../utils/storage-utils', async () => {
	const actual = await vi.importActual<typeof import('../utils/storage-utils')>('../utils/storage-utils');
	return {
		...actual,
		loadSettings: vi.fn(async () => actual.generalSettings),
		getLocalStorage: mocks.getLocalStorage,
		setLocalStorage: mocks.setLocalStorage,
		incrementStat: mocks.incrementStat
	};
});
vi.mock('../managers/template-manager', () => ({
	loadTemplates: vi.fn(async () => [mocks.template]),
	createDefaultTemplate: vi.fn()
}));
vi.mock('../utils/content-extractor', () => ({
	extractPageContent: vi.fn(async () => ({ title: 'Example' })),
	initializePageContent: vi.fn()
}));
vi.mock('../utils/triggers', () => ({ findMatchingTemplate: vi.fn(), initializeTriggers: vi.fn() }));
vi.mock('../utils/browser-detection', () => ({
	addBrowserClassToHtml: vi.fn(async () => {}),
	detectBrowser: vi.fn(async () => 'chrome')
}));
vi.mock('../utils/active-tab-manager', () => ({
	isBlankPage: vi.fn(() => false),
	isValidUrl: vi.fn(() => true),
	isRestrictedUrl: vi.fn(() => false)
}));
vi.mock('../utils/i18n', () => ({
	translatePage: vi.fn(async () => {}),
	getMessage: (key: string) => key,
	setupLanguageAndDirection: vi.fn(async () => {})
}));

// The popup schedules its window close 500 ms after a successful save, so a
// previous test's timer can still be pending here.
const POPUP_CLOSE_DELAY = 500;

let windowClose: ReturnType<typeof vi.spyOn>;

// Load the popup on the given surface and return its quick clip listener, which
// runs the same handleClipObsidian save flow as the Add to Obsidian menu item.
// The DOMContentLoaded handler is captured rather than dispatched so popups
// loaded by earlier tests do not initialize a second time.
async function loadPopup(pathname: string): Promise<MessageListener> {
	window.history.replaceState({}, '', pathname);
	mocks.state.messageListener = undefined;
	vi.resetModules();

	let initialize: (() => Promise<void>) | undefined;
	const addEventListener = document.addEventListener.bind(document);
	const capture = vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
		if (type === 'DOMContentLoaded') {
			initialize = listener as () => Promise<void>;
			return;
		}
		addEventListener(type, listener, options);
	});

	await import('./popup');
	capture.mockRestore();

	await initialize!();
	await vi.waitFor(() => expect(mocks.state.messageListener).toBeTypeOf('function'));
	return mocks.state.messageListener!;
}

async function clipToObsidian(quickClip: MessageListener): Promise<{ success: boolean; error?: string }> {
	const sendResponse = vi.fn();
	quickClip({ action: 'triggerQuickClip' }, {}, sendResponse);
	await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
	return sendResponse.mock.calls[0][0];
}

async function settleWindowClose() {
	await new Promise(resolve => setTimeout(resolve, POPUP_CLOSE_DELAY + 100));
	windowClose.mockClear();
}

beforeEach(() => {
	windowClose = vi.spyOn(window, 'close').mockImplementation(() => {});
	document.body.innerHTML = `
		<div id="more-dropdown" class="menu show"></div>
		<select id="vault-select"><option value="Main" selected>Main</option></select>
		<textarea id="note-content-field">note</textarea>
		<input id="note-name-field" value="note" />
		<input id="path-name-field" value="" />
	`;
});

afterEach(() => {
	vi.restoreAllMocks();
});

it('closes an open more-actions dropdown after a successful save in the side panel', async () => {
	const quickClip = await loadPopup('/side-panel.html');

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(false);
});

it('closes an open more-actions dropdown after a successful save in the popup', async () => {
	const quickClip = await loadPopup('/popup.html');

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(false);
});

it('leaves the more-actions dropdown open when the save fails (control)', async () => {
	const quickClip = await loadPopup('/side-panel.html');
	mocks.saveToObsidian.mockRejectedValueOnce(new Error('save failed'));

	expect(await clipToObsidian(quickClip)).toEqual({ success: false, error: 'save failed' });

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(true);
});

it('saves without error when the more-actions dropdown is absent (control)', async () => {
	const quickClip = await loadPopup('/side-panel.html');
	document.getElementById('more-dropdown')?.remove();

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	expect(document.getElementById('more-dropdown')).toBeNull();
});

it('still schedules the popup window close after a successful save (control)', async () => {
	const quickClip = await loadPopup('/popup.html');
	await settleWindowClose();

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	await vi.waitFor(() => expect(windowClose).toHaveBeenCalled());
});

it('does not close the side panel window after a successful save (control)', async () => {
	const quickClip = await loadPopup('/side-panel.html');
	await settleWindowClose();

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	await new Promise(resolve => setTimeout(resolve, POPUP_CLOSE_DELAY + 100));
	expect(windowClose).not.toHaveBeenCalled();
});

it('keeps the rest of the dropdown classes when closing it after a save', async () => {
	const quickClip = await loadPopup('/side-panel.html');

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	const moreDropdown = document.getElementById('more-dropdown');
	expect(moreDropdown?.classList.contains('show')).toBe(false);
	expect(moreDropdown?.classList.contains('menu')).toBe(true);
});

it('closes the dropdown again when it is reopened for a second save', async () => {
	const quickClip = await loadPopup('/side-panel.html');

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	const moreDropdown = document.getElementById('more-dropdown');
	moreDropdown?.classList.add('show');

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	expect(moreDropdown?.classList.contains('show')).toBe(false);
});

it('leaves a closed more-actions dropdown closed after a save (control)', async () => {
	const quickClip = await loadPopup('/side-panel.html');
	document.getElementById('more-dropdown')?.classList.remove('show');

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(false);
});

it('leaves the more-actions dropdown open when storing the vault fails (control)', async () => {
	const quickClip = await loadPopup('/side-panel.html');
	mocks.setLocalStorage.mockRejectedValueOnce(new Error('storage failed'));

	expect(await clipToObsidian(quickClip)).toEqual({ success: false, error: 'storage failed' });

	expect(document.getElementById('more-dropdown')?.classList.contains('show')).toBe(true);
});

it('closes the dropdown before the popup window close is scheduled', async () => {
	const quickClip = await loadPopup('/popup.html');
	await settleWindowClose();

	let showWhenClosed: boolean | undefined;
	windowClose.mockImplementation(() => {
		showWhenClosed = document.getElementById('more-dropdown')?.classList.contains('show');
	});

	expect(await clipToObsidian(quickClip)).toEqual({ success: true });

	await vi.waitFor(() => expect(windowClose).toHaveBeenCalled());
	expect(showWhenClosed).toBe(false);
});
