import { date_modify } from './date_modify'


describe('date_modify filter', () => {
	it('converts docs examples', () => {
		expect(date_modify('2024-12-01', '+1 year')).toBe('2025-12-01');
		expect(date_modify('2024-12-01', '-2 months')).toBe('2024-10-01');
	});
});
