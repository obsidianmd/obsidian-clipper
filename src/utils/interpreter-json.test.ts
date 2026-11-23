// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { sendToLLM } from './interpreter';
import { generalSettings } from './storage-utils';
import type { ModelConfig, PromptVariable, Provider } from '../types/types';

const provider: Provider = {
	id: 'local-openai',
	name: 'Local OpenAI',
	baseUrl: 'http://localhost:1234/v1/chat/completions',
	apiKey: '',
	apiKeyRequired: false,
};

const model: ModelConfig = {
	id: 'test-model',
	providerId: provider.id,
	providerModelId: 'test-model',
	name: 'Test model',
	enabled: true,
};

const promptVariables: PromptVariable[] = [
	{
		key: 'prompt_1',
		prompt: 'Create the test Markdown',
	},
];

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	generalSettings.providers = [];
});

describe('Interpreter JSON responses', () => {
	test('parses pretty-printed JSON without leaking escape sequences', async () => {
		const expected = [
			'# Test',
			'',
			'- "hello"',
			'- "small reversible test"',
			'- "delve" "pivotal"',
			'',
			'[Link](https://example.com)',
		].join('\n');

		const prettyContent = JSON.stringify(
			{
				prompts_responses: {
					prompt_1: expected,
				},
			},
			null,
			2,
		);

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({
					choices: [
						{
							message: {
								content: prettyContent,
							},
							finish_reason: 'stop',
						},
					],
				}),
		});

		vi.stubGlobal('fetch', fetchMock);
		generalSettings.providers = [provider];

		const result = await sendToLLM(
			'',
			'',
			promptVariables,
			model,
		);

		expect(result.promptResponses[0].user_response).toBe(expected);
	});
	test('parses pretty-printed JSON inside a markdown code fence', async () => {
		const expected = [
			'# Test',
			'',
			'- "hello"',
			'- "small reversible test"',
			'- "delve" "pivotal"',
			'',
			'[Link](https://example.com)',
		].join('\n');

		const prettyContent = JSON.stringify(
			{
				prompts_responses: {
					prompt_1: expected,
				},
			},
			null,
			2,
		);

		const fencedContent = `\`\`\`json
${prettyContent}
\`\`\``;

		vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: async () =>
				JSON.stringify({
					choices: [
						{
							message: {
								content: fencedContent,
							},
							finish_reason: 'stop',
						},
					],
				}),
		});

		vi.stubGlobal('fetch', fetchMock);
		generalSettings.providers = [provider];

		const result = await sendToLLM(
			'',
			'',
			promptVariables,
			model,
		);

		expect(result.promptResponses[0].user_response).toBe(expected);
	});
});
