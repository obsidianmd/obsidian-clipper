import { last } from './last'


describe('last filter', () => {
	it('returns last element in array', () => {
		expect(last('["a","b","c"]')).toBe('c')
	});
	it('does not modify input if it is not an array', () => {
		expect(last('{"a":1,"b":2}')).toBe('{"a":1,"b":2}')
		expect(last('hello')).toBe('hello')
	});
});
