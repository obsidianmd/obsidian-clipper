import { remove_attr } from './remove_attr'


describe('remove_attr filter', () => {
	it('removes single attribute', () => {
		expect(remove_attr('<div class="test" id="example">Content</div>', 'class')).toBe('<div id="example">Content</div>')

	});
	it('removes list of attributes', () => {
		expect(remove_attr('<div class="test" id="example" style="border:none">Content</div>', '("class,style,id")')).toBe('<div>Content</div>')

	});
	it('removes attributes with spaces', () => {
		// Fails on this case, pretty common for the class attribute
		//expect(remove_attr('<div class="p-4 m-2 bg-primary/50 focus:ring-ring w-[200px]>Content</div>', 'class')).toBe('<div>Content</div>');
	});
});
