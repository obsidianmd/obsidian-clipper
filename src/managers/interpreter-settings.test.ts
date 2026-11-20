// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const stored: Record<string, unknown> = {};

vi.mock('../utils/storage-utils', () => ({
	generalSettings: {},
	loadSettings: async () => {},
	saveSettings: async () => {},
	getLocalStorage: async (key: string) => stored[key],
	setLocalStorage: async (key: string, value: unknown) => { stored[key] = value; },
}));

const savedPresets = { version: '1', openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1/chat/completions' } };
const remotePresets = { version: '2', anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1/messages' } };

async function loadModule() {
	vi.resetModules();
	return import('./interpreter-settings');
}

beforeEach(() => {
	for (const key of Object.keys(stored)) delete stored[key];
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

it('returns saved presets without waiting for the network, then saves the fetched ones', async () => {
	stored.provider_presets = savedPresets;
	let respond: (response: Response) => void = () => {};
	const fetchMock = vi.fn(() => new Promise<Response>(resolve => { respond = resolve; }));
	vi.stubGlobal('fetch', fetchMock);
	const { getPresetProviders } = await loadModule();

	const presets = await getPresetProviders();

	expect(Object.keys(presets)).toEqual(['openai']);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	respond(new Response(JSON.stringify(remotePresets)));
	await vi.waitFor(() => expect(stored.provider_presets).toMatchObject(remotePresets));
	expect(Object.keys(await getPresetProviders())).toEqual(['anthropic']);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('gives up on a stalled fetch when nothing is saved', async () => {
	vi.useFakeTimers();
	vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
	})));
	const { getPresetProviders } = await loadModule();

	const presets = getPresetProviders();
	await vi.advanceTimersByTimeAsync(5000);

	expect(await presets).toEqual({});
});
