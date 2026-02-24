export function isValidHighlightTimestamp(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function parseHighlightIdTimestamp(id: unknown): number | undefined {
	if (typeof id !== 'string') {
		return undefined;
	}

	const parsedIdTimestamp = Number.parseInt(id, 10);
	return Number.isFinite(parsedIdTimestamp) && parsedIdTimestamp > 0
		? parsedIdTimestamp
		: undefined;
}

// Picks the first valid timestamp candidate; falls back to now for legacy/invalid data.
export function resolveHighlightCreatedAt(...candidates: Array<number | undefined>): number {
	for (const candidate of candidates) {
		if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
			return candidate;
		}
	}

	return Date.now();
}

export function normalizeHighlightCreatedAt(createdAt: unknown, highlightId: unknown): number {
	return resolveHighlightCreatedAt(
		isValidHighlightTimestamp(createdAt) ? createdAt : undefined,
		parseHighlightIdTimestamp(highlightId)
	);
}
