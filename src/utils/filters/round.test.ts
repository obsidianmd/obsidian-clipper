import { round } from './round'


describe('round filter', () => {
	it('rounds to whole number', () => {
		expect(round('3.7')).toBe('4')
	});
	it('rounds to provided decimal places', () => {
		expect(round('3.14159', '2')).toBe('3.14')
	});
});
