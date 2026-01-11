import { describe, test, expect, summary } from './test-utils';
import { image } from './image';

describe('image filter', () => {
	test('converts string to markdown image', () => {
		expect(image('image.jpg', 'alt text')).toBe('![alt text](image.jpg)');
	});

	test('handles URL without alt text', () => {
		expect(image('image.jpg')).toBe('![](image.jpg)');
	});

	test('handles array of images', () => {
		const result = image('["img1.jpg","img2.jpg"]', 'alt');
		expect(Array.isArray(result)).toBeTrue();
		expect((result as string[])[0]).toBe('![alt](img1.jpg)');
		expect((result as string[])[1]).toBe('![alt](img2.jpg)');
	});

	test('handles object with alt text values', () => {
		const result = image('{"img1.jpg": "Alt 1", "img2.jpg": "Alt 2"}');
		expect(Array.isArray(result)).toBeTrue();
	});

	test('handles empty string', () => {
		expect(image('')).toBe('');
	});

	test('escapes special characters in URL', () => {
		const result = image('image (1).jpg', 'alt');
		expect(result).toContain('image');
	});
});

summary();
