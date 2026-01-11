import { describe, test, expect, summary } from './test-utils';
import { reverse } from './reverse';

describe('reverse filter', () => {
	test('reverses array', () => {
		const result = reverse('["a","b","c"]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['c', 'b', 'a']);
	});

	test('reverses string', () => {
		expect(reverse('hello')).toBe('olleh');
	});

	test('handles single element array', () => {
		const result = reverse('["only"]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual(['only']);
	});

	test('handles empty array', () => {
		expect(reverse('[]')).toBe('[]');
	});

	test('handles empty string', () => {
		expect(reverse('')).toBe('');
	});

	test('handles array of numbers', () => {
		const result = reverse('[1,2,3]');
		const parsed = JSON.parse(result);
		expect(parsed).toEqual([3, 2, 1]);
	});
});

summary();
