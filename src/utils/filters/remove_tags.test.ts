import { remove_tags } from './remove_tags'


describe('remove_tags filter', () => {
	it('removes single tag', () => {
		expect(remove_tags('<p>Hello <b>world</b>!</p>', 'b')).toBe('<p>Hello world!</p>')

	});
	it('removes list of tags', () => {
		expect(remove_tags('<p>Hello <b>world</b>!</p>', '("b,p")')).toBe('Hello world!')
	});
});
