import { duration } from './duration'


describe('duration filter', () => {
	it('converts docs examples', () => {
		expect(duration('PT1H30M', 'HH:mm:ss')).toBe('01:30:00');
		expect(duration('3665', 'H:mm:ss')).toBe('1:01:05');
	});
});
