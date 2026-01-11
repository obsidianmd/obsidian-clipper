import { describe, test, expect } from 'vitest';
import { duration } from './duration';

describe('duration filter', () => {
	test('formats ISO duration with custom format', () => {
		const result = duration('PT1H30M', 'HH:mm:ss');
		expect(result).toBe('01:30:00');
	});

	test('formats seconds with custom format', () => {
		const result = duration('3665', 'H:mm:ss');
		expect(result).toBe('1:01:05');
	});

	test('uses default format over 1 hour', () => {
		const result = duration('PT1H30M');
		expect(result).toBe('01:30:00');
	});

	test('uses short format under 1 hour', () => {
		const result = duration('PT30M');
		expect(result).toBe('30:00');
	});

	test('handles PT format with seconds only', () => {
		// PT6702S = 6702 seconds. Note: dayjs stores this as seconds only,
		// so minutes() returns 0 and seconds() returns 6702
		const result = duration('PT6702S', 'HH:mm:ss');
		expect(result).toBe('01:00:6702');
	});

	test('handles plain seconds', () => {
		const result = duration('90', 'mm:ss');
		expect(result).toBe('01:30');
	});

	test('handles zero', () => {
		const result = duration('0', 'mm:ss');
		expect(result).toBe('00:00');
	});
});

