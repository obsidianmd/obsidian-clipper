import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { buildVariables, BuildVariablesParams } from './shared';
import { compileTemplate } from './template-compiler';

const FROZEN_DATE = new Date('2025-01-15T12:00:00Z');

beforeAll(() => { vi.useFakeTimers({ now: FROZEN_DATE }); });
afterAll(() => { vi.useRealTimers(); });

function makeParams(overrides: Partial<BuildVariablesParams> = {}): BuildVariablesParams {
	return {
		title: 'Test Title',
		author: 'Test Author',
		content: 'markdown body',
		contentHtml: '<p>html body</p>',
		url: 'https://example.com/page',
		fullHtml: '<html></html>',
		description: 'A description',
		favicon: 'https://example.com/favicon.ico',
		image: 'https://example.com/image.png',
		published: '2024-01-15',
		site: 'Example',
		language: 'en',
		wordCount: 42,
		...overrides,
	};
}

describe('compileTemplate', () => {
	test('keeps date-only format when date is concatenated with text', async () => {
		const variables = buildVariables(makeParams());

		const result = await compileTemplate(
			0,
			'clips/{{date}}-{{title}}',
			variables,
			'https://example.com/page'
		);

		expect(result).toBe('clips/2025-01-15-Test Title');
	});
});
