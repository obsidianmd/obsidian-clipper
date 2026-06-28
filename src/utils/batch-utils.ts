export interface ParsedBatchUrls {
	urls: string[];
	rejected: string[];
}

export function parseBatchUrls(raw: string): ParsedBatchUrls {
	const urls: string[] = [];
	const rejected: string[] = [];
	const seen = new Set<string>();
	const parts = raw
		.split(/\r?\n/)
		.map(part => part.trim())
		.filter(Boolean);

	for (const part of parts) {
		if (/\s/.test(part)) {
			rejected.push(part);
			continue;
		}
		const candidate = /^[a-z][a-z\d+\-.]*:\/\//i.test(part) ? part : `https://${part}`;
		try {
			const parsed = new URL(candidate);
			if (!['http:', 'https:'].includes(parsed.protocol)) {
				rejected.push(part);
				continue;
			}
			const normalized = parsed.href;
			if (!seen.has(normalized)) {
				seen.add(normalized);
				urls.push(normalized);
			}
		} catch {
			rejected.push(part);
		}
	}

	return { urls, rejected };
}

export function formatBatchDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
