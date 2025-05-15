import { nth } from './nth'


describe('nth filter', () => {
	it('keeps only the nth element', () => {
		expect(nth('["a","b","c"]', '3')).toBe('["c"]');
	});
	it('keeps every nth element when specified', () => {
		expect(nth('["a","b","c","d","e","f"]', '3n')).toBe('["c","f"]');
	});
	it('keeps the nth and all following elements with n+m', () => {
		expect(nth('["a","b","c","d","e","f"]', 'n+3')).toBe('["c","d","e","f"]');
	});
	it('keeps elements using group pattern syntax', () => {
		expect(nth('[1,2,3,4,5,6,7,8,9,10]', '1,2,3:5')).toBe('[1,2,3,6,7,8]');
	});
});
