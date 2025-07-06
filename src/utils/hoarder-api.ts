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

export async function testConnection(): Promise<{ ok: boolean; user?: HoarderUser }> {
    if (!generalSettings.hoarderServerUrl || !generalSettings.hoarderApiKey) {
        throw new Error('Hoarder server URL and API key must be configured');
    }

    try {
        const response = await browser.runtime.sendMessage({
            action: 'hoarderRequest',
            method: 'GET',
            url: `${generalSettings.hoarderServerUrl}/api/v1/users/me`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${generalSettings.hoarderApiKey}`
            }
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

export async function saveToHoarder(
    title: string,
    url: string,
    content: string,
    html: string,
    tags: string[] = [],
    highlights: Array<{text: string, notes?: string[]}> = []
): Promise<void> {
    if (!generalSettings.hoarderServerUrl || !generalSettings.hoarderApiKey) {
        throw new Error('Hoarder server URL and API key must be configured');
    }

    // First create the bookmark
    const bookmark: HoarderBookmark = {
        title,
        url,
        type: 'link',
        archived: false,
        favourited: false,
        note: content,
        // summary: content.slice(0, 500) // Use first 500 chars as summary
    };

    const response = await browser.runtime.sendMessage({
        action: 'hoarderRequest',
        method: 'POST',
        url: `${generalSettings.hoarderServerUrl}/api/v1/bookmarks`,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${generalSettings.hoarderApiKey}`
        },
        body: bookmark
    }) as HoarderResponse<HoarderBookmark & { id: string }>;

    if (!response.ok) {
        const error = response.error || response.statusText;
        console.error('Failed to save bookmark:', response.status, response.statusText, error);
        throw new Error(`Failed to save to Hoarder: ${error}`);
    }

    // Get the created bookmark ID
    const bookmarkData = response.data;
    const bookmarkId = bookmarkData?.id;

    if (!bookmarkId) {
        throw new Error('Failed to get bookmark ID from response');
    }

    // Add highlights if they exist
    if (highlights.length > 0) {
        for (const highlight of highlights) {
            const highlightData = {
                bookmarkId,
                text: highlight.text,
                note: highlight.notes ? highlight.notes.join('\n') : undefined,
                color: 'yellow' // Default color
            };

            const highlightResponse = await browser.runtime.sendMessage({
                action: 'hoarderRequest',
                method: 'POST',
                url: `${generalSettings.hoarderServerUrl}/api/v1/highlights`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${generalSettings.hoarderApiKey}`
                },
                body: highlightData
            }) as HoarderResponse<unknown>;

            if (!highlightResponse.ok) {
                const error = highlightResponse.error || highlightResponse.statusText;
                console.error('Failed to save highlight:', highlightResponse.status, highlightResponse.statusText, error);
            }
        }
    }
} 