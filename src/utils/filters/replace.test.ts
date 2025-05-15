import { replace } from './replace'


describe('replace filter', () => {
	it('replaces simple docs examples', () => {
		// Interesting example, does nothing :D
		expect(replace('hello!', '",":""')).toBe('hello!');
		expect(replace('hello world', '("e":"a","o":"0")')).toBe('hall0 w0rld');
	});

	it('replaces regex docs examples', () => {
		expect(replace('hello world', '"/[aeiou]/g":"*"')).toBe('h*ll* w*rld');
		expect(replace('HELLO world', '"/hello/i":"hi"')).toBe('hi world');
		// Had to escape the \s, unlike the example in the docs
		expect(replace('hello world', '("/[aeiou]/g":"*","/\\s+/":"-")')).toBe('h*ll*-w*rld');
	});

	it('replacements are applied in the order specified', () => {
		expect(replace('hello world', '("e":"o","o":"0")')).toBe('h0ll0 w0rld');
	});
});
