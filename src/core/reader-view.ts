import browser from '../utils/browser-polyfill';
import { Reader } from '../utils/reader';
import { initializeI18n, getMessage } from '../utils/i18n';
import { ReaderSettings } from '../types/types';
import { getFontCss } from '../utils/font-utils';
import { getDomain } from '../utils/string-utils';
import Defuddle from 'defuddle';

document.addEventListener('DOMContentLoaded', async () => {
	await applyReaderTheme();
	await initializeI18n();

	const params = new URLSearchParams(window.location.search);
	const url = params.get('url');

	if (!url) {
		document.body.textContent = 'No URL provided';
		return;
	}

	// Show loading spinner
	document.body.innerHTML = `<div class="obsidian-reader-loading"><div class="obsidian-reader-loading-text">${getMessage('readerLoading')}</div></div>`;

	try {
		// Fetch page HTML via background proxy
		const html = await proxyFetch(url);

		// Parse with DOMParser — scripts never execute
		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(html, 'text/html');
		Object.defineProperty(parsedDoc, 'URL', { value: url, configurable: true });

		// Run Defuddle once with proxied fetch
		const defuddle = new Defuddle(parsedDoc, { url, fetch: proxyFetchAsResponse });
		const result = await defuddle.parseAsync();

		if (!result.content) {
			throw new Error('Could not extract article content');
		}

		// Set pre-extracted content so Reader.apply skips re-extraction
		Reader.preExtractedContent = {
			content: result.content,
			title: result.title,
			author: result.author,
			published: result.published,
			domain: getDomain(url),
			wordCount: result.wordCount,
			parseTime: result.parseTime,
		};

		// Build document for Reader.apply
		document.body.style.visibility = 'hidden';
		document.body.textContent = '';

		Object.defineProperty(document, 'URL', { value: url, configurable: true });
		document.title = result.title || url;

		// Set base URL for relative resources
		let baseEl = document.querySelector('base');
		if (!baseEl) {
			baseEl = document.createElement('base');
			document.head.prepend(baseEl);
		}
		baseEl.href = url;

		// Reader.apply builds the full UI (outline, settings bar, transcript,
		// code highlighting, etc.) using our pre-extracted content
		await Reader.apply(document);

		if (result.title) {
			document.title = result.title;
		}

		document.body.style.visibility = '';

	} catch (error) {
		console.error('Failed to load page:', error);
		document.body.style.visibility = '';
		document.body.innerHTML = `<div class="obsidian-reader-loading"><div class="obsidian-reader-loading-text">Failed to load article</div></div>`;
	}
});

// --- Fetch helpers ---

async function proxyFetchAsResponse(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const url = typeof input === 'string' ? input
		: input instanceof URL ? input.toString()
		: input.url;

	const options: Record<string, unknown> = {};
	if (init?.method) options.method = init.method;
	if (init?.body && typeof init.body === 'string') options.body = init.body;
	if (init?.headers) {
		if (init.headers instanceof Headers) {
			options.headers = Object.fromEntries((init.headers as any).entries());
		} else if (typeof init.headers === 'object') {
			options.headers = { ...(init.headers as Record<string, string>) };
		}
	}

	const result = await browser.runtime.sendMessage({
		action: 'fetchProxy', url, options,
	}) as { ok: boolean; status: number; text: string; error?: string };

	if (result?.error) throw new Error(result.error);

	return new Response(result.text, {
		status: result.status,
		statusText: result.ok ? 'OK' : '',
		headers: { 'Content-Type': 'text/plain' },
	});
}

async function proxyFetch(url: string): Promise<string> {
	const result = await browser.runtime.sendMessage({
		action: 'fetchProxy', url, options: {},
	}) as { ok: boolean; status: number; text: string; error?: string };

	if (result?.error === 'CORS_PERMISSION_NEEDED') {
		const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
		if (granted) {
			const retry = await browser.runtime.sendMessage({
				action: 'fetchProxy', url, options: {},
			}) as { ok: boolean; status: number; text: string; error?: string };
			if (retry?.ok) return retry.text;
			throw new Error(retry?.error || `HTTP ${retry?.status}`);
		}
		throw new Error('Permission not granted.');
	}

	if (!result?.ok) throw new Error(result?.error || `HTTP ${result?.status}`);
	return result.text;
}

// --- Reader theme ---

async function applyReaderTheme() {
	try {
		const data = await browser.storage.sync.get('reader_settings');
		const settings = data.reader_settings as ReaderSettings | undefined;

		const html = document.documentElement;
		html.classList.add('obsidian-reader-active');

		const isDark = settings
			? settings.appearance === 'dark' || (settings.appearance === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
			: window.matchMedia('(prefers-color-scheme: dark)').matches;
		html.classList.add(isDark ? 'theme-dark' : 'theme-light');

		if (settings) {
			const effectiveTheme = isDark && settings.darkTheme !== 'same' ? settings.darkTheme : settings.lightTheme;
			if (effectiveTheme && effectiveTheme !== 'default') {
				html.setAttribute('data-reader-theme', effectiveTheme);
			}
		}
	} catch {
		document.documentElement.classList.add('obsidian-reader-active');
		document.documentElement.classList.add(
			window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light'
		);
	}
}
