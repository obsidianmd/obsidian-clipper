import { strip_attr } from './strip_attr'


describe('strip_attr filter', () => {
	it('strips all attributes', () => {
		expect(strip_attr('<div class="test" id="example">Content</div>')).toBe('<div>Content</div>')
	});
	it('does not strip listed attributes', () => {
		// TODO example in the docs is incorrect
		expect(strip_attr('<div class="test" id="example">Content</div>', '("class")')).toBe('<div class="test">Content</div>')
	});
	it('strips attributes with spaces', () => {
		expect(strip_attr('<div class="p-4 m-2 bg-primary/50 focus:ring-ring w-[200px]>Content</div>')).toBe('<div>Content</div>');
	});
});
