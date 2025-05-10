import { first } from './first'


describe('first filter', () => {
	it('returns first element in array', () => {
		expect(first('["a","b","c"]')).toBe('a')
	});
	it('does not modify input if it is not an array', () => {
		expect(first('{"a":1,"b":2}')).toBe('{"a":1,"b":2}')
	});
});
