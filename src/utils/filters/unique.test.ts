import { unique } from './unique'

describe('unique filter', () => {
	it('filters arrays of primitives', () => {
		expect(unique('[1,2,2,3,3]')).toBe('[1,2,3]');
	});
	it('filters array of objects', () => {
		expect(unique('[{"a":1},{"b":2},{"a":1}]')).toBe('[{"a":1},{"b":2}]');
	});
	it('filters objects\' properties, removing all but the last that have the same value', () => {
		expect(unique('{"a":1,"b":2,"c":1}')).toBe('{"b":2,"c":1}');
	});
	it('does not modify strings passed in', () => {
		expect(unique('hello')).toBe('hello');
	});
});
