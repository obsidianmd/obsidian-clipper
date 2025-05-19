import { uncamel } from './uncamel'


describe('uncamel filter', () => {
	it('Converts camelCase to space-separated words', () => {
		expect(uncamel('camelCase')).toBe('camel case');
	});
	it('Converts PascalCase to space-separated words', () => {
		expect(uncamel('PascalCase')).toBe('pascal case');
	});
});
