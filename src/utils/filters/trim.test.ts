import { trim } from './trim'


describe('trim filter', () => {
	it('Removes white space from both ends of a string', () => {
		expect(trim(' hello world ')).toBe('hello world');
	});
});
