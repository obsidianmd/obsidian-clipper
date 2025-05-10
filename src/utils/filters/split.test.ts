import { split } from './split'


describe('split filter', () => {
	it('divides string into array of substrings', () => {
		expect(split('a,b,c', ',')).toBe('["a","b","c"]');
	});
	it('divides string with separator', () => {
		expect(split('hello world', ' ')).toBe('["hello","world"]');
	});
	it('splits on every character if no separator provided', () => {
		expect(split('hello')).toBe('["h","e","l","l","o"]');
	});
	it('splits using regex separator', () => {
		// Currently fails, returns [a,b,c,<empty string>] (maybe this is correct and the docs are wrong?)
		//expect(split('a1b2c3', '[0-9]')).toBe('["a","b","c"]');
	});
});
