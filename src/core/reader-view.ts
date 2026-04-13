import browser from '../utils/browser-polyfill';
import { Reader } from '../utils/reader';
import { initializeI18n, getMessage } from '../utils/i18n';
import { ReaderSettings } from '../types/types';
import { getFontCss } from '../utils/font-utils';
import { getDomain } from '../utils/string-utils';
import { extractContentBySelector as extractContentBySelectorShared } from '../utils/shared';
import { setPageUrl, setPageTitle, updatePageDomainSettings, getHighlights, repositionHighlights } from '../utils/highlighter';
import { throttle } from '../utils/throttle';
import { loadSettings } from '../utils/storage-utils';
import Defuddle from 'defuddle';

type MessageListener = (request: any, sender: any, sendResponse: (response?: any) => void) => true | undefined;
let readerPageMessageListener: MessageListener | null = null;

document.addEventListener('DOMContentLoaded', async () => {
	await applyReaderTheme();
	await initializeI18n();

	const params = new URLSearchParams(window.location.search);
	const url = params.get('url');

	if (!url) {
		showUrlInput();
		return;
	}

	// Show loading spinner with themed background while fetching
	document.body.innerHTML = `<div class="obsidian-reader-loading"><div class="obsidian-reader-loading-text">${getMessage('readerLoading')}</div></div>`;

	try {
		const html = await proxyFetch(url);

		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(html, 'text/html');
		Object.defineProperty(parsedDoc, 'URL', { value: url, configurable: true });

		const defuddle = new Defuddle(parsedDoc, { url, fetch: proxyFetchAsResponse });
		const result = await defuddle.parseAsync();

		if (!result.content) {
			throw new Error('Could not extract article content');
		}

		Reader.preExtractedContent = {
			content: result.content,
			title: result.title,
			author: result.author,
			published: result.published,
			domain: getDomain(url),
			wordCount: result.wordCount,
			parseTime: result.parseTime,
		};

		Reader.isReaderPage = true;
		Reader.onNavigate = navigateInReader;
		setPageUrl(url);

		// Build content behind the loading overlay
		document.body.textContent = '';

		Object.defineProperty(document, 'URL', { value: url, configurable: true });
		document.title = result.title || url;

		let baseEl = document.querySelector('base');
		if (!baseEl) {
			baseEl = document.createElement('base');
			document.head.prepend(baseEl);
		}
		baseEl.href = url;

		await Reader.apply(document);

		// Load after Reader.apply which strips unrecognized stylesheets
		const highlighterLink = document.createElement('link');
		highlighterLink.rel = 'stylesheet';
		highlighterLink.href = browser.runtime.getURL('highlighter.css');
		document.head.appendChild(highlighterLink);

		await loadSettings();

		if (result.title) {
			document.title = result.title;
			setPageTitle(result.title);
		}
		updatePageDomainSettings({ site: result.site, favicon: result.favicon });
		if (result.favicon) setFavicon(result.favicon, url);

		setupReaderPageMessageHandler(url, result);

		window.addEventListener('resize', throttle(() => repositionHighlights(), 100));

	} catch (error) {
		console.error('Failed to load page:', error);
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

// --- SPA navigation ---

async function loadArticle(newUrl: string) {
	window.scrollTo(0, 0);

	try {
		const html = await proxyFetch(newUrl);
		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(html, 'text/html');
		Object.defineProperty(parsedDoc, 'URL', { value: newUrl, configurable: true });

		// Debug: log image elements in fetched HTML
		const imgs = parsedDoc.querySelectorAll('img');
		console.log(`Found ${imgs.length} <img> elements in fetched HTML:`);
		imgs.forEach((img, i) => {
			console.log(`  img[${i}]:`, {
				src: img.getAttribute('src'),
				srcset: img.getAttribute('srcset'),
				dataSrc: img.getAttribute('data-src'),
				alt: img.getAttribute('alt'),
				loading: img.getAttribute('loading'),
			});
		});

		const defuddle = new Defuddle(parsedDoc, { url: newUrl, fetch: proxyFetchAsResponse, debug: true });
		const result = await defuddle.parseAsync();

		// Debug: check figures in fetched HTML
		const contentEl = parsedDoc.querySelector('article#story');
		if (contentEl) {
			const figures = contentEl.querySelectorAll('figure');
			const allImgs = contentEl.querySelectorAll('img');
			console.log(`article#story: ${figures.length} figures, ${allImgs.length} images`);
			figures.forEach((f: Element, i: number) => {
				const imgs = f.querySelectorAll('img');
				const caption = f.querySelector('figcaption')?.textContent?.substring(0, 80);
				console.log(`  figure[${i}]: ${imgs.length} imgs, caption: ${caption || '(none)'}`);
			});
		}
		console.log('Defuddle content images:', result.content.match(/<img[^>]*>/g));

		if (!result.content) {
			throw new Error('Could not extract article content');
		}

		Object.defineProperty(document, 'URL', { value: newUrl, configurable: true });
		document.title = result.title || newUrl;
		const baseEl = document.querySelector('base');
		if (baseEl) baseEl.href = newUrl;

		setPageUrl(newUrl);
		if (result.title) setPageTitle(result.title);
		updatePageDomainSettings({ site: result.site, favicon: result.favicon });
		if (result.favicon) setFavicon(result.favicon, newUrl);

		await Reader.updateReaderContent(document, {
			content: result.content,
			title: result.title,
			author: result.author,
			published: result.published,
			domain: getDomain(newUrl),
			wordCount: result.wordCount,
			parseTime: result.parseTime,
		});

		setupReaderPageMessageHandler(newUrl, result);
	} catch (error) {
		console.error('Failed to navigate:', error);
	}
}

function setFavicon(faviconUrl: string, pageUrl: string) {
	let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
	if (!link) {
		link = document.createElement('link');
		link.rel = 'icon';
		document.head.appendChild(link);
	}
	try {
		link.href = new URL(faviconUrl, pageUrl).href;
	} catch {
		link.href = faviconUrl;
	}
}

function navigateInReader(newUrl: string) {
	const readerUrl = browser.runtime.getURL('reader.html?url=' + encodeURIComponent(newUrl));
	history.pushState(null, '', readerUrl);
	loadArticle(newUrl);
}

window.addEventListener('popstate', () => {
	const params = new URLSearchParams(window.location.search);
	const url = params.get('url');
	if (url) loadArticle(url);
});

function showUrlInput() {
	document.body.innerHTML = '';

	const nav = document.createElement('nav');
	nav.className = 'reader-nav';
	const highlightsLink = document.createElement('a');
	highlightsLink.className = 'reader-nav-link';
	highlightsLink.href = browser.runtime.getURL('highlights.html');
	highlightsLink.textContent = getMessage('highlights') || 'Highlights';
	nav.appendChild(highlightsLink);
	document.body.appendChild(nav);

	const wrapper = document.createElement('div');
	wrapper.className = 'reader-url-input-wrapper';

	const input = document.createElement('input');
	input.type = 'url';
	input.className = 'reader-url-input';
	input.placeholder = getMessage('readerUrlPlaceholder') || 'Paste a URL to read…';
	input.autofocus = true;

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			const value = input.value.trim();
			if (value) {
				let url = value;
				if (!/^https?:\/\//i.test(url)) {
					url = 'https://' + url;
				}
				window.location.href = browser.runtime.getURL('reader.html?url=' + encodeURIComponent(url));
			}
		}
	});

	wrapper.appendChild(input);
	document.body.appendChild(wrapper);
	input.focus();
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

// Handle messages from the clipper iframe via the background's
// extensionPageMessage forwarding (content scripts can't run on extension pages).
async function setupReaderPageMessageHandler(articleUrl: string, defuddleResult: any) {
	const currentTab = await browser.tabs.getCurrent();
	const myTabId = currentTab?.id;

	const cachedContent = {
		content: defuddleResult.content || '',
		title: defuddleResult.title || '',
		author: defuddleResult.author || '',
		description: defuddleResult.description || '',
		domain: getDomain(articleUrl),
		extractedContent: defuddleResult.variables || {},
		favicon: defuddleResult.favicon || '',
		fullHtml: defuddleResult.content || '',
		image: defuddleResult.image || '',
		language: defuddleResult.language || '',
		parseTime: defuddleResult.parseTime || 0,
		published: defuddleResult.published || '',
		schemaOrgData: defuddleResult.schemaOrgData || {},
		selectedHtml: '',
		site: defuddleResult.site || '',
		wordCount: defuddleResult.wordCount || 0,
		metaTags: defuddleResult.metaTags || [],
	};

	if (readerPageMessageListener) {
		browser.runtime.onMessage.removeListener(readerPageMessageListener);
	}

	readerPageMessageListener = (request: any, _sender: any, sendResponse: (response?: any) => void): true | undefined => {
		if (request.action !== 'extensionPageMessage' || request.targetTabId !== myTabId) {
			return undefined;
		}

		const message = request.message;

		if (message.action === 'ping') {
			sendResponse({});
			return true;
		}

		if (message.action === 'getPageContent') {
			sendResponse({ ...cachedContent, highlights: getHighlights() });
			return true;
		}

		if (message.action === 'extractContent') {
			const content = extractContentBySelectorShared(document, message.selector, message.attribute, message.extractHtml);
			sendResponse({ content });
			return true;
		}

		if (message.action === 'toggle-iframe') {
			Reader.toggleReaderPageIframe(document);
			sendResponse({ success: true });
			return true;
		}

		if (message.action === 'getReaderModeState') {
			sendResponse({ isActive: true });
			return true;
		}

		return undefined;
	};

	browser.runtime.onMessage.addListener(readerPageMessageListener);
}
