import { date } from './date'


describe('date filter', () => {
	it('converts docs example', () => {
		expect(date('12/01/2024', '"YYYY-MM-DD", "MM/DD/YYYY"')).toBe('2024-12-01');
	});
});