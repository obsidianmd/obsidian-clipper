import { calc } from './calc'


describe('calc filter', () => {
	it('handles examples from docs', () => {
        expect(calc('5', '"+10"')).toBe('15')
        expect(calc('2', '"**3"')).toBe('8')
	});
});
