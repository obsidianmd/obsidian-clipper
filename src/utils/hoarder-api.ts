import { generalSettings } from './storage-utils';
import browser from './browser-polyfill';

interface HoarderBookmark {
    title: string;
    url: string;
    archived?: boolean;
    favourited?: boolean;
    note?: string;
    summary?: string;
    type?: string;
    precrawledArchiveId?: string;
}

interface HoarderUser {
    id: string;
    email: string;
    name?: string;
}

interface HoarderResponse<T> {
    ok: boolean;
    status?: number;
    statusText?: string;
    error?: string;
    data?: T;
}

interface HoarderHighlight {
    id: string;
}

interface HoarderBookmarkWithContent {
    content?: {
        htmlContent?: string;
    };
}

function hoarderHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${generalSettings.hoarderApiKey}`
    };
}

function assertHoarderConfigured(): void {
    if (!generalSettings.hoarderEnabled || !generalSettings.hoarderServerUrl || !generalSettings.hoarderApiKey) {
        throw new Error('Hoarder server URL and API key must be configured');
    }
}

export async function testConnection(): Promise<{ ok: boolean; user?: HoarderUser }> {
    if (!generalSettings.hoarderServerUrl || !generalSettings.hoarderApiKey) {
        throw new Error('Hoarder server URL and API key must be configured');
    }

    try {
        const response = await browser.runtime.sendMessage({
            action: 'hoarderRequest',
            method: 'GET',
            url: `${generalSettings.hoarderServerUrl}/api/v1/users/me`,
            headers: hoarderHeaders()
        }) as HoarderResponse<HoarderUser>;

        if (!response.ok) {
            console.error('Hoarder connection test failed:', response.status, response.statusText);
            return { ok: false };
        }

        return { ok: true, user: response.data };
    } catch (error) {
        console.error('Failed to test Hoarder connection:', error);
        return { ok: false };
    }
}

export async function getHoarderBookmarkIdByUrl(url: string): Promise<string | null> {
    assertHoarderConfigured();

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: 'GET',
        url: `${generalSettings.hoarderServerUrl}/api/v1/bookmarks/check-url?url=${encodeURIComponent(url)}`,
        headers: hoarderHeaders()
    }) as HoarderResponse<{ bookmarkId: string | null }>;

    if (!response.ok) {
        throw new Error(response.error || response.statusText || 'Failed to check Hoarder bookmark URL');
    }

    return response.data?.bookmarkId ?? null;
}

export async function getHoarderBookmarkHtmlContent(bookmarkId: string): Promise<string | null> {
    assertHoarderConfigured();

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: 'GET',
        url: `${generalSettings.hoarderServerUrl}/api/v1/bookmarks/${bookmarkId}?includeContent=true`,
        headers: hoarderHeaders()
    }) as HoarderResponse<HoarderBookmarkWithContent>;

    if (!response.ok) {
        throw new Error(response.error || response.statusText || 'Failed to get Hoarder bookmark content');
    }

    return response.data?.content?.htmlContent ?? null;
}

export async function deleteHoarderHighlight(highlightId: string): Promise<void> {
    assertHoarderConfigured();

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: 'DELETE',
        url: `${generalSettings.hoarderServerUrl}/api/v1/highlights/${highlightId}`,
        headers: hoarderHeaders()
    }) as HoarderResponse<unknown>;

    if (!response.ok && response.status !== 404) {
        throw new Error(response.error || response.statusText || 'Failed to delete Hoarder highlight');
    }
}

export async function createHoarderHighlight(params: {
    bookmarkId: string;
    text: string;
    note?: string;
    startOffset: number;
    endOffset: number;
}): Promise<string | null> {
    assertHoarderConfigured();

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: 'POST',
        url: `${generalSettings.hoarderServerUrl}/api/v1/highlights`,
        headers: hoarderHeaders(),
        body: {
            bookmarkId: params.bookmarkId,
            startOffset: params.startOffset,
            endOffset: params.endOffset,
            text: params.text,
            note: params.note ?? null,
            color: 'yellow'
        }
    }) as HoarderResponse<HoarderHighlight>;

    if (!response.ok) {
        throw new Error(response.error || response.statusText || 'Failed to create Hoarder highlight');
    }

    return response.data?.id ?? null;
}

export async function saveToHoarder(
    title: string,
    url: string,
    content: string,
    html: string,
    tags: string[] = [],
    highlights: Array<{text: string, notes?: string[]}> = []
): Promise<void> {
    assertHoarderConfigured();

    const bookmark: HoarderBookmark = {
        title,
        url,
        type: 'link',
        archived: false,
        favourited: false,
        note: content,
    };

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: 'POST',
        url: `${generalSettings.hoarderServerUrl}/api/v1/bookmarks`,
        headers: hoarderHeaders(),
        body: bookmark
    }) as HoarderResponse<HoarderBookmark & { id: string }>;

    if (!response.ok) {
        const error = response.error || response.statusText;
        console.error('Failed to save bookmark:', response.status, response.statusText, error);
        throw new Error(`Failed to save to Hoarder: ${error}`);
    }

    const bookmarkId = response.data?.id;
    if (!bookmarkId) {
        throw new Error('Failed to get bookmark ID from response');
    }

    for (const highlight of highlights) {
        try {
            await createHoarderHighlight({
                bookmarkId,
                text: highlight.text,
                note: highlight.notes?.join('\n'),
                startOffset: 0,
                endOffset: highlight.text.length
            });
        } catch (error) {
            console.error('Failed to save highlight:', error);
        }
    }
} 