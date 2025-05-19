import { length } from './length'


describe('length filter', () => {
	it('counts string length', () => {
		expect(length('hello')).toBe('5')
	});
	it('counts array length', () => {
		expect(length('["a","b","c"]')).toBe('3')
	});
	it('counts number of properties on objects', () => {
		expect(length('{"a":1,"b":2}')).toBe('2')
	});
});
