import { date } from './date'


describe('date filter', () => {
	it('converts example from docs correctly', () => {
		expect(date('12/01/2024', '"YYYY-MM-DD", "MM/DD/YYYY"')).toBe('2024-12-01');
	});
});
