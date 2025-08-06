import { strip_tags } from './strip_tags'


describe('strip_tags filter', () => {
	it('strips all tags', () => {
		expect(strip_tags('<p>Hello <b>world</b>!</p>')).toBe('Hello world!')
	});
	it('does not strip listed tags', () => {
		expect(strip_tags('<p>Hello <b>world</b>!</p>', '("b")')).toBe('Hello <b>world</b>!')
	});
});
