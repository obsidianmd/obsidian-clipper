import browser from '../utils/browser-polyfill';
import { Reader } from '../utils/reader';
import { initializeI18n, getMessage } from '../utils/i18n';
import { ReaderSettings } from '../types/types';
import Defuddle from 'defuddle';
import DOMPurify from 'dompurify';

document.addEventListener('DOMContentLoaded', async () => {
	await applyThemeEarly();
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
		// Fetch page HTML via background proxy (works cross-browser)
		const html = await proxyFetch(url);

		// Parse with DOMParser — scripts never execute in this context
		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(html, 'text/html');
		Object.defineProperty(parsedDoc, 'URL', { value: url, configurable: true });

		// Run Defuddle locally on the parsed document, with fetch proxied
		// through the background script to avoid CORS/header restrictions
		const defuddle = new Defuddle(parsedDoc, { url, fetch: proxyFetchAsResponse });
		const result = await defuddle.parseAsync();

		if (!result.content) {
			throw new Error('Could not extract article content');
		}

		// Build a clean document with just the Defuddle output
		document.body.style.visibility = 'hidden';
		document.body.textContent = '';

		Object.defineProperty(document, 'URL', { value: url, configurable: true });
		document.title = result.title || url;

		// Add metadata for Reader
		if (result.title) {
			const meta = document.createElement('meta');
			meta.setAttribute('property', 'og:title');
			meta.setAttribute('content', result.title);
			document.head.appendChild(meta);
		}
		if (result.author) {
			const meta = document.createElement('meta');
			meta.setAttribute('name', 'author');
			meta.setAttribute('content', result.author);
			document.head.appendChild(meta);
		}
		if (result.published) {
			const meta = document.createElement('meta');
			meta.setAttribute('property', 'article:published_time');
			meta.setAttribute('content', result.published);
			document.head.appendChild(meta);
		}

		// Set base URL for relative resources
		const baseEl = document.createElement('base');
		baseEl.href = url;
		document.head.prepend(baseEl);

		// Insert sanitized content
		const article = document.createElement('article');
		article.innerHTML = DOMPurify.sanitize(result.content);
		document.body.appendChild(article);

		// Let Reader build the full UI
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

// fetch() API-compatible proxy through the background script.
// Supports custom headers (e.g. User-Agent for YouTube innertube).
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
		// Firefox MV3: host permissions need explicit user grant
		const granted = await browser.permissions.request({ origins: ['<all_urls>'] });
		if (granted) {
			// Retry after permission granted
			const retry = await browser.runtime.sendMessage({
				action: 'fetchProxy', url, options: {},
			}) as { ok: boolean; status: number; text: string; error?: string };
			if (retry?.ok) return retry.text;
			throw new Error(retry?.error || `HTTP ${retry?.status}`);
		}
		throw new Error('Permission not granted. Please allow access to all websites in the extension settings.');
	}

	if (!result?.ok) throw new Error(result?.error || `HTTP ${result?.status}`);
	return result.text;
}

async function applyThemeEarly() {
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
