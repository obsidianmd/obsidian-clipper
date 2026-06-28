import { describe, expect, it } from 'vitest';
import { formatBatchDuration, parseBatchUrls } from './batch-utils';

describe('parseBatchUrls', () => {
	it('accepts one URL per line and normalizes missing protocols', () => {
		const result = parseBatchUrls('example.com\nhttps://obsidian.md/path');

		expect(result.urls).toEqual([
			'https://example.com/',
			'https://obsidian.md/path'
		]);
		expect(result.rejected).toEqual([]);
	});

	it('deduplicates URLs and rejects unsupported protocols', () => {
		const result = parseBatchUrls('https://example.com\nhttps://example.com/\nftp://example.com/file');

		expect(result.urls).toEqual(['https://example.com/']);
		expect(result.rejected).toEqual(['ftp://example.com/file']);
	});

	it('does not split URLs on spaces within a line', () => {
		const result = parseBatchUrls('https://example.com/article one');

		expect(result.urls).toEqual([]);
		expect(result.rejected).toEqual(['https://example.com/article one']);
	});
});

describe('formatBatchDuration', () => {
	it('formats milliseconds as mm:ss', () => {
		expect(formatBatchDuration(0)).toBe('00:00');
		expect(formatBatchDuration(65_400)).toBe('01:05');
		expect(formatBatchDuration(-1000)).toBe('00:00');
	});
});
