import { join } from './join'


describe('join filter', () => {
	it('combines elements of an array into a string', () => {
		expect(join('["a","b","c"]')).toBe('a,b,c')
	});
	it('combines array with custom separator', () => {
		expect(join('["a","b","c"]', ' ')).toBe('a b c')
	});
});
