import { capitalize } from './capitalize'


describe('capitalize filter', () => {
	it('Capitalizes the first character of the value and converts the rest to lowercase', () => {
		expect(capitalize('hELLO wORLD')).toBe('Hello world')
	});
});
