import { afterEach, describe, expect, it, vi } from 'vitest';
import browser from './browser-polyfill';
import { collectPromptVariables, getActiveInterpreterModel, sendToLLM } from './interpreter';
import { generalSettings } from './storage-utils';
import { ModelConfig } from '../types/types';

describe('Codex CLI interpreter provider', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		generalSettings.interpreterImageInput = false;
		generalSettings.interpreterModel = '';
		generalSettings.models = [];
		generalSettings.providers = [];
	});

	it('routes Codex CLI providers through Native Messaging', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(61000);
		const sendNativeMessage = vi.spyOn(browser.runtime, 'sendNativeMessage').mockResolvedValue({
			ok: true,
			content: JSON.stringify({
				prompts_responses: {
					prompt_1: 'Codex response',
				},
			}),
		});

		generalSettings.providers = [{
			id: 'codex-provider',
			name: 'Codex CLI',
			baseUrl: 'native:com.obsidian_clipper.codex',
			apiKey: '',
			apiKeyRequired: false,
		}];
		const model: ModelConfig = {
			id: 'codex-model',
			name: 'Codex CLI default',
			providerId: 'codex-provider',
			providerModelId: 'default',
			enabled: true,
		};

		const result = await sendToLLM('Context', '', [{ key: 'prompt_1', prompt: 'Summarize' }], model);

		expect(sendNativeMessage).toHaveBeenCalledWith('com.obsidian_clipper.codex', {
			type: 'interpreter',
			model: '',
			promptContext: 'Context',
			promptVariables: [{ key: 'prompt_1', prompt: 'Summarize' }],
		});
		expect(result.promptResponses[0].user_response).toBe('Codex response');
	});

	it('collects unquoted prompt variables', () => {
		const promptVariables = collectPromptVariables({
			id: 'template',
			name: 'Template',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: '',
			noteContentFormat: '{{prompt:Return exactly CODEX_CLIPPER_CONNECTED.}}',
			properties: [],
		});

		expect(promptVariables).toEqual([{
			key: 'prompt_1',
			prompt: 'Return exactly CODEX_CLIPPER_CONNECTED.',
			filters: '',
		}]);
	});

	it('falls back to the first enabled interpreter model when the selected model is empty or stale', () => {
		generalSettings.interpreterModel = 'missing-model';
		generalSettings.models = [
			{ id: 'disabled-model', name: 'Disabled', providerId: 'provider', providerModelId: 'disabled', enabled: false },
			{ id: 'enabled-model', name: 'Enabled', providerId: 'provider', providerModelId: 'enabled', enabled: true },
		];

		expect(getActiveInterpreterModel('')?.id).toBe('enabled-model');
		expect(getActiveInterpreterModel('missing-model')?.id).toBe('enabled-model');
	});

	it('fails Codex native responses that do not contain prompt responses', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(183000);
		vi.spyOn(browser.runtime, 'sendNativeMessage').mockResolvedValue({
			ok: true,
			content: 'not json',
		});

		generalSettings.providers = [{
			id: 'codex-provider',
			name: 'Codex CLI',
			baseUrl: 'native:com.obsidian_clipper.codex',
			apiKey: '',
			apiKeyRequired: false,
		}];
		const model: ModelConfig = {
			id: 'codex-model',
			name: 'Codex CLI default',
			providerId: 'codex-provider',
			providerModelId: 'default',
			enabled: true,
		};

		await expect(sendToLLM('Context', '', [{ key: 'prompt_1', prompt: 'Summarize' }], model))
			.rejects.toThrow('Codex CLI response did not contain valid prompt responses.');
	});

	it('attaches the visible tab screenshot when Codex image input is enabled', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(122000);
		const sendNativeMessage = vi.spyOn(browser.runtime, 'sendNativeMessage').mockResolvedValue({
			ok: true,
			content: JSON.stringify({
				prompts_responses: {
					prompt_1: 'Image response',
				},
			}),
		});
		vi.spyOn(browser.tabs, 'get').mockResolvedValue({ windowId: 7 } as any);
		vi.spyOn(browser.tabs, 'captureVisibleTab').mockResolvedValue('data:image/jpeg;base64,abc123');

		generalSettings.interpreterImageInput = true;
		generalSettings.providers = [{
			id: 'codex-provider',
			name: 'Codex CLI',
			baseUrl: 'native:com.obsidian_clipper.codex',
			apiKey: '',
			apiKeyRequired: false,
		}];
		const model: ModelConfig = {
			id: 'codex-model',
			name: 'Codex CLI default',
			providerId: 'codex-provider',
			providerModelId: 'default',
			enabled: true,
		};

		const result = await sendToLLM('Context', '', [{ key: 'prompt_1', prompt: 'Describe the screenshot' }], model, { tabId: 3 });

		expect(browser.tabs.captureVisibleTab).toHaveBeenCalledWith(7, { format: 'jpeg', quality: 75 });
		expect(sendNativeMessage).toHaveBeenCalledWith('com.obsidian_clipper.codex', {
			type: 'interpreter',
			model: '',
			promptContext: 'Context',
			promptVariables: [{ key: 'prompt_1', prompt: 'Describe the screenshot' }],
			imageAttachments: [{ name: 'visible-tab.jpg', dataUrl: 'data:image/jpeg;base64,abc123' }],
		});
		expect(result.promptResponses[0].user_response).toBe('Image response');
	});
});
