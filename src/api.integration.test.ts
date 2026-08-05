// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { clip, DocumentParser } from './api';
import { Template } from './types/types';

const documentParser: DocumentParser = {
	parseFromString(html: string) {
		return new DOMParser().parseFromString(html, 'text/html');
	},
};

const articleTemplate: Template = {
	id: 'article',
	name: 'Article',
	behavior: 'create',
	noteNameFormat: '{{title}}',
	path: 'Clippings',
	noteContentFormat: '{{title}}\n\n{{content}}',
	properties: [],
};

const transcriptTemplate: Template = {
	id: 'youtube-transcript',
	name: 'YouTube transcript',
	behavior: 'create',
	noteNameFormat: '{{title}}',
	path: 'Clippings',
	noteContentFormat: '{{transcript}}',
	properties: [
		{ name: 'source', value: '{{url}}', type: 'text' },
	],
};

const captionUrl = 'https://www.youtube.com/api/timedtext?v=abc123&lang=en';
const youtubeHtml = `<!doctype html>
<html>
<head>
	<title>Async transcript fixture</title>
	<meta property="og:url" content="https://www.youtube.com/watch?v=abc123">
	<meta property="og:title" content="Async transcript fixture">
	<script type="application/ld+json">{
		"@type": "VideoObject",
		"@id": "https://www.youtube.com/watch?v=abc123",
		"name": "Async transcript fixture",
		"description": "A video with captions",
		"author": "Fixture channel"
	}</script>
	<script>var ytInitialPlayerResponse = ${JSON.stringify({
		videoDetails: { videoId: 'abc123', author: 'Fixture channel' },
		captions: {
			playerCaptionsTracklistRenderer: {
				captionTracks: [{
					baseUrl: captionUrl,
					languageCode: 'en',
					name: { simpleText: 'English' },
				}],
			},
		},
	})};</script>
</head>
<body><main><p>A video with captions</p></main></body>
</html>`;

function createFetchMock() {
	return vi.fn(async (input: string | URL | Request) => {
		const url = String(input);
		if (url === captionUrl) {
			return new Response(
				'<transcript><text start="0" dur="2">Hello from the transcript.</text><text start="2" dur="2">The second caption is here.</text></transcript>',
				{ status: 200, headers: { 'Content-Type': 'text/xml' } }
			);
		}
		return new Response('{}', {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('clip API integration', () => {
	test('extracts document metadata and article content without unnecessary requests', async () => {
		const fetchMock = createFetchMock();
		vi.stubGlobal('fetch', fetchMock);
		const html = readFileSync(join(__dirname, 'utils', 'fixtures', 'templates', 'schema-rich.html'), 'utf8');
		const result = await clip({
			html,
			url: 'https://example.com/recipe/chocolate-cake',
			template: articleTemplate,
			documentParser,
		});

		expect(result.noteName).toBe('Best Chocolate Cake Recipe');
		expect(result.content).toContain('Best Chocolate Cake Recipe');
		expect(result.content).toContain("This is the most amazing chocolate cake you'll ever make.");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('uses a supplied parsed document without invoking the parser', async () => {
		const html = readFileSync(join(__dirname, 'utils', 'fixtures', 'templates', 'schema-rich.html'), 'utf8');
		const parsedDocument = documentParser.parseFromString(html, 'text/html');
		const unusedParser: DocumentParser = {
			parseFromString: vi.fn(() => {
				throw new Error('The parser should not be called');
			}),
		};

		const result = await clip({
			html,
			url: 'https://example.com/recipe/chocolate-cake',
			template: articleTemplate,
			documentParser: unusedParser,
			parsedDocument,
		});

		expect(unusedParser.parseFromString).not.toHaveBeenCalled();
		expect(result.content).toContain("This is the most amazing chocolate cake you'll ever make.");
	});

	test('automatically resolves transcript variables with the matching extractor', async () => {
		const fetchMock = createFetchMock();
		vi.stubGlobal('fetch', fetchMock);
		const result = await clip({
			html: youtubeHtml,
			url: 'https://www.youtube.com/watch?v=abc123',
			template: transcriptTemplate,
			documentParser,
		});

		expect(result.noteName).toBe('Async transcript fixture');
		expect(result.content).toContain('Hello from the transcript.');
		expect(result.content).toContain('The second caption is here.');
		expect(fetchMock.mock.calls.some(([input]) => String(input) === captionUrl)).toBe(true);
	});
});
