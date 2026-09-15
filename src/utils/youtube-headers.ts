const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const YOUTUBE_REFERER = 'https://www.youtube.com/';
const EXTENSION_PAGE_SCHEMES = ['moz-extension://', 'safari-web-extension://'];

export interface YouTubeRequestHeader {
	name: string;
	value?: string;
}

export interface YouTubeInnertubeRequestDetails {
	tabId?: number;
	requestHeaders?: YouTubeRequestHeader[];
}

function isExtensionPageUrl(value = ''): boolean {
	return EXTENSION_PAGE_SCHEMES.some(scheme => value.startsWith(scheme));
}

function findHeader(headers: YouTubeRequestHeader[], name: string): YouTubeRequestHeader | undefined {
	return headers.find(header => header.name.toLowerCase() === name.toLowerCase());
}

export function rewriteYouTubeInnertubeHeaders(details: YouTubeInnertubeRequestDetails): YouTubeRequestHeader[] {
	const requestHeaders = details.requestHeaders || [];

	const isFromExtension = isExtensionPageUrl(findHeader(requestHeaders, 'Origin')?.value)
		|| isExtensionPageUrl(findHeader(requestHeaders, 'Referer')?.value);
	if (!isFromExtension) return requestHeaders;

	const headers = requestHeaders.map(header => ({ ...header }));
	const setHeader = (name: string, value: string) => {
		const existing = findHeader(headers, name);
		if (existing) {
			existing.value = value;
		} else {
			headers.push({ name, value });
		}
	};
	setHeader('Origin', YOUTUBE_ORIGIN);
	setHeader('Referer', YOUTUBE_REFERER);

	return headers;
}
