import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const projectRoot = resolve(__dirname, '..');
const cliPath = join(projectRoot, 'dist', 'cli.cjs');
let testDirectory = '';

beforeAll(() => {
	execFileSync(process.execPath, [join(projectRoot, 'scripts', 'build-cli.mjs')], {
		cwd: projectRoot,
		stdio: 'pipe',
	});
	testDirectory = mkdtempSync(join(tmpdir(), 'obsidian-clipper-cli-test-'));
});

afterAll(() => {
	if (testDirectory) {
		rmSync(testDirectory, { recursive: true, force: true });
	}
});

describe('CLI integration', () => {
	test('automatically performs required follow-up requests in URL and HTML modes', () => {
		const sourceUrl = 'https://www.youtube.com/watch?v=abc123';
		const captionUrl = 'https://www.youtube.com/api/timedtext?v=abc123&lang=en';
		const htmlPath = join(testDirectory, 'youtube.html');
		const templatePath = join(testDirectory, 'youtube-template.json');
		const preloadPath = join(testDirectory, 'mock-fetch.cjs');
		const playerResponse = JSON.stringify({
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
		});

		writeFileSync(htmlPath, `<!doctype html>
<html>
<head>
	<title>Automatic extraction fixture</title>
	<meta property="og:url" content="${sourceUrl}">
	<meta property="og:title" content="Automatic extraction fixture">
	<script type="application/ld+json">{
		"@type": "VideoObject",
		"@id": "${sourceUrl}",
		"name": "Automatic extraction fixture",
		"description": "A video with captions"
	}</script>
	<script>var ytInitialPlayerResponse = ${playerResponse};</script>
</head>
<body><main><p>A video with captions</p></main></body>
</html>`);
		writeFileSync(templatePath, JSON.stringify({
			id: 'youtube-transcript',
			name: 'YouTube transcript',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings',
			noteContentFormat: '{{transcript}}',
			properties: [],
		}, null, 2));
		writeFileSync(preloadPath, `
const fs = require('fs');
globalThis.fetch = async (input) => {
	const url = String(input);
	fs.appendFileSync(process.env.FETCH_LOG, url + '\\n');
	if (url === process.env.SOURCE_URL) {
		return new Response(fs.readFileSync(process.env.MOCK_HTML, 'utf8'), {
			status: 200,
			headers: { 'Content-Type': 'text/html' },
		});
	}
	if (url === process.env.CAPTION_URL) {
		return new Response('<transcript><text start="0" dur="2">Automatically extracted transcript.</text></transcript>', {
			status: 200,
			headers: { 'Content-Type': 'text/xml' },
		});
	}
	return new Response('{}', {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
};
`);

		const runCli = (name: string, args: string[]) => {
			const outputPath = join(testDirectory, `${name}.md`);
			const fetchLogPath = join(testDirectory, `${name}.requests`);
			const processResult = spawnSync(process.execPath, [
				'--require', preloadPath,
				cliPath,
				...args,
				'--template', templatePath,
				'--output', outputPath,
			], {
				cwd: projectRoot,
				encoding: 'utf8',
				env: {
					...process.env,
					CAPTION_URL: captionUrl,
					FETCH_LOG: fetchLogPath,
					MOCK_HTML: htmlPath,
					SOURCE_URL: sourceUrl,
				},
			});
			const requests = existsSync(fetchLogPath)
				? readFileSync(fetchLogPath, 'utf8').split('\n').filter(Boolean)
				: [];
			const output = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '';
			return { processResult, requests, output };
		};

		const htmlResult = runCli('html', [sourceUrl, '--html', htmlPath]);
		expect(htmlResult.processResult.status).toBe(0);
		expect(htmlResult.requests).toContain(captionUrl);
		expect(htmlResult.output).toContain('Automatically extracted transcript.');

		const urlResult = runCli('url', [sourceUrl]);
		expect(urlResult.processResult.status).toBe(0);
		expect(urlResult.requests).toContain(sourceUrl);
		expect(urlResult.requests).toContain(captionUrl);
		expect(urlResult.output).toContain('Automatically extracted transcript.');
	});

	test('matches a schema template and extracts the article', () => {
		const templatesDirectory = join(testDirectory, 'templates');
		const htmlPath = join(testDirectory, 'article.html');
		const outputPath = join(testDirectory, 'article.md');
		mkdirSync(templatesDirectory);

		writeFileSync(join(templatesDirectory, 'article.json'), JSON.stringify({
			id: 'article',
			name: 'Article',
			behavior: 'create',
			noteNameFormat: '{{title}}',
			path: 'Clippings',
			noteContentFormat: '# {{title}}\n\n{{content}}',
			properties: [
				{ name: 'source', value: '{{url}}', type: 'text' },
			],
			triggers: ['schema:@Article'],
		}, null, 2));

		writeFileSync(htmlPath, `<!doctype html>
<html>
<head>
	<title>Schema matched article</title>
	<meta name="description" content="A controlled article for CLI extraction.">
	<script type="application/ld+json">{
		"@type": "Article",
		"headline": "Schema matched article"
	}</script>
</head>
<body>
	<main>
		<article>
			<h1>Schema matched article</h1>
			<p>This controlled article verifies that schema template matching and content extraction both receive a complete document. It contains enough readable prose for the extractor to identify the article body and preserve it in the generated Markdown note. The test invokes the built command line bundle with a local HTML file, a template directory, and a real output path. A successful run preserves headings, paragraphs, metadata, and links instead of returning an empty document with a successful exit status.</p>
			<p>The generated note must retain this second paragraph after schema matching completes. Additional prose keeps the fixture above article detection thresholds without relying on remote pages, authentication, browser state, or changing third-party layouts. This integration test protects the observable command line contract while the separate end-to-end validation exercises live websites.</p>
		</article>
	</main>
</body>
</html>`);

		const processResult = spawnSync(process.execPath, [
			cliPath,
			'https://example.com/schema-article',
			'--template', templatesDirectory,
			'--html', htmlPath,
			'--output', outputPath,
		], {
			cwd: projectRoot,
			encoding: 'utf8',
		});

		expect(processResult.status).toBe(0);
		expect(processResult.stderr).toContain('Matched template:');
		expect(processResult.stderr).toContain('Written to');

		const output = readFileSync(outputPath, 'utf8');
		expect(output).toContain('# Schema matched article');
		expect(output).toContain('This controlled article verifies');
		expect(output).toContain('The generated note must retain this second paragraph');
	});
});
