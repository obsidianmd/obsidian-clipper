import browser from './browser-polyfill';
import { Settings } from '../types/types';

interface FetchImageResponse {
	buffer: number[];
	contentType: string;
}

interface InitiatorMapResponse {
	map: Record<string, string>;
	domMap: Record<string, string>;
}

/**
 * Fetch an image from the page context via content script message (bypasses CORS).
 * Returns the raw bytes and content-type.
 */
async function fetchImageViaContentScript(
	url: string,
	tabId: number
): Promise<FetchImageResponse> {
	const response = await browser.tabs.sendMessage(tabId, {
		action: 'fetchImage',
		url,
	}) as FetchImageResponse;

	if (!response || !response.buffer) {
		throw new Error(`fetchImage returned no data for ${url}`);
	}
	return response;
}

/**
 * Convert a byte array and content-type into a base64 data URI.
 */
function toDataUri(buffer: number[], contentType: string): string {
	const uint8 = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < uint8.length; i++) {
		binary += String.fromCharCode(uint8[i]);
	}
	const base64 = btoa(binary);
	return `data:${contentType};base64,${base64}`;
}

const CONTENT_TYPE_EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/svg+xml': 'svg',
	'image/avif': 'avif',
};

/**
 * Generate a unique filename for a saved image.
 * Uses the URL path's last segment, sanitized, with a timestamp prefix.
 */
function generateImageFilename(url: string, contentType: string): string {
	let name = '';
	try {
		const pathname = new URL(url).pathname;
		name = pathname.split('/').filter(Boolean).pop() ?? '';
	} catch {
		name = '';
	}

	// Sanitize: keep alphanumeric, hyphens, underscores, dots
	name = name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

	// Ensure a recognizable extension
	const hasKnownExt = /\.(jpe?g|png|gif|webp|svg|avif|bmp|tiff?)$/i.test(name);
	if (!hasKnownExt) {
		const ext = CONTENT_TYPE_EXT[contentType] ?? contentType.split('/')[1] ?? 'bin';
		name = name ? `${name}.${ext}` : `image.${ext}`;
	}

	return `${Date.now()}-${name}`;
}

/**
 * Save an image to the Obsidian vault via the Local REST API plugin.
 * Returns an Obsidian wiki-link: ![[folder/filename.ext]]
 */
async function saveImageViaObsidianApi(
	buffer: number[],
	contentType: string,
	url: string,
	config: Settings['obsidianApiConfig'],
	dynamicAttachmentFolder?: string
): Promise<string> {
	const filename = generateImageFilename(url, contentType);
	const attachmentFolder = dynamicAttachmentFolder
		?? config.imageSavedFolder?.trim().replace(/^\/+|\/+$/g, '')
		?? 'Images';
	const vaultPath = `${attachmentFolder}/${filename}`;

	// Encode each path segment separately so slashes are preserved
	const encodedPath = vaultPath.split('/').map(encodeURIComponent).join('/');
	const port = config.port?.trim() || '27123';
	const baseUrl = `http://127.0.0.1:${port}`;
	const apiUrl = `${baseUrl}/vault/${encodedPath}`;

	const headers: Record<string, string> = {
		'Content-Type': contentType,
	};
	if (config.apiKey) {
		headers['Authorization'] = `Bearer ${config.apiKey}`;
	}

	let response: Response;
	try {
		response = await fetch(apiUrl, {
			method: 'PUT',
			headers,
			body: new Uint8Array(buffer),
		});
	} catch (networkError) {
		const msg = networkError instanceof Error ? networkError.message : String(networkError);
		throw new Error(`Obsidian API network error: ${msg}`);
	}

	if (!response.ok) {
		let body = '';
		try { body = await response.text(); } catch { /* ignore */ }
		throw new Error(`Obsidian API returned HTTP ${response.status}: ${response.statusText}${body ? ` — ${body}` : ''}`);
	}

	return `![[${vaultPath}]]`;
}

/**
 * Resolve a markdown image URL using the initiator map obtained from the page.
 * Some pages use lazy-loading or redirects; PerformanceResourceTiming gives us the final URL.
 */
async function resolveImageUrl(
	originalUrl: string,
	tabId: number
): Promise<string> {
	try {
		const initiatorData = await browser.tabs.sendMessage(tabId, {
			action: 'getImageInitiatorMap',
		}) as InitiatorMapResponse;

		// domMap: original attribute src → resolved currentSrc
		if (initiatorData?.domMap?.[originalUrl]) {
			return initiatorData.domMap[originalUrl];
		}
		// map: final performance-tracked URL (identity map for most cases)
		if (initiatorData?.map?.[originalUrl]) {
			return initiatorData.map[originalUrl];
		}
	} catch {
		// If the content script doesn't support this action yet, fall through
	}
	return originalUrl;
}

/**
 * Process all markdown image references in the given content string.
 * Downloads or uploads each image and replaces the URL in-place.
 *
 * Per-image errors are non-fatal: the original URL is kept and a warning is logged.
 */
export async function processImages(
	markdownContent: string,
	tabId: number,
	settings: Settings,
	notePath?: string,
	noteName?: string
): Promise<string> {
	// Build dynamic attachment folder: <notePath>/Images/<noteName>
	// Falls back to static config.imageSavedFolder or 'Images'
	const sanitize = (s: string) => s.trim().replace(/^\/+|\/+$/g, '').replace(/[\\:*?"<>|]/g, '-');
	const parts = [notePath, 'Images', noteName]
		.map(s => (s ? sanitize(s) : ''))
		.filter(Boolean);
	const dynamicAttachmentFolder = parts.length > 0
		? parts.join('/')
		: (settings.obsidianApiConfig?.imageSavedFolder?.trim().replace(/^\/+|\/+$/g, '') || 'Images');

	const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	const urlCache = new Map<string, string>();

	// Collect all unique image URLs first
	const imageMatches: Array<{ fullMatch: string; alt: string; url: string }> = [];
	let match: RegExpExecArray | null;

	while ((match = imageRegex.exec(markdownContent)) !== null) {
		const [fullMatch, alt, url] = match;

		// Skip data URIs (already embedded) and non-http URLs
		if (url.startsWith('data:') || (!url.startsWith('http://') && !url.startsWith('https://'))) {
			continue;
		}

		imageMatches.push({ fullMatch, alt, url });
	}

	if (imageMatches.length === 0) {
		return markdownContent;
	}

	// Process each unique URL (deduplicated)
	const uniqueUrls = [...new Set(imageMatches.map(m => m.url))];

	await Promise.all(
		uniqueUrls.map(async (originalUrl) => {
			if (urlCache.has(originalUrl)) {
				return;
			}

			try {
				// Resolve to final URL (handles lazy-load / redirects)
				const resolvedUrl = await resolveImageUrl(originalUrl, tabId);

				// Fetch image bytes via content script
				const { buffer, contentType } = await fetchImageViaContentScript(resolvedUrl, tabId);

				let newUrl: string;

				if (settings.imageSaveMode === 'local-rest-api') {
					// Saves file to Obsidian vault via Local REST API, returns wiki-link
					newUrl = await saveImageViaObsidianApi(buffer, contentType, resolvedUrl, settings.obsidianApiConfig, dynamicAttachmentFolder);
				} else {
					// Default: base64 embed (embed mode)
					newUrl = toDataUri(buffer, contentType);
				}

				urlCache.set(originalUrl, newUrl);
			} catch (error) {
				// Keep original URL on failure
				urlCache.set(originalUrl, originalUrl);
			}
		})
	);

	// Replace all occurrences in the markdown
	return markdownContent.replace(imageRegex, (fullMatch, alt, url) => {
		const newUrl = urlCache.get(url);
		if (!newUrl || newUrl === url) return fullMatch;
		// local-rest-api mode returns a complete wiki-link — use it verbatim
		if (newUrl.startsWith('![[')) return newUrl;
		return `![${alt}](${newUrl})`;
	});
}
